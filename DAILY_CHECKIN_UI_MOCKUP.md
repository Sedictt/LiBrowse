# Daily Check-In Timeline - UI Visual Description

## Component Layout

```
┌─────────────────────────────────────────────────────┐
│  📅 Daily Check-In                    🔥 3 day streak │
├─────────────────────────────────────────────────────┤
│                                                       │
│  Sun   Mon   Tue   Wed   Thu   Fri   Sat            │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐         │
│  │ ✓ │ │ ✓ │ │ ✓ │ │ 20│ │ 21│ │ 22│ │⊙23│         │
│  └───┘ └───┘ └───┘ └───┘ └───┘ └───┘ └───┘         │
│   17    18    19    20    21    22    23            │
│   🟢    🟢    🟢    ⚪    ⚪    ⚪    🟣            │
│                                                       │
├─────────────────────────────────────────────────────┤
│                                                       │
│        ┌─────────────────────────────────┐          │
│        │  🎁 Claim 10 Credits            │          │
│        └─────────────────────────────────┘          │
│                                                       │
│         Check in daily to earn credits!              │
│                                                       │
└─────────────────────────────────────────────────────┘
```

## Color Scheme

### Day States:
- **🟢 Green (Claimed)**: Background rgba(0, 212, 170, 0.1), Border #00d4aa
- **⚪ Gray (Unclaimed)**: Background rgba(255, 255, 255, 0.02), Border rgba(255, 255, 255, 0.05)
- **🟣 Purple (Today)**: Background rgba(102, 126, 234, 0.1), Border #667eea, Pulsing animation

### Card:
- Background: Purple gradient rgba(102, 126, 234, 0.1) → rgba(118, 75, 162, 0.1)
- Border: 1px solid rgba(102, 126, 234, 0.2)
- Padding: 1.5rem
- Border-radius: 16px

### Button:
- Enabled: Purple gradient with glow effect
- Disabled: Opacity 0.6, no hover effect
- Loading: Shows "Claiming..." with spinner

## Responsive Behavior

### Desktop (> 768px)
```
┌──────────────────────────────────────────┐
│  Current Credits: 100                     │
│  [Credits displayed large and centered]  │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│  📅 Daily Check-In          🔥 3 days    │
│  [7 day boxes in single row]            │
│  [Claim button full width]              │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│  Profile Stats                           │
│  📚 Books | 🔄 Transactions | ⭐ Rating │
└──────────────────────────────────────────┘
```

### Mobile (< 768px)
```
┌──────────────────────┐
│  Current Credits     │
│       100            │
└──────────────────────┘

┌──────────────────────┐
│  📅 Check-In         │
│  🔥 3 days           │
│                      │
│  Sun Mon Tue Wed     │
│  [✓] [✓] [✓] [20]   │
│                      │
│  Thu Fri Sat         │
│  [21][22][⊙23]      │
│                      │
│  [Claim 10 Credits]  │
└──────────────────────┘
```

## Animation Details

### 1. Pulse Animation (Today's Date)
```css
@keyframes pulse {
    0%, 100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.7);
    }
    50% {
        transform: scale(1.05);
        box-shadow: 0 0 0 10px rgba(102, 126, 234, 0);
    }
}
/* Duration: 2s, infinite loop */
```

Visual effect: Today's circle gently grows and shrinks with a purple glow that expands outward.

### 2. Flicker Animation (Fire Icon)
```css
@keyframes flicker {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}
/* Duration: 2s, infinite loop */
```

Visual effect: The 🔥 fire icon subtly dims and brightens, creating a flickering flame effect.

### 3. Button Hover Effect
- Transform: translateY(-2px) on hover
- Box shadow: Increases from 4px to 8px
- Transition: 0.3s cubic-bezier

## Icon Reference

### Used Icons (Font Awesome)
- 📅 `fa-calendar-check` - Title icon
- 🔥 `fa-fire` - Streak indicator
- ✓ `fa-check` - Claimed day marker
- 🎁 `fa-gift` - Claim button icon
- ⊙ `fa-spinner fa-spin` - Loading state

## State Examples

### State 1: Can Claim Today
```
Button: Enabled, purple gradient
Text: "Claim 10 Credits"
Info: "Click to claim your daily reward!"
Today: Purple border, pulsing
```

### State 2: Already Claimed Today
```
Button: Disabled, grayed out
Text: "Already Claimed Today"
Info: "Come back tomorrow for your next reward!"
Today: Green background, checkmark
```

### State 3: Loading Claim
```
Button: Disabled, purple gradient
Text: "Claiming..." with spinner
Info: Hidden during loading
```

### State 4: Streak Active
```
Streak badge: Red/orange background
Icon: 🔥 with flicker animation
Text: "3 day streak" (number updates dynamically)
```

### State 5: No Streak
```
Streak badge: Still visible
Icon: 🔥 (not animated when 0)
Text: "0 day streak"
Color: Dimmed/muted
```

## Interactive Elements

### 1. Timeline Days
- **Hover**: Slight scale increase (1.02)
- **Click**: No action (informational only)
- **Tooltip**: Shows "Claimed" or "Not claimed"

### 2. Claim Button
- **Hover** (when enabled): 
  - Lift effect (-2px)
  - Glow shadow increases
  - Color slightly brightens
