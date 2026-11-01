import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import assets from '../assets/assets'
import { formatMessageTime } from '../lib/utils'
import { chatContext } from '../../context/ChatContext'
import { AuthContext } from '../../context/AuthContext'
import toast from 'react-hot-toast'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

const ChatContainer = () => {
  const {
    messages,
    selectedUser,
    setSelectedUser,
    sendMessage,
    getMessages,
    loadOlderMessages,
    typingUserId,
    searchMessages,
    showMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    mutedConversations,
    setConversationMuted,
  } = useContext(chatContext)
  const { authUser, onlineUser, socket, axios } = useContext(AuthContext)
  const scrollEnd = useRef()
  const scrollArea = useRef()
  const selectedUserIdRef = useRef(selectedUser?._id)
  const pendingScrollHeight = useRef(null)
  const isPrependingMessages = useRef(false)
  const olderRequest = useRef(null)
  const typingTimeout = useRef()
  const [input, setInput] = useState('')
  const [historyState, setHistoryState] = useState(null)
  const [loadingOlderUserId, setLoadingOlderUserId] = useState(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editText, setEditText] = useState('')
  const [deleteOptionsId, setDeleteOptionsId] = useState(null)
  const [activeMessageActionsId, setActiveMessageActionsId] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchSubmitted, setSearchSubmitted] = useState(false)
  const jumpToMessageId = useRef(null)
  const selectedUserId = selectedUser?._id
  const hasOlderMessages = historyState?.userId === selectedUserId && historyState?.hasMore
  const isLoadingOlder = loadingOlderUserId === selectedUserId

  useEffect(() => {
    selectedUserIdRef.current = selectedUserId
  }, [selectedUserId])

  const handleSendMessage = async (event) => {
    event?.preventDefault()
    if (input.trim() === '') return
    const recipientId = selectedUserId
    const text = input.trim()
    const sent = await sendMessage({ text, replyTo: replyingTo?._id })
    if (sent && selectedUserIdRef.current === recipientId) {
      setInput((current) => current === text ? '' : current)
      setReplyingTo(null)
    }
    socket?.emit('typing', { receiverId: recipientId, isTyping: false })
  }

  const handleSendImage = async (event) => {
    const inputElement = event.currentTarget
    const file = inputElement.files?.[0]
    if (!file) return
    const recipientId = selectedUserId

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      toast.error('Choose a JPG, PNG, or WebP image')
      inputElement.value = ''
      return
    }
    if (file.size === 0) {
      toast.error('Choose a non-empty image')
      inputElement.value = ''
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error('Images must be 5 MB or smaller')
      inputElement.value = ''
      return
    }

    setIsUploadingImage(true)
    try {
      const { data: signatureData } = await axios.post('/api/messages/upload-signature')
      if (!signatureData.success) {
        throw new Error(signatureData.message || 'Image uploads are unavailable')
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', signatureData.apiKey)
      formData.append('timestamp', signatureData.timestamp)
      formData.append('signature', signatureData.signature)
      formData.append('folder', signatureData.folder)
      formData.append('allowed_formats', signatureData.allowedFormats)

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/image/upload`,
        { method: 'POST', body: formData }
      )
      const uploadData = await uploadResponse.json()
      if (!uploadResponse.ok || !uploadData.secure_url) {
        throw new Error(uploadData.error?.message || 'Image upload failed')
      }
      const sent = await sendMessage({
        image: uploadData.secure_url,
        replyTo: replyingTo?._id,
      }, recipientId)
      if (sent) setReplyingTo(null)
    } catch (error) {
      toast.error(error.response?.data?.message || error.message)
    } finally {
      setIsUploadingImage(false)
      inputElement.value = ''
    }
  }

  const handleLoadOlderMessages = async () => {
    if (!selectedUser || !messages.length || isLoadingOlder) return
    const userId = selectedUserId
    olderRequest.current?.abort()
    const controller = new AbortController()
    olderRequest.current = controller
    setLoadingOlderUserId(userId)
    pendingScrollHeight.current = scrollArea.current?.scrollHeight ?? null
    isPrependingMessages.current = true
    try {
      const data = await loadOlderMessages(userId, messages[0]._id, { signal: controller.signal })
      if (selectedUserIdRef.current === userId && data?.success) {
        setHistoryState({ userId, hasMore: data.hasMore })
      }
      if (!data?.success || !data.messages?.length) {
        pendingScrollHeight.current = null
        isPrependingMessages.current = false
      }
    } finally {
      setLoadingOlderUserId((current) => current === userId ? null : current)
    }
  }

  useEffect(() => {
    if (!selectedUserId) return undefined
    const controller = new AbortController()
    let active = true
    olderRequest.current?.abort()
    getMessages(selectedUserId, { signal: controller.signal }).then((data) => {
      if (active && data?.success) setHistoryState({ userId: selectedUserId, hasMore: data.hasMore })
    })
    return () => {
      active = false
      controller.abort()
      olderRequest.current?.abort()
    }
  }, [selectedUserId, getMessages])

  useLayoutEffect(() => {
    if (pendingScrollHeight.current !== null && scrollArea.current) {
      scrollArea.current.scrollTop += scrollArea.current.scrollHeight - pendingScrollHeight.current
      pendingScrollHeight.current = null
    }
  }, [messages])

  useEffect(() => {
    if (jumpToMessageId.current) {
      document.getElementById(`message-${jumpToMessageId.current}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      jumpToMessageId.current = null
      return
    }
    if (isPrependingMessages.current) {
      isPrependingMessages.current = false
      return
    }
    if (scrollEnd.current && messages.length) {
      scrollEnd.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  useEffect(() => () => clearTimeout(typingTimeout.current), [])

  const handleTyping = (value) => {
    setInput(value)
    if (!selectedUser || !socket) return
    socket.emit('typing', { receiverId: selectedUser._id, isTyping: value.length > 0 })
    clearTimeout(typingTimeout.current)
    if (value.length > 0) {
      typingTimeout.current = setTimeout(() => {
        socket.emit('typing', { receiverId: selectedUser._id, isTyping: false })
      }, 1200)
    }
  }

  const handleSearch = async (event) => {
    event.preventDefault()
    const query = searchQuery.trim()
    if (query.length < 2) {
      toast.error('Enter at least 2 characters to search')
      return
    }
    setIsSearching(true)
    setSearchSubmitted(true)
    setSearchResults(await searchMessages(selectedUserId, query))
    setIsSearching(false)
  }

  const handleEdit = async (message) => {
    if (await editMessage(message._id, editText)) {
      setEditingMessageId(null)
      setEditText('')
    }
  }

  const handleDelete = async (messageId, mode) => {
    if (await deleteMessage(messageId, mode)) {
      setDeleteOptionsId(null)
      setActiveMessageActionsId(null)
    }
  }

  const toggleMessageActions = (messageId) => {
    setActiveMessageActionsId((current) => current === messageId ? null : messageId)
  }

  const handleMessageKeyDown = (event, messageId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleMessageActions(messageId)
    }
  }

  const handleSearchResult = (message) => {
    jumpToMessageId.current = message._id
    showMessage(message)
    setSearchOpen(false)
  }

  const lastOwnMessageId = [...messages].reverse().find(
    (message) => message.senderId === authUser?._id
  )?._id

  return selectedUser ? (
    <div className='h-full min-h-0 flex flex-col backdrop-blur-lg relative overflow-hidden'>
      <div className='flex items-center gap-3 py-3 mx-4 border-b border-stone-500'>
        <img src={selectedUser.profilePic || assets.avatar_icon} alt='' className='w-8 rounded-full' />
        <div className='flex-1 text-white'>
          <p className='text-sm'>{selectedUser.fullName}</p>
          <p className='text-xs text-gray-400' aria-live='polite'>
            {typingUserId === selectedUser._id
              ? 'Typing…'
              : onlineUser.includes(selectedUser._id)
                ? 'Online'
                : selectedUser.lastSeenAt
                  ? `Last seen ${new Date(selectedUser.lastSeenAt).toLocaleString()}`
                  : 'Offline'}
          </p>
        </div>
        <button
          type='button'
          onClick={() => setConversationMuted(selectedUser._id, !mutedConversations[selectedUser._id])}
          aria-label={mutedConversations[selectedUser._id] ? 'Unmute this chat' : 'Mute this chat'}
          title={mutedConversations[selectedUser._id] ? 'Unmute this chat' : 'Mute this chat'}
          className='text-xs text-gray-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500'
        >
          {mutedConversations[selectedUser._id] ? 'Muted' : 'Sound on'}
        </button>
        <button
          type='button'
          onClick={() => {
            setSearchOpen((open) => !open)
            setSearchResults([])
            setSearchSubmitted(false)
          }}
          aria-label='Search messages in this chat'
          className='text-xs text-gray-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500'
        >
          Search
        </button>
        <button
          type='button'
          onClick={() => setSelectedUser(null)}
          aria-label='Back to conversations'
          className='md:hidden'
        >
          <img src={assets.arrow_icon} alt='' className='max-w-7' />
        </button>
        <img src={assets.help_icon} alt='' className='max-md:hidden max-w-5' />
      </div>

      {searchOpen && (
        <div className='p-3 border-b border-white/10 bg-[#282142]/80'>
          <form onSubmit={handleSearch} className='flex gap-2'>
            <input
              value={searchQuery}
              onChange={(event) => {
                setSearchSubmitted(false)
                setSearchQuery(event.target.value)
              }}
              placeholder='Search this conversation'
              aria-label='Search this conversation'
              maxLength={100}
              className='min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-violet-500'
            />
            <button type='submit' disabled={isSearching} className='text-sm text-white disabled:opacity-50'>
              {isSearching ? 'Searching…' : 'Find'}
            </button>
          </form>
          {searchResults.length > 0 && (
            <div className='mt-2 max-h-36 overflow-y-auto'>
              {searchResults.map((result) => (
                <button
                  key={result._id}
                  type='button'
                  onClick={() => handleSearchResult(result)}
                  className='block w-full truncate py-1 text-left text-xs text-gray-200 hover:text-white'
                >
                  {result.text} · {formatMessageTime(result.createdAt)}
                </button>
              ))}
            </div>
          )}
          {searchSubmitted && !isSearching && searchResults.length === 0 && (
            <p className='mt-2 text-xs text-gray-400'>No matching messages</p>
          )}
        </div>
      )}

      <div ref={scrollArea} className='flex-1 min-h-0 flex flex-col gap-4 p-4 bg-white/10 overflow-y-auto'>
        {hasOlderMessages && (
          <button
            type='button'
            onClick={handleLoadOlderMessages}
            disabled={isLoadingOlder}
            aria-live='polite'
            className='self-center text-xs text-gray-300 hover:text-white disabled:opacity-60'
          >
            {isLoadingOlder ? 'Loading…' : 'Load older messages'}
          </button>
        )}
        {messages.map((msg) => {
          const isOwnMessage = msg.senderId === authUser?._id
          const isLastOwnMessage = msg._id === lastOwnMessageId
          const reactions = (msg.reactions || []).reduce((groups, reaction) => {
            groups[reaction.emoji] = (groups[reaction.emoji] || 0) + 1
            return groups
          }, {})
          const myReaction = (msg.reactions || []).find(
            (reaction) => reaction.userId === authUser?._id
          )?.emoji

          return (
            <div
              key={msg._id}
              id={`message-${msg._id}`}
              className={`group flex items-end gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
            >
              {!isOwnMessage && (
                <div className='flex flex-col items-center text-[10px] text-gray-400 gap-1 shrink-0'>
                  <img
                    src={selectedUser.profilePic || assets.avatar_icon}
                    alt=''
                    className='w-7 rounded-full'
                  />
                </div>
              )}

              <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                {msg.replyTo && (
                  <div className='mb-1 max-w-[230px] rounded-lg border-l-2 border-violet-400 bg-black/20 px-2 py-1 text-xs text-gray-300'>
                    {msg.replyTo.deletedForEveryone
                      ? 'Original message was deleted'
                      : msg.replyTo.image ? 'Photo' : msg.replyTo.text}
                  </div>
                )}
                {editingMessageId === msg._id ? (
                  <div className='flex gap-2'>
                    <input
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                      maxLength={4000}
                      aria-label='Edit message'
                      className='min-w-0 rounded-lg bg-stone-800 px-3 py-2 text-sm text-white'
                    />
                    <button type='button' onClick={() => handleEdit(msg)} className='text-xs text-white'>Save</button>
                    <button type='button' onClick={() => setEditingMessageId(null)} className='text-xs text-gray-400'>Cancel</button>
                  </div>
                ) : msg.deletedForEveryone ? (
                  <p className='rounded-2xl bg-black/20 px-3 py-2 text-xs italic text-gray-400'>This message was deleted</p>
                ) : msg.image ? (
                  <img
                    src={msg.image}
                    alt='Shared image'
                    loading='lazy'
                    role='button'
                    tabIndex={0}
                    aria-label='Show image message actions'
                    aria-expanded={activeMessageActionsId === msg._id}
                    onClick={() => toggleMessageActions(msg._id)}
                    onKeyDown={(event) => handleMessageKeyDown(event, msg._id)}
                    className='max-w-[230px] max-h-[320px] object-contain border border-stone-700 rounded-2xl overflow-hidden shadow-md cursor-pointer'
                  />
                ) : (
                  <p
                    role='button'
                    tabIndex={0}
                    aria-label='Show message actions'
                    aria-expanded={activeMessageActionsId === msg._id}
                    onClick={() => toggleMessageActions(msg._id)}
                    onKeyDown={(event) => handleMessageKeyDown(event, msg._id)}
                    className={`max-w-[75%] p-2.5 md:text-sm font-light break-words rounded-2xl shadow-sm ${isOwnMessage
                      ? 'bg-violet-500/30 text-white rounded-br-none ml-auto cursor-pointer'
                      : 'bg-stone-800 text-white rounded-bl-none mr-auto cursor-pointer'}`}
                  >
                    {msg.text}
                  </p>
                )}

                <span className='mt-1 text-[10px] text-gray-400'>
                  {formatMessageTime(msg.createdAt)}
                  {msg.editedAt && <span className='ml-1 italic'>edited</span>}
                  {isLastOwnMessage && (
                    <span className='ml-2' aria-label={msg.seen ? 'Read' : msg.delivered ? 'Delivered' : 'Sent'}>
                      {msg.seen ? 'Seen' : msg.delivered ? 'Delivered' : 'Sent'}
                    </span>
                  )}
                </span>
                {Object.entries(reactions).length > 0 && (
                  <div className='mt-1 flex flex-wrap gap-1' aria-label='Message reactions'>
                    {Object.entries(reactions).map(([emoji, count]) => (
                      <span
                        key={emoji}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                          myReaction === emoji
                            ? 'border-violet-300/60 bg-violet-500/30 text-white'
                            : 'border-white/10 bg-black/25 text-gray-200'
                        }`}
                      >
                        <span>{emoji}</span>
                        {count > 1 && <span>{count}</span>}
                      </span>
                    ))}
                  </div>
                )}
                {!msg.deletedForEveryone && (
                  <div
                    role='group'
                    aria-label='Message actions'
                    className={`flex flex-wrap items-center gap-2 text-[10px] text-gray-300 overflow-hidden transition-[max-height,opacity] duration-150 ease-out max-h-0 opacity-0 pointer-events-none group-hover:max-h-24 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:max-h-24 group-focus-within:opacity-100 group-focus-within:pointer-events-auto ${
                      activeMessageActionsId === msg._id ? 'max-h-24 opacity-100 pointer-events-auto' : ''
                    }`}
                  >
                    <button type='button' onClick={() => setReplyingTo(msg)} className='hover:text-white'>Reply</button>
                    {isOwnMessage && msg.text && (
                      <button
                        type='button'
                        onClick={() => {
                          setEditingMessageId(msg._id)
                          setEditText(msg.text)
                        }}
                        className='hover:text-white'
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type='button'
                      onClick={() => setDeleteOptionsId(deleteOptionsId === msg._id ? null : msg._id)}
                      className='hover:text-white'
                    >
                      Delete
                    </button>
                    {deleteOptionsId === msg._id && (
                      <>
                        <button type='button' onClick={() => handleDelete(msg._id, 'me')} className='hover:text-white'>
                          For me
                        </button>
                        {isOwnMessage && (
                          <button type='button' onClick={() => handleDelete(msg._id, 'everyone')} className='hover:text-white'>
                            For everyone
                          </button>
                        )}
                      </>
                    )}
                    {['👍', '❤️', '😂', '😮', '😢', '🎉'].map((emoji) => (
                      <button
                        key={emoji}
                        type='button'
                        onClick={() => toggleReaction(msg._id, emoji)}
                        aria-label={`React with ${emoji}`}
                        aria-pressed={myReaction === emoji}
                        className={myReaction === emoji ? 'text-violet-300' : 'hover:text-white'}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {isOwnMessage && (
                <div className='flex flex-col items-center text-[10px] text-gray-400 gap-1 shrink-0'>
                  <img
                    src={authUser?.profilePic || assets.avatar_icon}
                    alt=''
                    className='w-7 rounded-full'
                  />
                </div>
              )}
            </div>
          )
        })}
        <div ref={scrollEnd}></div>
      </div>

      {replyingTo && (
        <div className='flex items-center justify-between gap-3 px-4 py-2 border-t border-white/10 bg-black/20 text-xs text-gray-300'>
          <span className='truncate'>
            Replying to: {replyingTo.deletedForEveryone ? 'Deleted message' : replyingTo.image ? 'Photo' : replyingTo.text}
          </span>
          <button type='button' onClick={() => setReplyingTo(null)} aria-label='Cancel reply' className='text-white'>×</button>
        </div>
      )}
      <form onSubmit={handleSendMessage} className='flex items-center gap-3 p-3 border-t border-white/10 bg-transparent backdrop-blur-sm'>
        <div className='flex items-center flex-1 bg-transparent rounded-full border border-white/10 backdrop-blur-sm'>
          <input
            onChange={(event) => handleTyping(event.target.value)}
            value={input}
            type='text'
            placeholder='Send a message'
            aria-label='Message'
            maxLength={4000}
            className='flex-1 text-sm p-3 bg-transparent border-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet-500 text-white placeholder:text-gray-400'
          />
          <input
            onChange={handleSendImage}
            type='file'
            id='image'
            accept='image/png, image/jpeg, image/webp'
            aria-label='Choose an image to send'
            disabled={isUploadingImage}
            hidden
          />
          <label
            htmlFor='image'
            aria-label='Choose an image to send'
            tabIndex={0}
            role='button'
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                document.getElementById('image')?.click()
              }
            }}
            className='focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500'
          >
            <img src={assets.gallery_icon} alt='' className='w-5 mr-2 cursor-pointer opacity-80' />
          </label>
        </div>
        <button
          type='submit'
          disabled={isUploadingImage || !input.trim()}
          aria-label='Send message'
          className='disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500'
        >
          <img src={assets.send_button} alt='' className='w-7 cursor-pointer' />
        </button>
      </form>
      {isUploadingImage && <span className='px-4 pb-2 text-xs text-gray-300' role='status'>Uploading image…</span>}
    </div>
  ) : (
    <div className='flex flex-col items-center justify-center gap-2 text-gray-500 bg-white/10 max-md:hidden'>
      <img src={assets.logo_icon} className='max-w-16' alt='' />
      <p className='text-lg font-medium text-white'>Chat anytime, anywhere</p>
    </div>
  )
}

export default ChatContainer
