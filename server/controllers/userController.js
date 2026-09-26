import { generateToken } from "../lib/utils.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";

// Signup a new user
export const signup = async (req, res) => {
  const { email, fullName, password, bio } = req.body;

     try {
        if (!email || !fullName || !password || !bio){
            return res.json({success: false, message: "Please fill all the fields"}); 
        }
        const user = await User.findOne({email});

        if(user){
            return res.json({success: false, message: "Account already exist"})
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            fullName, email, password: hashedPassword, bio
        });

        const token = generateToken(newUser._id);

        res.json({
            success: true,
            userData: newUser,
            token,
            message: "account created successfully"
        });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }

}

// controller to login a user
export const login = async (req, res) =>{
    try {
        const { email, password } = req.body;
        const userData = await User.findOne({email})

        const isPasswordCorrect = await bcrypt.compare(process, userData.password);

        if (!isPasswordCorrect){
            return res.json({ success: false, message: "Invalid credentials "}); 
        }
         const token = generateToken(userDatar._id);

        res.json({
            success: true,
            userData: newUser,
            token,
            message: "Login successful"})

    } catch (error) {
                console.log(error.message);
        res.json({ success: false, message: error.message });  
    }
}
 //              (2:48)