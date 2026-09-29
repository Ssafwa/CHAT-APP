import { createContext, useState, useEffect } from "react";
import axios from 'axios'
import toast from "react-hot-toast";
import {io} from "socket.io-client"

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
            connectSocket(data.user)
        }
    } catch (error) {
        toast.error(error.message)
        
    }
   }
// login function to handle user authenthcating and socket connection

    const login = async (state, credentials) => {
    try {
        const { data } = await axios.post(`/api/auth/${state}`, credentials);
        if (data.success) {
            setAuthUser(data.userData);
            connectSocket(data.userData);
            axios.defaults.headers.common["token"] = data.token;
            setToken(data.token);
            localStorage.setItem("token", data.token)
            toast.success(data.message)
        } else {
            toast.error(data.message)     // fixed: use "data" from the response
        }
    } catch (error) {
        toast.error(error.message)        // fixed: use "error" from the catch
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
    socket.disconnect();
 }
   /// uppdtae profile function to handle user profile update
   const updateProfile = async (body)=>{
    try {
        const { data } = await axios.put("/api/auth/update-profile", body);
        if(data.success){
            setAuthUser(data.user);
            toast.success("profile updated successfully")
        }
    } catch (error) {
        toast.error(error.message)
    }
   }


   // connect socket function to handle socket connecion and online users updates
   const connectSocket = (userData) => {
      if(!userData || socket?.connected) return;
      const newSocket = io(backendUrl, {
        query: {
            userId: userData._id,
        }
      });
      newSocket.connect();
      setsocket(newSocket);

      newSocket.on("getOnlineUsers", (users) => {
        setonlineUser(users);
      })
   }

   useEffect(() =>{
    if(token){
        axios.defaults.headers.common['token'] = token;
    }
    checkAuth();
   },[]);

   const value = {
       axios,
       authUser,
       onlineUser,
       socket,
       login,
       logout,
       updateProfile

   }

   return (
       <AuthContext.Provider value={value}>
         {children}
       </AuthContext.Provider>
   )
}