- **Click** (when enabled):
  - Shows loading spinner
  - Disables immediately
  - Makes API call
- **Disabled**:
  - No hover effect
  - Cursor: not-allowed
  - Opacity: 0.6

### 3. Streak Counter
- **No interaction**: Display only
- **Animation**: Fire icon flickers continuously
- **Updates**: Real-time after successful claim

## Typography

### Header
- Font: Inter, sans-serif
- Weight: 600 (Semi-bold)
- Size: 1rem (16px)
- Color: #ffffff

### Day Names
- Font: Inter, sans-serif
- Weight: 600 (Semi-bold)
- Size: 0.7rem (11.2px)
- Transform: uppercase
- Letter-spacing: 0.5px
- Color: rgba(255, 255, 255, 0.6)

### Day Numbers
- Font: Inter, sans-serif
- Weight: 600 (Semi-bold)
- Size: 0.85rem (13.6px)
- Color: rgba(255, 255, 255, 0.8)

### Streak Text
- Font: Inter, sans-serif
- Weight: 600 (Semi-bold)
- Size: 0.85rem (13.6px)
- Color: #ff6b6b (red)

### Button Text
- Font: Inter, sans-serif
- Weight: 600 (Semi-bold)
- Size: 1rem (16px)
- Color: #ffffff

### Info Text
- Font: Inter, sans-serif
- Weight: 400 (Regular)
- Size: 0.75rem (12px)
- Color: rgba(255, 255, 255, 0.6)

## Spacing

### Card Padding
- All sides: 1.5rem (24px)

### Timeline Gap
- Between days: 0.5rem (8px)

### Header Margin
- Bottom: 1.5rem (24px)

### Button Margin
- Bottom: 0.5rem (8px)

### Day Indicator Size
- Width/Height: 40px
- Border-radius: 50% (circle)
- Border: 2px

## Accessibility

### Color Contrast
- All text meets WCAG AA standards (4.5:1 minimum)
- Icons have sufficient contrast
- Disabled states clearly distinguishable

### Interactive Elements
- Buttons have focus states (purple outline)
- Keyboard navigation supported
- ARIA labels for screen readers

### Animations
- Respects prefers-reduced-motion
- Essential information not conveyed by animation alone
- Can be disabled via CSS media query

## Example User Journeys

### Journey 1: First-Time User
1. User logs in
2. Sees check-in timeline (all gray except today)
3. Today is pulsing purple
4. Streak shows "0 day streak"
5. Button says "Claim 10 Credits"
6. User clicks button
7. Toast: "🎉 Claimed 10 credits! New balance: 110"
8. Timeline updates: Today now green with checkmark
9. Button disabled: "Already Claimed Today"
10. Streak updates: "1 day streak" 🔥

### Journey 2: Returning User (3-day Streak)
1. User logs in next day
2. Timeline shifts: Yesterday's date now in view
3. Last 3 days show green checkmarks
4. Today is pulsing purple
5. Streak shows "3 day streak" 🔥 (flickering)
6. Button enabled: "Claim 10 Credits"
7. User claims → Updates instantly
8. Streak becomes "4 day streak" 🔥

### Journey 3: User Misses a Day
1. User logs in after missing yesterday
2. Timeline shows: Old claims (green), Yesterday (gray), Today (purple)
3. Streak resets to "0 day streak" (no animation)
4. Can still claim today's reward
5. Starting fresh streak today

### Journey 4: Banned User
1. User logs in (account_status = 'banned')
2. Timeline loads normally
3. Button shows "Claim 0 Credits" or is hidden
4. Attempting to claim returns error
5. Toast: "Account permanently banned from earning credits"

## Integration Points

### Where It Appears
- Location: Profile section → Left sidebar
- Position: After "Current Credits" card, before "Profile Stats"
- Always visible: When profile section is active

### Data Sources
- User data: /api/auth/profile
- Timeline data: /api/auth/daily-checkin-timeline
- Claim action: /api/auth/daily-login-reward

### Updates When
- Profile section loads initially
- After successful reward claim
- When user refreshes profile
- Not auto-refreshing (requires manual refresh)

## Browser Support

### Fully Supported
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Partially Supported
- IE 11: No animations, basic functionality only
- Opera Mini: Simplified layout

### Mobile Browsers
- iOS Safari 14+
- Chrome Mobile 90+
- Samsung Internet 14+

## Performance

### Load Time
- Timeline data: < 200ms (typical)
- Rendering: < 50ms
- Total: < 250ms from profile load

### Optimization
- CSS animations use GPU (transform, opacity)
- Minimal DOM updates
- Single API call for all data
- No polling or real-time updates

## Known Limitations

1. **Timezone Handling**: Uses server timezone for date calculations
2. **Historical Data**: Only shows last 7 days
3. **No Prediction**: Doesn't show future dates
4. **Single View**: Timeline format fixed (no calendar view option)
5. **Auto-Refresh**: Doesn't auto-update at midnight

## Recommended Next Steps

After implementing this feature, consider:
1. Adding month view toggle
2. Implementing push notifications
3. Adding streak milestones
4. Creating admin dashboard for monitoring
5. A/B testing different reward amounts
