// server.js or routes/auth.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password, "g-recaptcha-response": token } = req.body;

  // 1️⃣ Check that the frontend sent a CAPTCHA token
  if (!token) {
    return res.status(400).json({ message: "Missing reCAPTCHA token" });
  }

  // 2️⃣ Verify the token with Google using your secret key
  const secretKey = "6Lfyh-UrAAAAABJk5ffM7J68RXY9tFQtm5Yui57k"; // backend-only key
  const verifyURL = "https://www.google.com/recaptcha/api/siteverify";

  try {
    const params = new URLSearchParams();
    params.append("secret", secretKey);
    params.append("response", token);

    const { data } = await axios.post(verifyURL, params);

    if (!data.success) {
      return res.status(400).json({ message: "reCAPTCHA verification failed" });
    }

    // 3️⃣ If successful, continue your normal login
    if (email === "test@plv.edu.ph" && password === "password123") {
      return res.json({ message: "Login successful!" });
    } else {
      return res.status(401).json({ message: "Invalid credentials" });
    }

  } catch (error) {
    console.error("Error verifying CAPTCHA:", error);
    return res.status(500).json({ message: "Server error verifying CAPTCHA" });
  }
});

module.exports = router;
