# Daily Check-In Timeline Feature

## Overview
This feature implements a 7-day visual timeline for daily check-ins, allowing users to track their login streaks and claim daily credit rewards.

## Features

### 1. Visual 7-Day Calendar
- Shows the last 7 days (6 previous days + today)
- Each day displays:
  - Day name (e.g., "Mon", "Tue")
  - Day of month number
  - Check-in status (claimed or unclaimed)

### 2. Streak Tracking
- Tracks consecutive daily check-ins
- Displays current streak with a fire icon 🔥
- Fire icon has a subtle flicker animation
- Streak resets if user misses a day

### 3. Visual Indicators
- **Today**: Highlighted with purple border and pulsing animation
- **Claimed Days**: Green background with checkmark icon ✓
- **Unclaimed Days**: Gray background with date number
- **Animated Pulse**: Today's date has a subtle pulse effect

### 4. Reward Claiming
- Button shows the available reward amount (e.g., "Claim 10 Credits")
- Button disabled if already claimed today
- Real-time updates after claiming
- Toast notification confirms successful claim

## Technical Implementation

### Database Schema

#### New Table: `daily_checkins`
```sql
CREATE TABLE daily_checkins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    checkin_date DATE NOT NULL,
    reward_amount INT NOT NULL DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY (user_id, checkin_date)
);
```

#### New Columns in `users` table:
- `last_daily_login_reward` (DATE): Last check-in date
- `daily_checkin_streak` (INT): Current consecutive streak
- `times_hit_threshold` (INT): Penalty system counter
- `account_status` (ENUM): Account status for penalties

### API Endpoints

#### 1. POST `/api/auth/daily-login-reward`
Claims the daily login reward.

**Request Headers:**
```
Authorization: Bearer <token>
```

**Response (Success):**
```json
{
  "success": true,
  "rewardAmount": 10,
  "newBalance": 110,
  "offenseLevel": 0,
  "streak": 3,
  "message": "You earned 10 credits for logging in today!"
}
```

**Response (Already Claimed):**
```json
{
  "error": "Daily reward already claimed today"
}
```

#### 2. GET `/api/auth/daily-checkin-timeline`
Fetches the 7-day check-in timeline data.

