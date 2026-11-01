import jwt from "jsonwebtoken";

// function to generat a token for a user
export const generateToken = (userId) => {
    const token = jwt.sign({userId}, process.env.JWT_SECRET);
    return token; 
    
}

export const serializeUser = (user) => {
    const userData = user.toObject ? user.toObject() : { ...user };
    delete userData.password;
    return userData;
}