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

        // 2. Validate password (allow unverified users to login to complete verification)
        // Note: Verification check removed to allow users to login and verify their account
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
        const dbUser = await getOne(
            `SELECT id, email, student_no, fname, lname, course, year, is_verified, credits 
             FROM users WHERE id = ?`,
            [req.user.id]
        );

        if (!dbUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Map DB fields to frontend-expected shape
        const user = {
            id: dbUser.id,
            email: dbUser.email,
            firstname: dbUser.fname,
            lastname: dbUser.lname,
            student_id: dbUser.student_no,
            program: dbUser.course,
            year: dbUser.year,
            is_verified: !!dbUser.is_verified,
            credits: dbUser.credits ?? 100,
        };

        // Basic stats placeholder (can be replaced with real aggregates later)
        const stats = {
            books_count: 0,
            transactions_count: 0,
            average_rating: 0,
            credits: user.credits,
        };

        return res.json({ user, stats });
    } catch (err) {
        console.error("Profile fetch error:", err);
        return res.status(500).json({ error: "Server error" });
    }
});

// ============================
// Register Route
// ============================
router.post('/register', async (req, res) => {
    try {
        const { email, student_no, fname, lname, password, course, year } = req.body;

        // Validate required fields
        if (!email || !student_no || !fname || !lname || !password || !course) {
            return res.status(400).json({ error: "All fields are required" });
        }

        // Validate PLV email
        if (!email.endsWith('@plv.edu.ph')) {
            return res.status(400).json({ error: "Please use your PLV email address" });
        }

        // Validate student ID format (e.g., 21-1234)
        const studentIdPattern = /^\d{2}-\d{4}$/;
        if (!studentIdPattern.test(student_no)) {
            return res.status(400).json({ error: "Invalid student ID format. Use format: 00-0000" });
        }

        // Check if user already exists
        const existingUser = await getOne(
            "SELECT id, is_verified FROM users WHERE email = ? OR student_no = ?",
            [email, student_no]
        );

        if (existingUser) {
            if (existingUser.is_verified) {
                return res.status(400).json({ error: "User already exists and is verified" });
            } else {
                // User exists but not verified - allow re-registration
                const hashedPassword = await bcrypt.hash(password, 12);
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

                await executeQuery(
                    `UPDATE users SET fname = ?, lname = ?, pass_hash = ?, course = ?, year = ?,
                     ver_token = ?, ver_token_expiry = ?, modified = NOW() WHERE email = ?`,
                    [fname, lname, hashedPassword, course, year || 1, otp, otpExpires, email]
                );

                return res.json({
                    message: "Registration updated! Please choose your verification method.",
                    userId: existingUser.id,
                    email: email,
                    requiresVerification: true
                });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Generate OTP for email verification
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Insert new user (unverified)
        const result = await executeQuery(
            `INSERT INTO users (email, student_no, fname, lname, pass_hash, course, year, 
             is_verified, verification_status, ver_token, ver_token_expiry, created)
             VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, 'pending', ?, ?, NOW())`,
            [email, student_no, fname, lname, hashedPassword, course, year || 1, otp, otpExpires]
        );

        return res.status(201).json({
            message: "Registration successful! Please choose your verification method.",
            userId: result.insertId,
            email: email,
            requiresVerification: true
        });

    } catch (err) {
        console.error("Registration error:", err);
        return res.status(500).json({ error: "Registration failed" });
    }
});

module.exports = router;
