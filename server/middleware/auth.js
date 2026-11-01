import User from "../models/User.js";
import jwt from "jsonwebtoken"
// midle ware to protect rouytes

export const protectRoute = async (req, res, next) => {
    try {
        const token = req.headers.token;
        if (!token) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        const user = await User.findById(decoded.userId).select("-password");

        if (!user) return res.status(401).json({ success: false, message: "User not found" });

        req.user = user;
        next();
    } catch (error) {
        console.log(error.message);
        res.status(401).json({ success: false, message: "Invalid or expired authentication token" });
    }
}