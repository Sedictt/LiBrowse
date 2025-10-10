// routes/config.js
// Exposes safe public configuration values to the frontend

const express = require('express');
const router = express.Router();

router.get('/recaptcha', (req, res) => {
  const siteKey = process.env.RECAPTCHA_SITE_KEY || '';
  res.json({ siteKey, enabled: !!siteKey });
});

module.exports = router;
