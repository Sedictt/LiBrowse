// routes/config.js
// Exposes safe public configuration values to the frontend

const express = require('express');
const router = express.Router();

router.get('/recaptcha', (req, res) => {
  const siteKey = process.env.RECAPTCHA_SITE_KEY || '';
  res.json({ siteKey, enabled: !!siteKey });
});

// Public library loan/closures config
router.get('/library', (req, res) => {
  const closingTimeLocal = process.env.LIB_CLOSING_TIME || '17:00';
  const closuresEnabled = String(process.env.LIB_CLOSURES_ENABLED || 'false').toLowerCase() === 'true';
  const weeklyClosedDays = (process.env.LIB_WEEKLY_CLOSED_DAYS || '')
    .split(',').map(s => s.trim()).filter(Boolean).map(n => parseInt(n, 10));
  const holidays = (process.env.LIB_HOLIDAYS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const allowPastStartDateDays = parseInt(process.env.LIB_START_ALLOW_PAST_DAYS || '0', 10);
  const durationMaxDays = parseInt(process.env.LIB_DURATION_MAX_DAYS || '60', 10);
  const durationMinDays = parseInt(process.env.LIB_DURATION_MIN_DAYS || '1', 10);

  res.json({
    loans: {
      allowPastStartDateDays,
      durationMinDays,
      durationMaxDays,
      closingTimeLocal,
      closuresEnabled,
      weeklyClosedDays,
      holidays
    }
  });
});


module.exports = router;
