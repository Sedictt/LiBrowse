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
    
    // Get user's check-ins from the last 7 days
    const checkins = await executeQuery(
      `SELECT checkin_date, day_number, reward_amount, claimed_at, streak_count
       FROM daily_checkins
       WHERE user_id = ? 
       AND checkin_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       ORDER BY checkin_date DESC`,
      [userId]
    );

    // Get user's current credits
    const userCredits = await getOne(
      'SELECT credits FROM users WHERE id = ?',
      [userId]
    );

    // Get today's check-in status
    const today = new Date().toISOString().split('T')[0];
    const todayCheckin = checkins.find(c => c.checkin_date.toISOString().split('T')[0] === today);
    
    // Calculate current streak
    let currentStreak = 0;
    if (checkins.length > 0) {
      const sortedCheckins = checkins.sort((a, b) => new Date(b.checkin_date) - new Date(a.checkin_date));
      currentStreak = sortedCheckins[0].streak_count || 0;
      
      // Check if streak is still valid (last check-in was yesterday or today)
      const lastCheckinDate = new Date(sortedCheckins[0].checkin_date);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      lastCheckinDate.setHours(0, 0, 0, 0);
      
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      
      if (lastCheckinDate < yesterday) {
        currentStreak = 0; // Streak broken
      }
    }

    // Build 7-day timeline
    const timeline = [];
    const currentDate = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setDate(currentDate.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      
      const checkin = checkins.find(c => 
        c.checkin_date.toISOString().split('T')[0] === dateString
      );
      
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
      claimedToday: !!todayCheckin,
      currentStreak,
      nextDayNumber: currentStreak >= 7 ? 1 : (currentStreak % 7) + 1,
      timeline,
      totalCheckins: checkins.length,
      userCredits: userCredits?.credits || 0
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
  const connection = await require('../config/database').pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    // Check if already claimed today
    const existingCheckin = await connection.query(
      'SELECT id FROM daily_checkins WHERE user_id = ? AND checkin_date = ?',
      [userId, today]
    );
    
    if (existingCheckin[0].length > 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ 
        success: false,
        error: 'You have already claimed your reward today. Come back tomorrow!' 
      });
    }

    // Get yesterday's check-in to calculate streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toISOString().split('T')[0];
    
    const yesterdayCheckin = await connection.query(
      'SELECT streak_count, day_number FROM daily_checkins WHERE user_id = ? AND checkin_date = ?',
      [userId, yesterdayString]
    );
    
    // Calculate current day number and streak
    let dayNumber = 1;
    let streakCount = 1;
    
    if (yesterdayCheckin[0].length > 0) {
      const prevStreak = yesterdayCheckin[0][0].streak_count;
      const prevDay = yesterdayCheckin[0][0].day_number;
      
      if (prevDay === 7) {
        // Completed a cycle, start over
        dayNumber = 1;
        streakCount = prevStreak + 1;
      } else {
        // Continue the streak
        dayNumber = prevDay + 1;
        streakCount = prevStreak + 1;
      }
    } else {
      // Check if there's any check-in in the last 2 days (to determine if streak is broken)
      const recentCheckin = await connection.query(
        `SELECT streak_count, checkin_date FROM daily_checkins 
         WHERE user_id = ? 
         ORDER BY checkin_date DESC LIMIT 1`,
        [userId]
      );
      
      if (recentCheckin[0].length > 0) {
        const lastCheckinDate = new Date(recentCheckin[0][0].checkin_date);
        const daysDiff = Math.floor((new Date(today) - lastCheckinDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff > 1) {
          // Streak broken, start over
          dayNumber = 1;
          streakCount = 1;
        }
      }
    }
    
    // Calculate reward based on day number
    const rewardAmount = dayNumber === 7 ? 20 : 5;
    
    // Get current user credits
    const userResult = await connection.query(
      'SELECT credits FROM users WHERE id = ?',
      [userId]
    );
    
    if (userResult[0].length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    const oldBalance = userResult[0][0].credits;
    const newBalance = oldBalance + rewardAmount;
    
    // Update user credits
    await connection.query(
      'UPDATE users SET credits = ? WHERE id = ?',
      [newBalance, userId]
    );
    
    // Insert check-in record
    await connection.query(
      `INSERT INTO daily_checkins (user_id, checkin_date, day_number, reward_amount, streak_count) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, today, dayNumber, rewardAmount, streakCount]
    );
    
    // Log credit change
    await connection.query(
      `INSERT INTO credit_history (user_id, credit_change, remark, old_balance, new_balance)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, rewardAmount, `Daily Check-in Day ${dayNumber}`, oldBalance, newBalance]
    );
    
    await connection.commit();
    connection.release();
    
    res.json({
      success: true,
      message: `Day ${dayNumber} reward claimed! +${rewardAmount} credits`,
      dayNumber,
      rewardAmount,
      newBalance,
      streakCount,
      isWeekComplete: dayNumber === 7
    });

  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Error claiming daily check-in:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to claim daily reward. Please try again.' 
    });
  }
});

module.exports = router;
