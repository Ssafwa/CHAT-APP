import { useEffect, useRef } from 'react'
import assets, { messagesDummyData } from '../assets/assets'
import { formatMessageTime } from '../lib/utils'


const ChatContainer = ({ selectedUser, setSelectedUser }) => {

  const scrollEnd = useRef()

  useEffect(() => {
    if (scrollEnd.current) {
      scrollEnd.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [selectedUser])

  return selectedUser ? (
    <div className='h-full flex flex-col backdrop-blur-lg relative overflow-hidden'>

      {/* ----------- Chat Header ----------- */}

      <div className='flex items-center gap-3 py-3 mx-4 border-b border-stone-500'>
        <img src={assets.profile_martin} alt='' className='w-8 rounded-full' />
        <p className='flex-1 text-1 text-white flex item-center gap-2'>
          Martin Johnson
          <span className='w-2 h-2 rounded-full bg-green-500'></span>
        </p>
        <img onClick={() => setSelectedUser(null)} src={assets.arrow_icon} alt='' className='md:hidden max-w-7' />
        <img src={assets.help_icon} alt='' className='max-md:hidden max-w-5' />
      </div>

      {/* ----------- Chat Area ----------- */}

      <div className='flex-1 flex flex-col gap-4 p-4 bg-white/10 overflow-y-auto'>
        {messagesDummyData.map((msg, index) => {
          const isOwnMessage = msg.senderId === '680f50e4f10f3cd28382ecf9'

          return (
            <div
              key={index}
              className={`flex items-end gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
            >
              {!isOwnMessage && (
                <div className='flex flex-col items-center text-[10px] text-gray-400 gap-1 shrink-0'>
                  <img src={assets.avatar_icon} alt='' className='w-7 rounded-full' />
                </div>
              )}

              <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                {msg.image ? (
                  <img
                    src={msg.image}
                    alt=''
                    className='max-w-[230px] border border-stone-700 rounded-2xl overflow-hidden shadow-md'
                  />
                ) : (
                  <p
                    className={`max-w-[75%] p-2.5 md:text-sm font-light break-words rounded-2xl shadow-sm ${isOwnMessage
                      ? 'bg-violet-500/30 text-white rounded-br-none ml-auto'
                      : 'bg-stone-800 text-white rounded-bl-none mr-auto'}`}
                  >
                    {msg.text}
                  </p>
                )}

                <span className='mt-1 text-[10px] text-gray-400'>
                  {msg.createdAt}
                </span>
              </div>

              {isOwnMessage && (
                <div className='flex flex-col items-center text-[10px] text-gray-400 gap-1 shrink-0'>
                  <img src={assets.profile_martin} alt='' className='w-7 rounded-full' />
                  <p className='text-gray-500'>{formatMessageTime(msg.createdAt)}</p>
                </div>
              )}
            </div>
          )
        })}
        <div ref={scrollEnd}></div>
      </div>

      {/* -------- bottom area --------- */}
      <div className='flex items-center gap-3 p-3 border-t border-white/10 bg-transparent backdrop-blur-sm'>
        <div className='flex items-center flex-1 bg-transparent rounded-full border border-white/10 backdrop-blur-sm'>
          <input
            type='text'
            placeholder='Send a message'
            className='flex-1 text-sm p-3 bg-transparent border-none rounded-full outline-none text-white placeholder:text-gray-400'
          />
          <input type='file' id='image' accept='image/png, image/jpeg' hidden />
          <label htmlFor='image'>
            <img src={assets.gallery_icon} alt='' className='w-5 mr-2 cursor-pointer opacity-80' />
          </label>
        </div>
        <img src={assets.send_button} alt='' className='w-7 cursor-pointer' />
      </div>
    </div>
  ) : (
    <div className='flex flex-col items-center justify-center gap-2 text-gray-500 bg-white/10 max-md:hidden'>
      <img src={assets.logo_icon} className='max-w-16' alt='' />
      <p className='text-lg font-medium text-white'>Chat anytime, anywhere</p>
    </div>
  )
}

export default ChatContainer
