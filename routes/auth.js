// routes/auth.js
// Handles login, logout, and authentication for LiBrowse

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { getOne, executeQuery } = require('../config/database'); // Correct path to database.js
require('dotenv').config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY || '';

async function verifyCaptcha(token) {
    // If not configured, allow by default
    if (!RECAPTCHA_SECRET) return true;
    if (!token) return false;
    try {
        const params = new URLSearchParams();
        params.append('secret', RECAPTCHA_SECRET);
        params.append('response', token);
        const { data } = await axios.post('https://www.google.com/recaptcha/api/siteverify', params);
        return !!data.success;
    } catch (e) {
        console.error('reCAPTCHA verify error:', e.message);
        return false;
    }
}

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
        const { email, password, captcha_token } = req.body;

        // Verify CAPTCHA if enabled
        const captchaOk = await verifyCaptcha(captcha_token);
        if (!captchaOk) {
            return res.status(400).json({ error: 'Invalid CAPTCHA' });
        }

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
        const { email, student_no, fname, lname, password, course, year, captcha_token } = req.body;

        // Verify CAPTCHA if enabled
        const captchaOk = await verifyCaptcha(captcha_token);
        if (!captchaOk) {
            return res.status(400).json({ error: 'Invalid CAPTCHA' });
        }

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

// ============================
// EMAIL OTP VERIFICATION
// ============================
const nodemailer = require("nodemailer");

// Generate random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP via PLV email
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    console.log("Attempting to send OTP to:", email);
    
    if (!email.endsWith("@plv.edu.ph")) {
      return res.status(400).json({ error: "Must use PLV email" });
    }

    const user = await getOne("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) return res.status(404).json({ error: "User not found" });

    const otp = generateOTP();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await executeQuery("UPDATE users SET ver_token = ?, ver_token_expiry = ? WHERE email = ?", [otp, expiry, email]);

    // Configure your email transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // e.g., your Gmail
        pass: process.env.EMAIL_PASSWORD
      }
    });

    await transporter.sendMail({
      from: `"LiBrowse Verification" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your LiBrowse OTP Code",
      html: `<h2>Your OTP Code</h2><p>Your one-time password is <b>${otp}</b>.</p><p>This code expires in 10 minutes.</p>`
    });

    return res.json({ message: "OTP sent to your PLV email" });
  } catch (err) {
    console.error("OTP send error:", err);
    return res.status(500).json({ error: "Failed to send OTP" });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await getOne("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.ver_token !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (new Date() > new Date(user.ver_token_expiry)) {
      return res.status(400).json({ error: "OTP expired" });
    }

    await executeQuery("UPDATE users SET is_verified = TRUE, ver_token = NULL, ver_token_expiry = NULL WHERE email = ?", [email]);
    return res.json({ message: "Email verified successfully" });
  } catch (err) {
    console.error("OTP verify error:", err);
    return res.status(500).json({ error: "Failed to verify OTP" });
  }
});
module.exports = router;
