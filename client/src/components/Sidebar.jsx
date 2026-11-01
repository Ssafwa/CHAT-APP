import React, { useContext, useEffect, useState } from 'react'
import assets from '../assets/assets'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../../context/AuthContext'
import { chatContext } from '../../context/ChatContext'

const Sidebar = () => {


    const {getUser, users, selectedUser, setSelectedUser, 
        unseenMessages, setUnseenMessages, soundEnabled, setSoundPreference } = useContext(chatContext)

    const {logout, onlineUser, authUser} = useContext(AuthContext)

    const [input, setInput] = useState("")
    const [menuOpen, setMenuOpen] = useState(false)
     
    const navigate = useNavigate();

    const filteredUsers = input ? users.filter((user)=>user.fullName.toLowerCase().
     includes(input.toLowerCase())) : users;

     useEffect(()=>{
        getUser();
     },[onlineUser, getUser])

  return (
    <div className={`bg-[#8185B2]/10 h-full p-5 rounded-r-xl overflow-y-scroll
                     text-white ${selectedUser ? "max-md:hidden" : ''}`}>
        <div className='pb-5'>
            <div className='flex justify-between items-center'>
                 <img src={assets.logo} alt="logo" className='max-w-40'/>
                 <div className='relative py-2 group'>
                    <button
                        type="button"
                        onClick={() => setMenuOpen((open) => !open)}
                        aria-label="Open account menu"
                        aria-expanded={menuOpen}
                        aria-controls="account-menu"
                        className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
                    >
                        <img src={assets.menu_icon} alt="" className='max-h-5 cursor-pointer'/>
                    </button>
                     <div id="account-menu" className={`absolute top-full right-0 z-20 w-32 p-5 rounded-md
                                      bg-[#282142] border border-gray-600 text-gray-100 hidden
                                      group-hover:block ${menuOpen ? 'block' : ''}`}>
                        <button type="button" onClick={()=>{setMenuOpen(false); navigate('/profile')}} className='cursor-pointer text-sm'>Edit Profile</button>
                        <hr className="my-2 border-t border-gray-500" />
                        <button type="button" onClick={()=>setSoundPreference(!soundEnabled)} className='cursor-pointer text-sm'>
                            {soundEnabled ? 'Mute notification sound' : 'Enable notification sound'}
                        </button>
                        <hr className="my-2 border-t border-gray-500" />
                        <button type="button" onClick={()=>{setMenuOpen(false); logout()}} className='cursor-pointer text-sm'>Logout</button>
                     </div>
                 </div>
            </div>

            <div className='bg-[#282142] rounded-full flex items-center gap-2 py-3 px-4 mt-5'>
                <img src={assets.search_icon} alt="" className='w-3'/>
                <input onChange={(e)=>setInput(e.target.value)}
                    type="text"
                    placeholder="Search users..."
                    aria-label="Search users"
                    className='bg-transparent border-none outline-none focus-visible:ring-2 focus-visible:ring-violet-500 text-white text-xs placeholder-[#c8c8c8] flex-1'
                />
            </div>

        </div>

        <div className='flex flex-col'>
            {filteredUsers.map((user)=>(
                <button type="button" onClick={()=> {setSelectedUser(user); setUnseenMessages(prev=>
                ({...prev, [user._id]:0}))}}
                key={user._id} aria-pressed={selectedUser?._id === user._id}
                aria-label={`Open chat with ${user.fullName}`}
                className={`relative flex items-center gap-2 p-2 pl-4 rounded cursor-pointer max-sm:text-sm text-left w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 ${selectedUser?._id === user._id && 'bg-[#282142]/50'}`}>
                    <img src={user?.profilePic || assets.avatar_icon} alt="" 
                    className='w-[35px] aspect-[1/1] rounded-full'/>
                    <div className='flex flex-col leading-5 min-w-0 flex-1'>
                        <span className='truncate'>{user.fullName}</span>
                        {onlineUser.includes(user._id) && <span className='text-green-400 text-[10px]'>Online</span>}
                        <span className='text-xs text-neutral-300 truncate'>
                            {user.lastMessage
                                ? `${user.lastMessage.senderId === authUser?._id ? "You: " : ""}${user.lastMessage.deletedForEveryone ? "Message deleted" : user.lastMessage.image ? "Photo" : user.lastMessage.text}`
                                : "No messages yet"}
                        </span>
                    </div>
                    {unseenMessages[user._id] > 0  && <p className='absolute top-4 right-4 text-xs h-5 w-5
                             flex justify-center items-center rounded-full bg-violet-500/50'>{unseenMessages[user._id]}</p>}
                </button>
            ))}
        </div>
     
    </div>
  )
}

export default Sidebar

    