**Request Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "timeline": [
    {
      "date": "2025-11-17",
      "dayName": "Sun",
      "isToday": false,
      "claimed": true,
      "rewardAmount": 10,
      "claimedAt": "2025-11-17T08:30:00.000Z"
    },
    {
      "date": "2025-11-18",
      "dayName": "Mon",
      "isToday": false,
      "claimed": true,
      "rewardAmount": 10,
      "claimedAt": "2025-11-18T09:15:00.000Z"
    },
    // ... more days
    {
      "date": "2025-11-23",
      "dayName": "Sat",
      "isToday": true,
      "claimed": false,
      "rewardAmount": null,
      "claimedAt": null
    }
  ],
  "currentStreak": 6,
  "canClaimToday": true,
  "nextRewardAmount": 10,
  "totalCredits": 100
}
```

### Frontend Components

#### Location
The daily check-in timeline is displayed in the **Profile Section** sidebar, between the "Current Credits" card and the "Profile Stats" section.

#### JavaScript Methods

**`fetchDailyCheckinTimeline()`**
- Fetches timeline data from the API
- Called when profile section loads
- Updates the UI with fresh data

**`renderCheckinTimeline(data)`**
- Builds the HTML for the 7-day calendar
- Updates streak counter
- Configures claim button state

**`claimDailyReward(button, buttonText)`**
- Handles the reward claim action
- Shows loading state
- Updates UI after successful claim
- Refreshes timeline automatically

### CSS Classes

#### Main Container
- `.daily-checkin-card` - Main wrapper with purple gradient background

#### Timeline Elements
- `.checkin-timeline` - Container for 7-day calendar
- `.timeline-day` - Individual day cell
- `.timeline-day.today` - Today's date (purple highlight)
- `.timeline-day.claimed` - Claimed day (green background)
- `.day-indicator` - Circle containing checkmark or date number
- `.checkin-streak` - Streak counter with fire icon

#### Animations
- `@keyframes pulse` - Pulsing effect for today's date
- `@keyframes flicker` - Fire icon flicker effect

## User Experience Flow

1. **User logs in**
   - System automatically checks for available daily reward
   - If available, shows toast notification

2. **User navigates to Profile**
   - Daily check-in timeline loads automatically
   - Shows 7-day history and current streak
   - Claim button enabled if reward available

3. **User clicks "Claim X Credits"**
   - Button shows loading state
   - API call to claim reward
   - Success toast notification
   - Credits updated in real-time
   - Timeline refreshes to show new claim
   - Button disabled until tomorrow

4. **Next day**
   - Timeline shifts to show new date
   - Yesterday's claimed date shows checkmark
   - Today highlighted as available
   - Streak increments if consecutive

## Reward System

### Base Rewards
- Default: **10 credits** per day
- Penalty Level 1: **10 credits** (normal)
- Penalty Level 2: **5 credits** (reduced)
- Penalty Level 3+: **2 credits** (minimal)
- Banned: **0 credits** (no rewards)

### Streak Benefits
- Visual recognition with fire icon
- Psychological motivation for daily engagement
- Future enhancement: Bonus rewards for long streaks

## Migration Instructions

### To Apply the Migration:

#### Option 1: Using MySQL CLI
```bash
mysql -u root -p plv_book_exchange < migrations/004_add_daily_checkin_timeline.sql
```

#### Option 2: Using run-migration.js
```bash
node run-migration.js 004_add_daily_checkin_timeline
```

#### Option 3: Manual Import
1. Open phpMyAdmin or MySQL Workbench
2. Select `plv_book_exchange` database
3. Import `migrations/004_add_daily_checkin_timeline.sql`

### Migration Behavior
- Uses `IF NOT EXISTS` clauses to prevent errors if columns already exist
- Safely adds new columns to users table
- Creates daily_checkins table
- Imports historical data from credit_history (if available)
- Non-destructive: Won't delete or modify existing data

## Testing Checklist

### Backend Testing
- [ ] Migration runs successfully without errors
- [ ] POST /api/auth/daily-login-reward returns correct data
- [ ] GET /api/auth/daily-checkin-timeline returns 7-day array
- [ ] Streak increments correctly for consecutive days
- [ ] Streak resets when missing a day
- [ ] Cannot claim reward twice in same day
- [ ] Penalty system affects reward amounts

### Frontend Testing
- [ ] Timeline displays correctly in profile sidebar
- [ ] Shows 7 days (6 past + today)
- [ ] Today's date is highlighted
- [ ] Claimed days show checkmarks
- [ ] Streak counter displays correctly
- [ ] Fire icon animation works
- [ ] Pulse animation works on today's date
- [ ] Claim button shows correct state
- [ ] Claim button processes successfully
- [ ] Credits update after claim
- [ ] Timeline refreshes after claim
- [ ] Responsive on mobile devices

### User Experience Testing
- [ ] Timeline loads within 1 second
- [ ] Animations are smooth, not jarring
- [ ] Toast notifications appear and disappear correctly
- [ ] Button feedback is clear (loading, success, disabled)
- [ ] Error messages are user-friendly
- [ ] Works on Chrome, Firefox, Safari, Edge

## Future Enhancements

### Potential Features
1. **Bonus Rewards**
   - Week-long streak bonus (e.g., +50 credits on 7th day)
   - Month-long milestone rewards
   - Special badges for consistent check-ins

2. **Social Features**
   - Leaderboard for longest streaks
   - Compare streaks with friends
   - Share streak achievements

3. **Analytics**
   - Check-in rate over time
   - Best streak achieved
   - Total credits earned from check-ins

4. **Reminders**
   - Email reminder if haven't checked in
   - Push notification support
   - Calendar integration

5. **Gamification**
   - Achievement system
   - Different reward tiers
   - Special events with 2x rewards

## Troubleshooting

### Timeline not loading
- Check browser console for API errors
- Verify user is authenticated
- Ensure database migration was run
- Check if auth token is valid

### Claim button not working
- Verify API endpoint is accessible
- Check if already claimed today
- Ensure user has valid account status
- Check database connection

### Streak not incrementing
- Verify consecutive day logic in backend
- Check timezone configuration
- Ensure database is using CURDATE() correctly

### Styling issues
- Clear browser cache
- Check CSS file is loading (style.css?v=2.3)
- Verify Font Awesome icons are loading
- Test in different browsers

## Support

For issues or questions about this feature, please:
1. Check this documentation first
2. Review the code comments in the implementation
3. Test in a clean browser environment
4. Contact the development team with specific error messages

## Credits

Implemented as part of the LiBrowse platform enhancement initiative to increase user engagement and provide a rewarding daily interaction experience.
