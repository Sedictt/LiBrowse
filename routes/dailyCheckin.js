// routes/dailyCheckin.js
// Handles daily check-in claim system with 7-day timeline

const express = require('express');
const router = express.Router();
const { executeQuery, getOne } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// ============================
// GET /api/daily-checkin/status
// Returns user's check-in status for the last 7 days
// ============================
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Load settings for rewards and enabled flag
    const settings = await executeQuery(
      `SELECT setting_name, setting_val FROM settings 
       WHERE setting_name IN ('daily_checkin_enabled', 'daily_checkin_reward_day_1_6', 'daily_checkin_reward_day_7')`
    );
    const settingsMap = settings.reduce((acc, s) => { acc[s.setting_name] = s.setting_val; return acc; }, {});
    const enabled = String(settingsMap['daily_checkin_enabled'] || 'true').toLowerCase() === 'true';
    const reward1to6 = parseInt(settingsMap['daily_checkin_reward_day_1_6'] || '5', 10);
    const reward7 = parseInt(settingsMap['daily_checkin_reward_day_7'] || '20', 10);

    // Timezone offset (default to +08:00)
    const tzSetting = await getOne(`SELECT setting_val FROM settings WHERE setting_name = 'daily_checkin_timezone_offset'`);
    const tzOffset = tzSetting?.setting_val || '+08:00';

    // Compute today and the Monday of the current week in the target timezone
    const todayRow = await getOne(
      "SELECT DATE_FORMAT(DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', ?)), '%Y-%m-%d') AS today",
      [tzOffset]
    );
    const mondayRow = await getOne(
      "SELECT DATE_FORMAT(\n        DATE_SUB(DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', ?)),\n        INTERVAL WEEKDAY(DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', ?))) DAY),\n        '%Y-%m-%d'\n      ) AS monday",
      [tzOffset, tzOffset]
    );
    const todayStr = todayRow.today;
    const mondayStr = mondayRow.monday;

    // Get user's check-ins for the current week (Mon..Sun) in target timezone
    const checkins = await executeQuery(
      "SELECT DATE_FORMAT(checkin_date, '%Y-%m-%d') AS checkin_date,\n              day_number, reward_amount, claimed_at, streak_count\n       FROM daily_checkins\n       WHERE user_id = ? \n         AND checkin_date BETWEEN ? AND DATE_ADD(?, INTERVAL 6 DAY)\n       ORDER BY checkin_date DESC",
      [userId, mondayStr, mondayStr]
    );

    // Check if claimed today via SQL
    const todayClaim = await getOne(
      "SELECT EXISTS(\n          SELECT 1 FROM daily_checkins \n          WHERE user_id = ? \n            AND checkin_date = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', ?))\n       ) AS claimedToday",
      [userId, tzOffset]
    );
    const claimedToday = !!(todayClaim && todayClaim.claimedToday);

    // Get user's current credits
    const userCredits = await getOne('SELECT credits FROM users WHERE id = ?', [userId]);

    // Determine current streak and last day_number
    let currentStreak = 0;
    let lastDayNumber = 0;
    if (checkins.length > 0) {
      const last = checkins[0]; // ordered DESC
      currentStreak = last.streak_count || 0;
      lastDayNumber = last.day_number || 0;

      // Validate streak continuity (gap > 1 day breaks)
      const gap = await getOne(
        "SELECT DATEDIFF(DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', ?)), MAX(checkin_date)) AS gap\n         FROM daily_checkins WHERE user_id = ?",
        [tzOffset, userId]
      );
      if (gap && typeof gap.gap === 'number' && gap.gap > 1) {
        currentStreak = 0;
        lastDayNumber = 0;
      }
    }

    // Compute next day number (for today if not claimed, otherwise tomorrow)
    let nextDayNumber = 1;
    if (claimedToday) {
      // If claimed today, base next on today's day_number
      nextDayNumber = lastDayNumber === 7 ? 1 : (lastDayNumber + 1);
    } else if (lastDayNumber > 0) {
      nextDayNumber = lastDayNumber === 7 ? 1 : (lastDayNumber + 1);
    } else {
      nextDayNumber = 1;
    }

    // Build 7-day timeline as normalized date strings
    const checkinsMap = new Map(checkins.map(c => [c.checkin_date, c]));
    const timeline = [];
    // Build timeline from Monday -> Sunday
    for (let i = 0; i <= 6; i++) {
      const dayRes = await getOne(
        "SELECT DATE_FORMAT(DATE_ADD(?, INTERVAL ? DAY), '%Y-%m-%d') AS d",
        [mondayStr, i]
      );
      const dateString = dayRes.d;
      const checkin = checkinsMap.get(dateString);
      timeline.push({
        date: dateString,
        dayNumber: checkin ? checkin.day_number : null,
        claimed: !!checkin,
        reward: checkin ? checkin.reward_amount : null,
        claimedAt: checkin ? checkin.claimed_at : null
      });
    }

    res.json({
      success: true,
      enabled,
      claimedToday,
      currentStreak,
      nextDayNumber,
      timeline,
      totalCheckins: checkins.length,
      userCredits: userCredits?.credits || 0,
      nextReward: (nextDayNumber === 7 ? reward7 : reward1to6)
    });

  } catch (error) {
    console.error('Error fetching check-in status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch check-in status' 
    });
  }
});

