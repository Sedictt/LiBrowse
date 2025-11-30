// public/js/dailyCheckin.js
// Daily Check-in System - 7-Day Timeline with Claim Rewards

class DailyCheckinManager {
    constructor() {
        this.checkinData = null;
        this.modalElement = null;
    }

    /**
     * Get local date string in YYYY-MM-DD
     */
    getLocalDateString(date = new Date()) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * Parse YYYY-MM-DD as a local Date (midnight local)
     */
    parseLocalDate(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    /**
     * Initialize the daily check-in system
     */
    async init() {
        console.log('🎯 Daily Check-in: init() called');
        await this.loadCheckinStatus();
        this.createCheckinButton();
        console.log('✅ Daily Check-in: initialized successfully');
    }

    /**
     * Load check-in status from server
     */
    async loadCheckinStatus() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await fetch('/api/daily-checkin/status', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                this.checkinData = await response.json();
                console.log('📅 Check-in status loaded:', this.checkinData);
            }
        } catch (error) {
            console.error('Failed to load check-in status:', error);
        }
    }

    /**
     * Create the check-in button in the navigation bar
     */
    createCheckinButton() {
        // Target the nav-user area (shown when logged in)
        const navUser = document.getElementById('nav-user');
        if (!navUser) {
            console.log('nav-user not found, retrying...');
            setTimeout(() => this.createCheckinButton(), 500);
            return;
        }

        // Respect backend setting: if disabled, do not render
        if (this.checkinData && this.checkinData.enabled === false) {
            // Remove existing if present and exit
            const existingBtn = document.getElementById('daily-checkin-btn');
            if (existingBtn) existingBtn.remove();
            return;
        }

        // Remove existing button if any
        const existingBtn = document.getElementById('daily-checkin-btn');
        if (existingBtn) existingBtn.remove();

        // Create button container
        const btnContainer = document.createElement('div');
        btnContainer.id = 'daily-checkin-btn';
        btnContainer.className = 'daily-checkin-button-container';

        // Show notification badge if not claimed today
        const showBadge = this.checkinData && !this.checkinData.claimedToday;

        btnContainer.innerHTML = `
            <button class="btn-checkin ${showBadge ? 'has-notification' : ''}" 
                    onclick="dailyCheckin.openModal()" 
                    title="Daily Check-in">
                <i class="fas fa-calendar-check"></i>
                <span class="checkin-btn-text">Daily Check-in</span>
            </button>
            ${showBadge ? '<span class="checkin-badge"></span>' : ''}
        `;

        // Insert before the user avatar wrapper
        const userAvatarWrapper = navUser.querySelector('.user-avatar-wrapper');
        if (userAvatarWrapper) {
            navUser.insertBefore(btnContainer, userAvatarWrapper);
        } else {
            navUser.prepend(btnContainer);
        }
    }

    /**
     * Open the check-in modal
     */
    openModal() {
        this.createModal();
        this.showModal();
    }

    /**
     * Create the check-in modal element
     */
    createModal() {
        // Remove existing modal if any
        if (this.modalElement) {
            this.modalElement.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'daily-checkin-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="checkin-modal-content">
                <div class="checkin-modal-header">
                    <h2><i class="fas fa-calendar-check"></i> Daily Check-in</h2>
                    <button class="close-modal" onclick="dailyCheckin.closeModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="checkin-modal-body">
                    ${this.renderCheckinContent()}
                </div>
            </div>

            <!-- Info Modal -->
            <div class="checkin-info-modal" id="checkin-info-modal" style="display: none;">
                <div class="info-modal-content">
                    <div class="info-modal-header">
                        <h3><i class="fas fa-info-circle"></i> Reward System</h3>
                        <button class="close-info-btn" id="close-info-btn">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="info-modal-body">
                        <div class="info-reward-item">
                            <div class="info-reward-icon">
                                <i class="fas fa-coins"></i>
                            </div>
                            <div class="info-reward-details">
                                <h4>Daily Rewards</h4>
                                <p>Days 1-6: Earn <strong>+5 credits</strong> each day</p>
                            </div>
                        </div>
                        <div class="info-reward-item">
                            <div class="info-reward-icon bonus">
                                <i class="fas fa-star"></i>
                            </div>
                            <div class="info-reward-details">
                                <h4>Bonus Reward</h4>
                                <p>Day 7: Earn <strong>+20 credits</strong> bonus</p>
                            </div>
                        </div>
                        <div class="info-note">
                            <i class="fas fa-exclamation-circle"></i>
                            <span>Complete 7 consecutive days to maximize your rewards and maintain your streak!</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.modalElement = modal;

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });

        // Setup help modal event listeners
        this.setupHelpModal();
    }

    /**
     * Setup help modal event listeners
     */
    setupHelpModal() {
        const helpBtn = document.getElementById('checkin-help-btn');
        const infoModal = document.getElementById('checkin-info-modal');
        const closeInfoBtn = document.getElementById('close-info-btn');

        if (helpBtn && infoModal) {
            helpBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                infoModal.style.display = 'flex';
            });

            if (closeInfoBtn) {
                closeInfoBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    infoModal.style.display = 'none';
                });
            }

            infoModal.addEventListener('click', (e) => {
                if (e.target === infoModal) {
                    infoModal.style.display = 'none';
                }
            });
        }
    }

    /**
     * Render the check-in content
     */
    renderCheckinContent() {
        if (!this.checkinData) {
            return `
                <div class="checkin-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading check-in data...</p>
                </div>
            `;
        }

        const { enabled, claimedToday, currentStreak, nextDayNumber, timeline, userCredits, nextReward } = this.checkinData;
        if (enabled === false) {
            return `
                <div class="checkin-card-content">
                    <div class="checkin-header-section">
                        <div class="checkin-credits-header">
                            <span class="credits-label">My Credits</span>
                            <div class="credits-display">${(userCredits || 0).toLocaleString()}</div>
                        </div>
                    </div>
                    <div class="checkin-section">
                        <div class="section-header">
                            <h3>Daily Check-in</h3>
                            <p>The daily check-in feature is currently disabled. Please check back later.</p>
                        </div>
                    </div>
                </div>
            `;
        }
        const credits = userCredits || 0;
        const computedNextReward = typeof nextReward === 'number' ? nextReward : (nextDayNumber === 7 ? 20 : 5);

        return `
            <div class="checkin-card-content">
                <div class="checkin-header-section">
                    <div class="checkin-credits-header">
                        <span class="credits-label">My Credits</span>
                        <div class="credits-display">${credits.toLocaleString()}</div>
                    </div>
                    
                    <div class="checkin-stats">
                        <div class="stat-item">
                            <i class="fas fa-fire"></i>
                            <div class="stat-content">
                                <span class="stat-value">${currentStreak}</span>
                                <span class="stat-label">Day Streak</span>
                            </div>
                        </div>
                        <div class="stat-item">
                            <i class="fas fa-gift"></i>
                            <div class="stat-content">
                                <span class="stat-value">+${computedNextReward}</span>
                                <span class="stat-label">Next Reward</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="checkin-section">
                    <div class="section-header">
                        <div class="section-title-row">
                            <h3>Daily Check-in Calendar</h3>
                            <button class="help-icon" id="checkin-help-btn" type="button">
                                <i class="fas fa-question-circle"></i>
                            </button>
                        </div>
                        <p>Check in daily to earn credits and build your streak!</p>
                    </div>
                    
                    <div class="checkin-timeline">
                        <div class="timeline-days">
                            ${this.renderTimeline(timeline)}
                        </div>
                    </div>
                </div>

                <div class="checkin-action">
                    ${!claimedToday 
                        ? `<button class="btn-claim-reward" onclick="dailyCheckin.claimReward()">
                            <i class="fas fa-gift"></i>
                            <span>Claim Today's Reward</span>
                           </button>`
                        : `<div class="claimed-message">
                            <i class="fas fa-check-circle"></i>
                            <span>Reward claimed! Come back tomorrow for Day ${nextDayNumber > 7 ? 1 : nextDayNumber}</span>
                           </div>`
                    }
                </div>
            </div>
        `;
    }

    /**
     * Render the 7-day timeline
     */
    renderTimeline(timeline) {
        if (!timeline || timeline.length === 0) {
            return '<p>No check-in data available</p>';
        }

        // Use local timezone for "today" to avoid UTC off-by-one
        const today = this.getLocalDateString();
        const todayDate = this.parseLocalDate(today);
        const { currentStreak, nextDayNumber } = this.checkinData;

        return timeline.map((day, index) => {
            // Interpret backend date strings as local dates (no timezone shift)
            const date = this.parseLocalDate(day.date);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = date.getDate();
            const isToday = day.date === today;
            const isPast = day.date < today;
            const isFuture = day.date > today;
            
            let statusClass = 'day-unclaimed';
            let statusIcon = '';
            let displayDayNumber = null;
            let displayReward = 5;

            // Calculate what day number this would be in the sequence
            if (day.claimed) {
                // Already claimed - show actual data
                statusClass = 'day-claimed';
                statusIcon = '<i class="fas fa-check-circle"></i>';
                displayDayNumber = day.dayNumber;
                displayReward = day.reward;
            } else if (isToday) {
                // Today - show as available to claim
                statusClass = 'day-today';
                statusIcon = '<i class="fas fa-star"></i>';
                displayDayNumber = nextDayNumber;
                displayReward = nextDayNumber === 7 ? 20 : 5;
            } else if (isPast) {
                // Past unclaimed - show as missed (faded)
                statusClass = 'day-missed';
                statusIcon = '<i class="fas fa-times-circle"></i>';
                // Calculate what day it would have been
                const daysDiff = Math.floor((todayDate - date) / (1000 * 60 * 60 * 24));
                const wouldBeDayNum = ((nextDayNumber - daysDiff - 1) <= 0) ? 1 : (nextDayNumber - daysDiff);
                displayDayNumber = wouldBeDayNum;
                displayReward = wouldBeDayNum === 7 ? 20 : 5;
            } else if (isFuture) {
                // Future day - show projected reward
                statusClass = 'day-future';
                statusIcon = '<i class="fas fa-calendar"></i>';
                const daysDiff = Math.floor((date - todayDate) / (1000 * 60 * 60 * 24));
                const willBeDayNum = ((nextDayNumber + daysDiff) % 7) || 7;
                displayDayNumber = willBeDayNum;
                displayReward = willBeDayNum === 7 ? 20 : 5;
            }

            return `
                <div class="timeline-day ${statusClass} ${isToday ? 'is-today' : ''} ${displayReward === 20 ? 'bonus-day' : ''}">
                    <div class="day-date">
                        <span class="day-name">${dayName}</span>
                        <span class="day-number">${dayNum}</span>
                    </div>
                    <div class="day-icon">
                        ${statusIcon}
                    </div>
                    <div class="day-info">
                        ${day.claimed 
                            ? '<span class="day-status-text">Claimed</span>' 
                            : isToday 
                            ? '<span class="day-status-text today-text">Today!</span>'
                            : isPast 
                            ? '<span class="day-status-text missed-text">Missed</span>'
                            : '<span class="day-status-text future-text">Day ' + displayDayNumber + '</span>'
                        }
                        ${displayReward ? `<span class="day-reward-text ${displayReward === 20 ? 'bonus-reward' : ''}">+${displayReward} ${displayReward === 20 ? '🎉' : ''}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Claim today's reward
     */
    async claimReward() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                showToast('Please log in to claim rewards', 'error');
                return;
            }

            const claimBtn = document.querySelector('.btn-claim-reward');
            if (claimBtn) {
                claimBtn.disabled = true;
                claimBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Claiming...';
            }

            const response = await fetch('/api/daily-checkin/claim', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (response.ok) {
                // Success!
                showToast(data.message, 'success');
                
                // Show celebration animation
                this.showCelebration(data);
                
                // Reload status and update UI
                await this.loadCheckinStatus();
                this.updateModal();
                this.createCheckinButton();

                // Update credits display in header
                if (window.authManager && typeof window.authManager.updateUserCreditsDisplay === 'function') {
                    window.authManager.updateUserCreditsDisplay(data.newBalance);
                }

            } else {
                showToast(data.error || 'Failed to claim reward', 'error');
                if (claimBtn) {
                    claimBtn.disabled = false;
                    claimBtn.innerHTML = '<i class="fas fa-gift"></i> Claim Today\'s Reward';
                }
            }

        } catch (error) {
            console.error('Error claiming reward:', error);
            showToast('Failed to claim reward. Please try again.', 'error');
            
            const claimBtn = document.querySelector('.btn-claim-reward');
            if (claimBtn) {
                claimBtn.disabled = false;
                claimBtn.innerHTML = '<i class="fas fa-gift"></i> Claim Today\'s Reward';
            }
        }
    }

    /**
     * Show celebration animation
     */
    showCelebration(data) {
        const celebration = document.createElement('div');
        celebration.className = 'checkin-celebration';
        celebration.innerHTML = `
            <div class="celebration-content">
                <i class="fas fa-star celebration-icon"></i>
                <h3>Reward Claimed!</h3>
                <p class="celebration-day">Day ${data.dayNumber} Complete</p>
                <p class="celebration-reward">+${data.rewardAmount} Credits</p>
                ${data.isWeekComplete ? '<p class="celebration-bonus">🎉 Week Complete! Bonus Earned!</p>' : ''}
            </div>
        `;

        document.body.appendChild(celebration);

        setTimeout(() => {
            celebration.classList.add('show');
        }, 100);

        setTimeout(() => {
            celebration.classList.remove('show');
            setTimeout(() => celebration.remove(), 300);
        }, 3000);
    }

    /**
     * Update modal content
     */
    updateModal() {
        if (!this.modalElement) return;
        
        const modalBody = this.modalElement.querySelector('.checkin-modal-body');
        if (modalBody) {
            modalBody.innerHTML = this.renderCheckinContent();
        }
    }

    /**
     * Show the modal
     */
    showModal() {
        if (this.modalElement) {
            this.modalElement.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    }

    /**
     * Close the modal
     */
    closeModal() {
        if (this.modalElement) {
            this.modalElement.classList.remove('show');
            document.body.style.overflow = '';
            setTimeout(() => {
                if (this.modalElement) {
                    this.modalElement.remove();
                    this.modalElement = null;
                }
            }, 300);
        }
    }

    /**
     * Refresh check-in data
     */
    async refresh() {
        await this.loadCheckinStatus();
        this.createCheckinButton();
        if (this.modalElement && this.modalElement.classList.contains('show')) {
            this.updateModal();
        }
    }
}

// Create global instance
const dailyCheckin = new DailyCheckinManager();

// Initialize when user logs in
document.addEventListener('login', () => {
    console.log('🎯 Login event detected, initializing daily check-in...');
    dailyCheckin.init();
});

document.addEventListener('user-logged-in', () => {
    console.log('🎯 User logged in event detected, initializing daily check-in...');
    dailyCheckin.init();
});

// Initialize when DOM is ready if already logged in
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Check if user is logged in
        const token = localStorage.getItem('token');
        if (token) {
            console.log('🎯 User already logged in on page load, initializing daily check-in...');
            dailyCheckin.init();
        }
    });
} else {
    const token = localStorage.getItem('token');
    if (token) {
        console.log('🎯 User already logged in, initializing daily check-in...');
        dailyCheckin.init();
    }
}

// Clean up on logout
document.addEventListener('logout', () => {
    const btn = document.getElementById('daily-checkin-btn');
    if (btn) btn.remove();
});

document.addEventListener('user-logged-out', () => {
    const btn = document.getElementById('daily-checkin-btn');
    if (btn) btn.remove();
});
