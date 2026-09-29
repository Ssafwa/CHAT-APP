import React, { useContext, useState } from 'react'
import assets from '../assets/assets'
import { AuthContext } from '../../context/AuthContext'

function LoginPage() {
 
    const [currState, setCUrrState] = useState("sign up")
    const [fullName, setFullName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [bio, setBio] = useState("")
    const [isDataSubmitted, setIsDataSubmitted] = useState(false);

    const { login } = useContext(AuthContext)

    const onSubmitHandler = (event) => {
      event.preventDefault();

      if (currState === 'sign up' && !isDataSubmitted) {
        setIsDataSubmitted(true)
        return;
      }

      login(currState === "sign up" ? 'signup' : 'login', {fullName, email, password, bio})
    }

  return (
  <div className='min-h-screen bg-[radial-gradient(circle_at_20%_20%,rgba(125,121,255,0.45),transparent_20%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.35),transparent_25%),#020817] bg-cover bg-center flex items-center justify-center gap-8 sm:justify-evenly max-sm:flex-col backdrop-blur-2xl'>

    {/* -------- left -------- */}
    <img src={assets.logo_big} alt="" className='w-[min(26vw,220px)] opacity-90 drop-shadow-[0_0_30px_rgba(147,112,255,0.55)]'/>

    {/* -------- right -------- */}

    <form onSubmit={onSubmitHandler} className='w-[min(90vw,420px)] border border-white/15 bg-white/5 backdrop-blur-xl text-white p-5 sm:p-6 flex flex-col gap-5 rounded-[28px] shadow-[0_0_30px_rgba(99,102,241,0.18)]'>
          <h2 className='font-semibold text-[clamp(2rem,3vw,2.5rem)] leading-none tracking-[-0.04em] flex justify-between items-center text-white/90'>
            {currState}
            {isDataSubmitted && <img onClick={()=> setIsDataSubmitted(false)} src={assets.arrow_icon} alt="" className='w-6 h-6 cursor-pointer opacity-80' />}
              

          </h2>

            
             {currState === "sign up" && !isDataSubmitted && (
              <input onChange={(e)=> setFullName(e.target.value)} value={fullName}
               type="text" className='w-full bg-transparent border border-white/25 rounded-xl px-4 py-3 text-base text-white placeholder:text-white/60 placeholder:font-normal focus:outline-none focus:border-white/45' placeholder="Full Name" required/>
             )}

             {!isDataSubmitted && (
              <>
                <input onChange={(e)=> setEmail(e.target.value)} value={email} 
                type="email" placeholder="Email Address" required 
                className='w-full bg-transparent border border-white/25 rounded-xl px-4 py-3 text-base text-white placeholder:text-white/60 placeholder:font-normal focus:outline-none focus:border-white/45'/>
                   
                   <input onChange={(e)=> setPassword(e.target.value)} value={password} 
                type="password" placeholder="Password" required 
                className='w-full bg-transparent border border-white/25 rounded-xl px-4 py-3 text-base text-white placeholder:text-white/60 placeholder:font-normal focus:outline-none focus:border-white/45'/>


              </>
            )}

            {currState === "sign up" && isDataSubmitted && (
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Write a short bio..."
                required
                className='w-full min-h-[96px] bg-transparent border border-white/25 rounded-xl px-4 py-3 text-base text-white placeholder:text-white/60 placeholder:font-normal focus:outline-none focus:border-white/45 resize-none'
              />
            )}

            <button type='submit' className='w-full py-3.5 bg-gradient-to-r from-violet-400 to-violet-500 text-white text-base font-semibold rounded-xl cursor-pointer shadow-[0_10px_25px_rgba(168,85,247,0.45)]'>
              {currState === "sign up" ? "Create Account" : "login now"}
            </button>

            <div className='flex items-center gap-3 text-white/80 text-base'>
              <input type="checkbox" className='h-4 w-4 accent-violet-400 rounded border-white/30 bg-transparent' />
              <p className='m-0'>Agree to use & privacy policy.</p>
            </div>

            <div className='flex flex-col gap-2'>
               {currState === "sign up" ? (
                <p className='text-sm text-gray-600'>Already have an account?
                 <span onClick={()=>{setCUrrState("login"); setIsDataSubmitted(false)}} className='font-medium text-violet-500 cursor-pointer'>Login here</span></p>
               ) : (
                <p className='text-sm text-gray-600'>Create an account 
                <span onClick={()=> setCUrrState("sign up")} className='font-medium text-violet-500 cursor-pointer'>Click here</span></p>
               )}
            </div>
           
    </form>
</div>
  )
}

export default LoginPage