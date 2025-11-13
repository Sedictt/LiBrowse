// routes/auth.js
// Handles login, logout, and authentication for LiBrowse

const express = require('express');
const crypto = require("crypto");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { getOne, executeQuery } = require('../config/database'); // Correct path to database.js
require('dotenv').config();
const { sendMail } = require('../services/mailer');
const path = require('path');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY || '';
const RECAPTCHA_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || '';

async function verifyCaptcha(token) {
  // If not fully configured, allow by default (align with frontend enablement)
  if (!RECAPTCHA_SECRET || !RECAPTCHA_SITE_KEY) return true;
  if (!token || token === 'dev-mode-skip') return false; // frontend shouldn't send this when enabled
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
        lname: user.lname,
        is_verified: !!user.is_verified,
        email_verified: !!user.email_verified,
        verification_status: user.verification_status,
        verification_method: user.verification_method
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
    let dbUser;
    try {
      dbUser = await getOne(
        `SELECT id, email, student_no, fname, lname, course, year, 
                is_verified, email_verified, credits, verification_status, verification_method,
                profile_pic, bio
         FROM users WHERE id = ?`,
        [req.user.id]
      );
    } catch (e) {
      const msg = (e && (e.sqlMessage || e.message || '')).toLowerCase();
      if (e && e.code === 'ER_BAD_FIELD_ERROR' && msg.includes('email_verified')) {
        // Fallback for DBs without email_verified column
        dbUser = await getOne(
          `SELECT id, email, student_no, fname, lname, course, year, 
                  is_verified, credits, verification_status, verification_method,
                  profile_pic, bio
           FROM users WHERE id = ?`,
          [req.user.id]
        );
        dbUser.email_verified = 0;
      } else {
        throw e;
      }
    }

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
      email_verified: !!dbUser.email_verified,
      verification_status: dbUser.verification_status,
      verification_method: dbUser.verification_method,
      credits: dbUser.credits ?? 100,
      profileimage: dbUser.profile_pic || null,
      bio: dbUser.bio || ''
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

    // Insert new user (unverified) with 100 default credits
    const result = await executeQuery(
      `INSERT INTO users (email, student_no, fname, lname, pass_hash, course, year, 
             is_verified, verification_status, ver_token, ver_token_expiry, credits, created)
             VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, 'pending', ?, ?, 100, NOW())`,
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
// Using unified mailer with Gmail primary, SendGrid fallback

// Generate random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate random verification link token
function generateVerificationToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

// Derive a 6-digit OTP from the verification token (no extra DB column needed)
function deriveOtpFromToken(token, email) {
  try {
    const base = `${token}|${email || ''}`;
    const hash = crypto.createHash('sha256').update(base).digest('hex');
    const num = parseInt(hash.slice(0, 8), 16); // use first 4 bytes
    return (num % 1000000).toString().padStart(6, '0');
  } catch (_) {
    // Fallback in case of unexpected input
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}

// Send OTP via PLV email
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    const startTs = Date.now();
    console.log(`[OTP] send-otp: request received`, { email, env: process.env.NODE_ENV });

    if (!email.endsWith("@plv.edu.ph")) {
      console.warn(`[OTP] send-otp: rejected non-PLV email`, { email });
      return res.status(400).json({ error: "Must use PLV email" });
    }

    const user = await getOne("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) {
      console.warn(`[OTP] send-otp: user not found`, { email });
      return res.status(404).json({ error: "User not found" });
    }
    console.log(`[OTP] send-otp: user found`, { id: user.id, verified: !!user.is_verified });

    const verificationToken = generateVerificationToken();
    const otp = deriveOtpFromToken(verificationToken, email);
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    console.log(`[OTP] send-otp: OTP and verification token generated`, {
      otp: process.env.NODE_ENV === 'production' ? '******' : otp,
      token: process.env.NODE_ENV === 'production' ? '******' : verificationToken.substring(0, 8) + '...',
      expiresAt: expiry.toISOString()
    });

    try {
      await executeQuery("UPDATE users SET ver_token = ?, ver_token_expiry = ? WHERE email = ?", [verificationToken, expiry, email]);
      console.log(`[OTP] send-otp: DB updated with verification token+expiry`);
    } catch (dbErr) {
      console.error(`[OTP] send-otp: failed to update DB`, { error: dbErr.message });
      throw dbErr;
    }

    // Build verification link
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const verificationLink = `${baseUrl}/api/auth/verify-link?token=${verificationToken}&email=${encodeURIComponent(email)}`;

    // Build message with modern design
    const subject = "Verify Your LiBrowse Account";
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif; line-height: 1.6; color: #1f2937; background-color: #f9fafb; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07); }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; }
          .header-logo { font-size: 28px; font-weight: 800; color: white; margin: 0; letter-spacing: -0.5px; }
          .header-subtitle { font-size: 14px; color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; }
          .content { padding: 40px 30px; }
          .greeting { font-size: 20px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; }
          .message { font-size: 15px; color: #4b5563; margin: 0 0 24px 0; line-height: 1.7; }
          .cta-button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 24px 0; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); }
          .cta-button:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(102, 126, 234, 0.6); }
          .backup-section { background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 28px 0; border-left: 4px solid #667eea; }
          .backup-label { font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0; }
          .backup-code { font-size: 24px; font-weight: 700; color: #1f2937; font-family: 'Monaco', 'Courier New', monospace; letter-spacing: 2px; margin: 0; }
          .backup-hint { font-size: 13px; color: #6b7280; margin: 12px 0 0 0; }
          .divider { height: 1px; background-color: #e5e7eb; margin: 28px 0; }
          .footer { background-color: #f9fafb; padding: 24px 30px; border-top: 1px solid #e5e7eb; text-align: center; }
          .footer-text { font-size: 12px; color: #6b7280; margin: 0; line-height: 1.6; }
          .footer-link { color: #667eea; text-decoration: none; font-weight: 600; }
          .expiry-badge { display: inline-block; background-color: #fef3c7; color: #92400e; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; margin: 16px 0; }
          .security-note { font-size: 12px; color: #6b7280; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <div class="header">
            <h1 class="header-logo">📚 LiBrowse</h1>
            <p class="header-subtitle">Smart Academic Book Exchange for PLV</p>
          </div>

          <!-- Content -->
          <div class="content">
            <h2 class="greeting">Welcome to LiBrowse! 🎓</h2>
            <p class="message">
              Thank you for joining our community of PLV students! To get started and unlock all features, please verify your email address by clicking the button below.
            </p>

            <!-- CTA Button -->
            <div style="text-align: center;">
              <a href="${verificationLink}" class="cta-button">✓ Verify My Email</a>
              <div class="expiry-badge">⏱️ Expires in 10 minutes</div>
            </div>

            <p class="message" style="margin-top: 28px; font-size: 14px; color: #6b7280;">
              If the button above doesn't work, you can also use the backup code below:
            </p>

            <!-- Backup Code Section -->
            <div class="backup-section">
              <p class="backup-label">Backup Verification Code</p>
              <p class="backup-code">${otp}</p>
              <p class="backup-hint">Enter this code in the app if the link doesn't work</p>
            </div>

            <div class="divider"></div>

            <!-- Why Verify -->
            <div style="background-color: #f0f9ff; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <p style="font-size: 13px; color: #0c4a6e; margin: 0; font-weight: 600;">✨ What you get after verification:</p>
              <ul style="font-size: 13px; color: #0c4a6e; margin: 8px 0 0 0; padding-left: 20px;">
                <li>Browse and search academic books</li>
                <li>Request books from other students</li>
                <li>Build your reputation with ratings</li>
                <li>Access exclusive student community</li>
              </ul>
            </div>
          </div>

          <!-- Footer -->
          <div class="footer">
            <p class="footer-text">
              Questions? <a href="mailto:support@librowse.com" class="footer-link">Contact our support team</a>
            </p>
            <p class="footer-text">
              If you didn't create this account, you can safely ignore this email.
            </p>
            <p class="footer-text" style="margin-top: 16px; font-size: 11px; color: #9ca3af;">
              © 2025 LiBrowse. All rights reserved. | For PLV Students Only
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
    const text = `Welcome to LiBrowse!\n\nVerify your email: ${verificationLink}\n\nBackup code: ${otp}\n\nBoth expire in 10 minutes.\n\nQuestions? Contact support@librowse.com`;

    const mailResult = await sendMail({
      to: email,
      subject,
      html,
      text,
      replyTo: process.env.EMAIL_USER
    });

    console.log(`[OTP] send-otp: mail result`, mailResult);
    if (!mailResult.ok) {
      return res.status(502).json({ error: "Failed to send OTP email", details: mailResult.details || mailResult.error });
    }
    console.log(`[OTP] send-otp: completed in ${Date.now() - startTs}ms`);
    return res.json({ message: "OTP sent to your PLV email" });
  } catch (err) {
    console.error("[OTP] send-otp: error", err);
    return res.status(500).json({ error: "Failed to send OTP" });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    console.log(`[OTP] verify-otp: request received`, { email, otp: process.env.NODE_ENV === 'production' ? '******' : otp });
    const user = await getOne("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) {
      console.warn(`[OTP] verify-otp: user not found`, { email });
      return res.status(404).json({ error: "User not found" });
    }

    // Accept either: (a) derived OTP from hex token, or (b) legacy direct OTP stored in ver_token
    const verToken = user.ver_token || '';
    const isHexToken = /^[a-f0-9]{64}$/i.test(String(verToken));
    const expectedOtp = isHexToken ? deriveOtpFromToken(verToken, email) : String(verToken);
    if (String(otp) !== String(expectedOtp)) {
      console.warn(`[OTP] verify-otp: invalid otp`, { email });
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (new Date() > new Date(user.ver_token_expiry)) {
      console.warn(`[OTP] verify-otp: expired otp`, { email, expiry: user.ver_token_expiry });
      return res.status(400).json({ error: "OTP expired" });
    }

    try {
      // Mark verification via OTP; account is considered Verified when either method is done
      try {
        await executeQuery(
          "UPDATE users SET email_verified = 1, verification_method = 'otp', is_verified = 1, ver_token = NULL, ver_token_expiry = NULL WHERE email = ?",
          [email]
        );
      } catch (e) {
        const msg = (e && (e.sqlMessage || e.message || '')).toLowerCase();
        if (e && e.code === 'ER_BAD_FIELD_ERROR' && msg.includes('email_verified')) {
          // Fallback for DBs without email_verified column
          await executeQuery(
            "UPDATE users SET verification_method = 'otp', is_verified = 1, ver_token = NULL, ver_token_expiry = NULL WHERE email = ?",
            [email]
          );
        } else {
          throw e;
        }
      }
      console.log(`[OTP] verify-otp: email marked verified`, { email });
      return res.json({ message: "Email verified successfully" });
    } catch (dbErr) {
      console.error(`[OTP] verify-otp: failed to update user verification`, { error: dbErr.message });
      throw dbErr;
    }
  } catch (err) {
    console.error("[OTP] verify-otp: error", err);
    return res.status(500).json({ error: "Failed to verify OTP" });
  }
});

// Verify email via link (primary method)
router.get("/verify-link", async (req, res) => {
  try {
    const { token, email } = req.query;
    console.log(`[OTP] verify-link: request received`, { email, token: process.env.NODE_ENV === 'production' ? '******' : token?.substring(0, 8) + '...' });

    if (!token || !email) {
      console.warn(`[OTP] verify-link: missing token or email`, { token: !!token, email: !!email });
      return res.redirect(302, '/?verify_error=missing');
    }

    const user = await getOne("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) {
      console.warn(`[OTP] verify-link: user not found`, { email });
      return res.redirect(302, '/?verify_error=not_found');
    }

    if (user.ver_token !== token) {
      console.warn(`[OTP] verify-link: invalid token`, { email });
      return res.redirect(302, '/?verify_error=invalid');
    }

    if (new Date() > new Date(user.ver_token_expiry)) {
      console.warn(`[OTP] verify-link: expired token`, { email, expiry: user.ver_token_expiry });
      return res.redirect(302, '/?verify_error=expired');
    }

    try {
      // Mark verification via link; account is considered Verified when either method is done
      try {
        await executeQuery(
          "UPDATE users SET email_verified = 1, verification_method = 'link', is_verified = 1, ver_token = NULL, ver_token_expiry = NULL WHERE email = ?",
          [email]
        );
      } catch (e) {
        const msg = (e && (e.sqlMessage || e.message || '')).toLowerCase();
        if (e && e.code === 'ER_BAD_FIELD_ERROR' && msg.includes('email_verified')) {
          // Fallback for DBs without email_verified column
          await executeQuery(
            "UPDATE users SET verification_method = 'link', is_verified = 1, ver_token = NULL, ver_token_expiry = NULL WHERE email = ?",
            [email]
          );
        } else {
          throw e;
        }
      }
      console.log(`[OTP] verify-link: email marked verified`, { email });
      return res.redirect(302, '/?verified=1#profile');
    } catch (dbErr) {
      console.error(`[OTP] verify-link: failed to update user verification`, { error: dbErr.message });
      throw dbErr;
    }
  } catch (err) {
    console.error("[OTP] verify-link: error", err);
    return res.redirect(302, '/?verify_error=server');
  }
});

// Forgot password route
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await getOne("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) return res.status(404).json({ error: "User not found" });

    const resetToken = crypto.randomBytes(20).toString("hex");
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await executeQuery("UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?", [resetToken, expiry, email]);

    const resetLink = `http://localhost:3000/reset-password?token=${resetToken}&email=${email}`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    console.log("🚀 Attempting to send reset email to:", email);
    console.log("📤 Using sender:", process.env.EMAIL_USER);

    await transporter.sendMail({
      from: `"LiBrowse Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Password Reset Request",
      html: `<p>Click the link below to reset your password:</p>
         <a href="${resetLink}">${resetLink}</a>
         <p>This link will expire in 10 minutes.</p>`
    });

    console.log("✅ Reset email sent successfully to:", email);

    res.json({ message: "Password reset email sent" });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({
      error: "Failed to send reset email",
      details: err.message || err
    });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    const user = await getOne("SELECT * FROM users WHERE email = ?", [email]);
    if (!user || user.reset_token !== token)
      return res.status(400).json({ error: "Invalid or expired token" });

    if (new Date() > new Date(user.reset_token_expiry))
      return res.status(400).json({ error: "Token expired" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await executeQuery(
      "UPDATE users SET pass_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE email = ?",
      [hashed, email]
    );

    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

module.exports = router;