// ============================
// POST /api/daily-checkin/claim
// Claims today's daily reward
// ============================
router.post('/claim', authenticateToken, async (req, res) => {
  const { transaction, getOne, executeQuery } = require('../config/database');

  try {
    const result = await transaction(async (conn) => {
      const userId = req.user.id;

      // Check if feature is enabled
      const enabledRow = await getOne(
        `SELECT setting_val FROM settings WHERE setting_name = 'daily_checkin_enabled'`
      );
      const enabled = String(enabledRow?.setting_val || 'true').toLowerCase() === 'true';
      if (!enabled) {
        return { status: 403, body: { success: false, error: 'Daily check-in is currently disabled.' } };
      }

      // Timezone offset (default to +08:00)
      const tzSetting = await getOne(`SELECT setting_val FROM settings WHERE setting_name = 'daily_checkin_timezone_offset'`);
      const tzOffset = tzSetting?.setting_val || '+08:00';

      // Guard: already claimed today
      const already = await getOne(
        "SELECT id FROM daily_checkins WHERE user_id = ? AND checkin_date = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', ?))",
        [userId, tzOffset]
      );
      if (already) {
        return { status: 400, body: { success: false, error: 'You have already claimed your reward today. Come back tomorrow!' } };
      }

      // Determine yesterday's record
      const yCheckin = await getOne(
        "SELECT streak_count, day_number \n         FROM daily_checkins \n         WHERE user_id = ? \n           AND checkin_date = DATE_SUB(DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', ?)), INTERVAL 1 DAY)",
        [userId, tzOffset]
      );

      let dayNumber = 1;
      let streakCount = 1;
      if (yCheckin) {
        const prevDay = yCheckin.day_number;
        const prevStreak = yCheckin.streak_count || 0;
        dayNumber = prevDay === 7 ? 1 : (prevDay + 1);
        streakCount = prevStreak + 1;
      } else {
        const last = await getOne(
          `SELECT checkin_date FROM daily_checkins 
           WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 1`,
          [userId]
        );
        if (last) {
          const gapRow = await getOne(
            "SELECT DATEDIFF(DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', ?)), ?) AS gap",
            [tzOffset, last.checkin_date]
          );
          const gap = gapRow?.gap ?? 999;
          if (typeof gap === 'number' && gap > 1) {
            dayNumber = 1;
            streakCount = 1;
          }
        }
      }

      // Rewards from settings
      const rewards = await executeQuery(
        `SELECT setting_name, setting_val FROM settings 
         WHERE setting_name IN ('daily_checkin_reward_day_1_6','daily_checkin_reward_day_7')`
      );
      const rewardMap = rewards.reduce((acc, r) => { acc[r.setting_name] = parseInt(r.setting_val, 10); return acc; }, {});
      const rewardAmount = dayNumber === 7 ? (rewardMap['daily_checkin_reward_day_7'] || 20) : (rewardMap['daily_checkin_reward_day_1_6'] || 5);

      // Insert check-in first (race-safe via unique constraint)
      try {
        await conn.execute(
          "INSERT INTO daily_checkins (user_id, checkin_date, day_number, reward_amount, streak_count)\n           VALUES (?, DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', ?)), ?, ?, ?)",
          [userId, tzOffset, dayNumber, rewardAmount, streakCount]
        );
      } catch (err) {
        // Duplicate means already claimed today
        if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
          return { status: 400, body: { success: false, error: 'You have already claimed your reward today. Come back tomorrow!' } };
        }
        throw err;
      }

      // Update credits and log history
      const userRow = await getOne('SELECT credits FROM users WHERE id = ?', [userId]);
      if (!userRow) {
        throw new Error('User not found');
      }
      const oldBalance = userRow.credits || 0;
      const newBalance = oldBalance + rewardAmount;

      await conn.execute('UPDATE users SET credits = ? WHERE id = ?', [newBalance, userId]);
      await conn.execute(
        `INSERT INTO credit_history (user_id, credit_change, remark, old_balance, new_balance)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, rewardAmount, `Daily Check-in Day ${dayNumber}`, oldBalance, newBalance]
      );

      return {
        status: 200,
        body: {
          success: true,
          message: `Day ${dayNumber} reward claimed! +${rewardAmount} credits`,
          dayNumber,
          rewardAmount,
          newBalance,
          streakCount,
          isWeekComplete: dayNumber === 7
        }
      };
    });

    // If transaction returned a specific status (guards), respond accordingly
    if (result && result.status && result.body) {
      return res.status(result.status).json(result.body);
    }

    // Fallback success
    return res.json(result);
  } catch (error) {
    console.error('Error claiming daily check-in:', error);
    const msg = (error && error.message === 'User not found') ? 'User not found' : 'Failed to claim daily reward. Please try again.';
    const status = (error && error.message === 'User not found') ? 404 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

module.exports = router;
