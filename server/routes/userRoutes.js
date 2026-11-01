import express from "express";
import { checkAuth, login, signup, updateLastSeenVisibility, updateProfile } from "../controllers/userController.js";
import { protectRoute } from "../middleware/auth.js";

const userRouter = express.Router();

userRouter.post("/signup", signup);
userRouter.post("/login", login);
userRouter.put("/update-profile", protectRoute, updateProfile);
userRouter.put("/last-seen-visibility", protectRoute, updateLastSeenVisibility);
userRouter.get("/check", protectRoute, checkAuth);

export default userRouter;