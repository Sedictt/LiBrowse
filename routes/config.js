// routes/config.js
// Exposes safe public configuration values to the frontend

const express = require('express');
const router = express.Router();
const { getOne } = require('../config/database');

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

// Credits system configuration
router.get('/credits', async (req, res) => {
  try {
    // Try to get max credits from settings, default to 200
    let maxCredits = 200;
    try {
      const setting = await getOne(
        `SELECT setting_val FROM settings WHERE setting_name = 'max_user_credits'`
      );
      if (setting && setting.setting_val) {
        maxCredits = parseInt(setting.setting_val, 10) || 200;
      }
    } catch (e) {
      // Settings table may not exist or have this setting yet
      console.warn('Could not load max_user_credits setting, using default:', e.message);
    }

    res.json({
      maxCredits,
      defaultCredits: 100,
      description: 'Maximum of 200 credits indicates best behavior on the platform'
    });
  } catch (error) {
    console.error('Error fetching credits config:', error);
    res.status(500).json({ error: 'Failed to fetch credits configuration' });
  }
});


module.exports = router;
