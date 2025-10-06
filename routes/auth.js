// routes/auth.js
// Handles login, logout, and authentication for LiBrowse

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getOne, executeQuery } = require('../config/database'); // Correct path to database.js
require('dotenv').config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// ============================
// Helper: Generate JWT Token
// ============================
function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            student_no: user.student_no
        },
        JWT_SECRET,
        { expiresIn: '1h' } // expires in 1 hour
    );
}

// ============================
// Middleware: Authenticate JWT
// ============================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
        return res.status(401).json({ error: "No token provided" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid or expired token" });
        req.user = user;
        next();
    });
}

// ============================
// Login Route
// ============================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Check if user exists
        const user = await getOne("SELECT * FROM users WHERE email = ?", [email]);
        if (!user) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        // 2. Check if account is verified
        if (!user.is_verified) {
            return res.status(403).json({ error: "Account not verified" });
        }

        // 3. Validate password
        const isMatch = await bcrypt.compare(password, user.pass_hash);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        // 4. Generate JWT token
        const token = generateToken(user);

        // 5. Save token in DB for session management
        await executeQuery("UPDATE users SET ver_token = ? WHERE id = ?", [token, user.id]);

        return res.json({
            message: "Login successful",
            token,
            user: {
                id: user.id,
                email: user.email,
                student_no: user.student_no,
                fname: user.fname,
                lname: user.lname
            }
        });

    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: "Server error" });
    }
});

// ============================
// Logout Route
// ============================
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        // Clear token from DB
        await executeQuery("UPDATE users SET ver_token = NULL WHERE id = ?", [req.user.id]);
        return res.json({ message: "Logout successful" });
    } catch (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ error: "Server error" });
    }
});

// ============================
// Protected Profile Route
// ============================
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await getOne(
            "SELECT id, email, student_no, fname, lname FROM users WHERE id = ?",
            [req.user.id]
        );
        return res.json({ user });
    } catch (err) {
        console.error("Profile fetch error:", err);
        return res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
