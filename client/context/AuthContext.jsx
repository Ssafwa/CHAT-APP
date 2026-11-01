import { createContext, useState, useEffect } from "react";
import axios from 'axios'
import toast from "react-hot-toast";
import {io} from "socket.io-client"
import { enableNotificationSound } from "../src/lib/notificationSound";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
axios.defaults.baseURL = backendUrl

export const AuthContext = createContext();

export const AuthProvider = ({ children })=>{


    const [token, setToken] = useState(localStorage.getItem('token') || null);
    const [authUser, setAuthUser] = useState(null);
    const [onlineUser, setonlineUser] = useState([]);
    const [socket, setsocket] = useState(null);

// check if user is authentica and if so set the user data and connecte the socket
   const checkAuth = async () => {
    try {
        const { data } = await axios.get("/api/auth/check")
        if (data.success){
            setAuthUser(data.user)
            connectSocket(data.user, token)
        }
    } catch (error) {
        toast.error(error.response?.data?.message || error.message)
        
    }
   }
// login function to handle user authenthcating and socket connection

    const login = async (state, credentials) => {
    try {
        const { data } = await axios.post(`/api/auth/${state}`, credentials);
        if (data.success) {
            setAuthUser(data.userData);
            connectSocket(data.userData, data.token);
            axios.defaults.headers.common["token"] = data.token;
            setToken(data.token);
            localStorage.setItem("token", data.token)
            toast.success(data.message)
        } else {
            toast.error(data.message)     // fixed: use "data" from the response
        }
    } catch (error) {
        toast.error(error.response?.data?.message || error.message)
    }
}

    // logout function to handle user and socket disconnection

 const logout = async () =>{
    localStorage.removeItem("token");
    setToken(null);
    setAuthUser(null);
    setonlineUser([]);
    axios.defaults.headers.common["token"] = null;
    toast.success("Logged out successfully")
    if (socket) socket.disconnect();
    setsocket(null);
 }
   /// uppdtae profile function to handle user profile update
   const updateProfile = async (body)=>{
    try {
        const { data } = await axios.put("/api/auth/update-profile", body);
        if(data.success){
            setAuthUser(data.user);
            toast.success("profile updated successfully")
    } else {
            toast.error(data.message)
        }
    } catch (error) {
        toast.error(error.response?.data?.message || error.message)
    }
}

   const updateLastSeenVisibility = async (showLastSeen)=>{
    try {
        const { data } = await axios.put("/api/auth/last-seen-visibility", { showLastSeen });
        if(data.success){
            setAuthUser(data.user);
            return true;
        }
        toast.error(data.message);
    } catch (error) {
        toast.error(error.response?.data?.message || error.message);
    }
    return false;
}

   // connect socket function to handle socket connecion and online users updates
   const connectSocket = (userData, accessToken = token) => {
      if(!userData || !accessToken || socket?.connected) return;
      const newSocket = io(backendUrl, {
        auth: {
            token: accessToken,
        }
      });
      newSocket.connect();
      setsocket(newSocket);

      newSocket.on("getOnlineUsers", (users) => {
        setonlineUser(users);
      })
   }

   useEffect(() =>{
    const enableSound = () => {
        enableNotificationSound();
    };
    document.addEventListener("pointerdown", enableSound);
    document.addEventListener("keydown", enableSound);

    if(token){
        axios.defaults.headers.common['token'] = token;
        checkAuth();
    }

    return () => {
        document.removeEventListener("pointerdown", enableSound);
        document.removeEventListener("keydown", enableSound);
    };
   },[]);

   const value = {
       axios,
       authUser,
       onlineUser,
       socket,
       login,
       logout,
       updateProfile,
       updateLastSeenVisibility,

   }

   return (
       <AuthContext.Provider value={value}>
         {children}
       </AuthContext.Provider>
   )
}