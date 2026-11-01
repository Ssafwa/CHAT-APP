import { generateToken, serializeUser } from "../lib/utils.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import cloudinary from "../lib/cloudinary.js";
import { io } from "../server.js";

// Signup a new user
export const signup = async (req, res) => {
  try {
    const body = req.body ?? {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const bio = typeof body.bio === "string" ? body.bio.trim() : "";

    if (!email || !fullName || !password || !bio) {
      return res.status(400).json({ success: false, message: "Please fill all the fields" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Enter a valid email address" });
    }
    if (fullName.length > 80 || bio.length > 500 || password.length < 6 || password.length > 128) {
      return res.status(400).json({ success: false, message: "Name, bio, or password is outside the allowed length" });
    }
    const user = await User.findOne({ email });

    if (user) {
      return res.status(409).json({ success: false, message: "Account already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      fullName, email, password: hashedPassword, bio
    });

    const token = generateToken(newUser._id);

    res.json({
      success: true,
      userData: serializeUser(newUser),
      token,
      message: "account created successfully"
    });
  } catch (error) {
    console.log(error.message);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "Account already exists" });
    }
    res.status(500).json({ success: false, message: "Unable to create account" });
  }
};

// controller to login a user
export const login = async (req, res) => {
  try {
    const body = req.body ?? {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }
    const userData = await User.findOne({ email });

    if (!userData) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, userData.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = generateToken(userData._id);

    res.json({
      success: true,
      userData: serializeUser(userData),
      token,
      message: "Login successful"
    });

  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: "Unable to log in" });
  }
};

// controller to check if user is authenticated
export const checkAuth = (req, res) => {
  res.json({ success: true, user: req.user });
};

// controller to update user profile details
export const updateProfile = async (req, res) => {
  try {
    const body = req.body ?? {};
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const bio = typeof body.bio === "string" ? body.bio.trim() : "";
    const { profilePic } = body;
    if (!fullName || !bio || fullName.length > 80 || bio.length > 500) {
      return res.status(400).json({ success: false, message: "Name and bio are required and must be within the allowed length" });
    }
    if (profilePic !== undefined && (typeof profilePic !== "string" || profilePic.length > 8_000_000)) {
      return res.status(400).json({ success: false, message: "Profile image is invalid or too large" });
    }
    const userId = req.user._id;
    let updatedUser;

    if (!profilePic) {
      updatedUser = await User.findByIdAndUpdate(userId, { bio, fullName }, { new: true, runValidators: true });
    } else {
      const upload = await cloudinary.uploader.upload(profilePic);
      updatedUser = await User.findByIdAndUpdate(
        userId,
        { profilePic: upload.secure_url, bio, fullName },
        { new: true, runValidators: true }
      );
    }

    // Keep hidden last-seen timestamps private even in profile update events.
    const publicUser = serializeUser(updatedUser);
    if (!publicUser.showLastSeen) publicUser.lastSeenAt = null;
    io.emit("profileUpdated", publicUser);

    res.json({ success: true, user: serializeUser(updatedUser) });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: "Unable to update profile" });
  }
};

export const updateLastSeenVisibility = async (req, res) => {
  try {
    const showLastSeen = req.body?.showLastSeen;
    if (typeof showLastSeen !== "boolean") {
      return res.status(400).json({ success: false, message: "Choose whether to show last seen" });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { showLastSeen },
      { new: true, runValidators: true }
    ).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const publicUser = serializeUser(user);
    if (!showLastSeen) publicUser.lastSeenAt = null;
    io.emit("profileUpdated", publicUser);
    return res.json({ success: true, user: serializeUser(user) });
  } catch (error) {
    console.error("Unable to update last-seen privacy:", error.message);
    return res.status(500).json({ success: false, message: "Unable to update privacy setting" });
  }
};