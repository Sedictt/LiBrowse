// LiBrowse - Main Application Logic
class App {
    constructor() {
        this.currentSection = 'home';
        this.notificationsFilter = 'all'; // all | unread
        this.init();
    }

    async init() {
        try {
            this.setupEventListeners();
            this.setupNavigation();
            this.setupModals();
            this.handleInitialRoute();
            await this.loadPlatformStats();

            if (authManager.isAuthenticated) {
                this.showAuthenticatedFeatures();
                await this.updateRequestsBadge();
                this.startRequestsBadgePolling();
                await this.updateChatBadge();
                this.startChatBadgePolling();
                await this.updateMonitoringBadge();
                this.startMonitoringBadgePolling();
            }
        } catch (e) {
            console.error('App initialization error:', e);
        } finally {
            this.hideLoadingScreen();
        }
    }

    setupEventListeners() {
        // Get started button
        const getStartedBtn = document.getElementById('get-started-btn');
        if (getStartedBtn) {
            getStartedBtn.addEventListener('click', () => {
                if (authManager.isAuthenticated) {
                    this.navigateToSection('books');
                } else {
                    authManager.openModal('register-modal');
                }
            });
        }

        // Learn more button - scroll to how it works section
        const learnMoreBtn = document.getElementById('learn-more-btn');
        if (learnMoreBtn) {
            learnMoreBtn.addEventListener('click', () => {
                const howItWorksSection = document.querySelector('.how-it-works-section');
                if (howItWorksSection) {
                    howItWorksSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        }

        // CTA Register button
        const ctaRegisterBtn = document.getElementById('cta-register-btn');
        if (ctaRegisterBtn) {
            ctaRegisterBtn.addEventListener('click', (e) => {
                if (authManager && authManager.isAuthenticated) {
                    e.preventDefault();
                    authManager.showToast("You're already registered and logged in.", 'info');
                    return;
                }
                authManager.openModal('register-modal');
            });
        }

        // Mobile auth buttons
        const mobileLoginBtn = document.getElementById('mobile-login-btn');
        const mobileRegisterBtn = document.getElementById('mobile-register-btn');

        if (mobileLoginBtn) {
            mobileLoginBtn.addEventListener('click', () => {
                authManager.openModal('login-modal');
            });
        }

        if (mobileRegisterBtn) {
            mobileRegisterBtn.addEventListener('click', (e) => {
                if (authManager && authManager.isAuthenticated) {
                    e.preventDefault();
                    authManager.showToast("You're already registered and logged in.", 'info');
                    return;
                }
                authManager.openModal('register-modal');
            });
        }

        // Mobile navigation toggle
        const navToggle = document.getElementById('nav-toggle');
        const navMenu = document.getElementById('nav-menu');

        const closeMobileMenu = () => {
            if (navToggle && navMenu) {
                navToggle.classList.remove('active');
                navMenu.classList.remove('active');
                document.body.classList.remove('menu-open');
            }
        };

        if (navToggle && navMenu) {
            // Toggle menu when clicking hamburger
            navToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = navMenu.classList.contains('active');

                if (isOpen) {
                    closeMobileMenu();
                } else {
                    navToggle.classList.add('active');
                    navMenu.classList.add('active');
                    document.body.classList.add('menu-open');
                }
            });

            // Close menu when clicking on a nav link
            const navLinks = navMenu.querySelectorAll('.nav-link');
            navLinks.forEach(link => {
                link.addEventListener('click', () => {
                    closeMobileMenu();
                });
            });

            // Close menu when clicking overlay/backdrop
            navMenu.addEventListener('click', (e) => {
                // If clicking the backdrop (::before pseudo-element area)
                if (e.target === navMenu) {
                    closeMobileMenu();
                }
            });

            // Close when clicking outside
            document.addEventListener('click', (e) => {
                const isMenuOpen = navMenu.classList.contains('active');
                const clickedInsideMenu = navMenu.contains(e.target);
                const clickedToggle = navToggle.contains(e.target);

                if (isMenuOpen && !clickedInsideMenu && !clickedToggle) {
                    closeMobileMenu();
                }
            });

            // Close with Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && navMenu.classList.contains('active')) {
                    closeMobileMenu();
                }
            });
        }

        // Profile link in dropdown
        const profileLink = document.getElementById('profile-link');
        if (profileLink) {
            profileLink.addEventListener('click', () => {
                this.navigateToSection('profile');
            });
        }

        const markAllReadBtn = document.getElementById('mark-all-read');
        if (markAllReadBtn) {
            markAllReadBtn.addEventListener('click', async () => {
                try {
                    await api.markAllNotificationsAsRead();
                    await this.loadNotifications();
                } catch (e) {
                    console.error('Failed to mark all as read:', e);
                }
            });
        }

        // Notifications filter tabs (All / Unread)
        const notificationTabs = document.querySelectorAll('.notification-tab[data-filter]');
        if (notificationTabs && notificationTabs.length) {
            notificationTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const filter = tab.getAttribute('data-filter') || 'all';
                    this.notificationsFilter = filter;
                    notificationTabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.loadNotifications();
                });
            });
        }

        const notificationsListEl = document.getElementById('notifications-list');
        if (notificationsListEl) {
            notificationsListEl.addEventListener('click', async (e) => {
                const item = e.target.closest('.notification-card[data-id]');
                if (!item) return;
                const idStr = item.getAttribute('data-id');
                const nid = idStr ? parseInt(idStr) : null;
                if (!nid) return;
                try { await api.markNotificationAsRead(nid); } catch (_) { }
                const category = item.getAttribute('data-category') || '';
                if (category === 'transaction' || category === 'reminder' || category === 'system') {
                    this.navigateToSection('monitoring');
                } else if (category === 'credit') {
                    this.navigateToSection('profile');
                } else {
                    this.navigateToSection('notifications');
                }
                await this.loadNotifications();
            });
        }

        // Floating chat button (opens Requests → Active Chats)
        const floatingChatBtn = document.getElementById('floating-chat-button');
        if (floatingChatBtn) {
            floatingChatBtn.addEventListener('click', () => {
                if (!authManager || typeof authManager.requireAuth !== 'function' || !authManager.requireAuth()) {
                    return;
                }

                this.navigateToSection('requests');

                setTimeout(() => {
                    try {
                        if (window.requestManager && typeof window.requestManager.switchTab === 'function') {
                            window.requestManager.switchTab('active-chats');
                        } else {
                            const tab = document.querySelector('.request-tabs .tab-btn[data-tab="active-chats"]');
                            if (tab) tab.click();
                        }
                    } catch (_) { /* noop */ }
                }, 150);
            });
        }

        // Window resize handler
        window.addEventListener('resize', this.handleResize.bind(this));

        // Hash change handler
        window.addEventListener('hashchange', this.handleHashChange.bind(this));

        document.addEventListener('login-success', async () => {
            await this.updateRequestsBadge();
            this.startRequestsBadgePolling();
            await this.updateChatBadge();
            this.startChatBadgePolling();
            await this.updateMonitoringBadge();
            this.startMonitoringBadgePolling();
        });

        document.addEventListener('logout', () => {
            this.clearRequestsBadgePolling();
            this.clearChatBadgePolling();
            this.clearMonitoringBadgePolling();
        });
    }

    setupNavigation() {
        const navLinks = document.querySelectorAll('.nav-link[data-section]');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.getAttribute('data-section');
                this.navigateToSection(section);
            });
        });
    }

    setupModals() {
        // Modal close buttons
        const modalCloses = document.querySelectorAll('.modal-close');
        modalCloses.forEach(closeBtn => {
            closeBtn.addEventListener('click', () => {
                const modalId = closeBtn.getAttribute('data-modal');
                if (modalId) {
                    // Delegate to authManager if available, otherwise fall back
                    if (window.authManager && typeof authManager.closeModal === 'function') {
                        authManager.closeModal(modalId);
                    } else {
                        const modal = document.getElementById(modalId);
                        if (modal) {
                            modal.classList.remove('active');
                            document.body.style.overflow = '';
                        }
                    }
                }
            });
        });

        // Book details modal close on backdrop click
        document.getElementById('book-details-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'book-details-modal') {
                this.closeModal('book-details-modal');
            }
        });

        // Close modal on backdrop click
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        });

        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const activeModal = document.querySelector('.modal.active');
                if (activeModal) {
                    activeModal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            }
        });
    }

    navigateToSection(sectionName) {
        const protectedSections = ['requests', 'transactions', 'profile', 'notifications'];
        if (protectedSections.includes(sectionName) && !authManager.requireAuth()) {
            return;
        }

        let targetSection = document.getElementById(`${sectionName}-section`);
        if (!targetSection) {
            const fallbacks = ['notifications', 'requests', 'books', this.currentSection].filter(Boolean);
            for (const fb of fallbacks) {
                const el = document.getElementById(`${fb}-section`);
                if (el) { sectionName = fb; targetSection = el; break; }
            }
            if (!targetSection) return;
        }

        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
            section.style.display = 'none';
        });

        targetSection.classList.add('active');
        targetSection.style.display = 'block';
        this.currentSection = sectionName;

        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        const navLink = document.querySelector(`[data-section="${sectionName}"]`);
        if (navLink) {
            navLink.classList.add('active');
        }

        window.location.hash = sectionName;
        this.loadSectionData(sectionName);

        const navMenu = document.getElementById('nav-menu');
        if (navMenu) {
            navMenu.classList.remove('active');
        }
    }

    async loadSectionData(sectionName) {
        switch (sectionName) {
            case 'books':
                if (window.booksManager) {
                    await window.booksManager.loadBooks();
                }
                break;
            case 'requests':
                if (typeof requestManager !== 'undefined' && requestManager) {
                    if (typeof requestManager.switchTab === 'function') {
                        // Ensure Incoming Requests is active by default
                        requestManager.switchTab('incoming');
                    } else if (typeof requestManager.loadRequests === 'function') {
                        await requestManager.loadRequests();
                    }
                }
                break;
            case 'monitoring':  // ⭐ ADD THIS
                if (typeof monitoringManager !== 'undefined' && monitoringManager) {
                    await monitoringManager.loadTransactions();
                }
                break;
            case 'transactions':
                await this.loadTransactions();
                break;
            case 'profile':
                await this.loadProfile();
                break;
            case 'notifications':
                await this.loadNotifications();
                break;
        }
    }


    async loadTransactions() {
        if (!authManager.isAuthenticated) return;

        try {
            const data = await api.getTransactions();
            const transactions = Array.isArray(data?.transactions) ? data.transactions : (Array.isArray(data) ? data : []);
            this.renderTransactions(transactions);
        } catch (error) {
            console.error('Failed to load transactions:', error);
        }
    }

    renderTransactions(transactions) {
        const borrowingList = document.getElementById('borrowing-list');
        const lendingList = document.getElementById('lending-list');
        const historyList = document.getElementById('history-list');

        if (!transactions || transactions.length === 0) {
            const emptyMessage = `
                <div class="empty-state">
                    <i class="fas fa-exchange-alt"></i>
                    <h3>No transactions yet</h3>
                    <p>Start by browsing books or adding your own!</p>
                </div>
            `;

            if (borrowingList) borrowingList.innerHTML = emptyMessage;
            if (lendingList) lendingList.innerHTML = emptyMessage;
            if (historyList) historyList.innerHTML = emptyMessage;
            return;
        }

        const borrowing = transactions.filter(t => t.type === 'borrowing' && t.status !== 'completed');
        const lending = transactions.filter(t => t.type === 'lending' && t.status !== 'completed');
        const history = transactions.filter(t => t.status === 'completed');

        if (borrowingList) {
            borrowingList.innerHTML = borrowing.map(t => this.createTransactionCard(t)).join('');
        }
        if (lendingList) {
            lendingList.innerHTML = lending.map(t => this.createTransactionCard(t)).join('');
        }
        if (historyList) {
            historyList.innerHTML = history.map(t => this.createTransactionCard(t)).join('');
        }

        // Setup transaction tabs
        this.setupTransactionTabs();
    }

    createTransactionCard(transaction) {
        return `
            <div class="transaction-card">
                <div class="transaction-info">
                    <h4>${transaction.book_title}</h4>
                    <div class="transaction-meta">
                        <span>with ${transaction.other_user_name}</span>
                        <span>${new Date(transaction.created_at).toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="transaction-actions">
                    <span class="transaction-status status-${transaction.status}">
                        ${this.formatTransactionStatus(transaction.status)}
                    </span>
                    ${this.getTransactionActions(transaction)}
                </div>
            </div>
        `;
    }

    formatTransactionStatus(status) {
        const statuses = {
            'pending': 'Pending',
            'approved': 'Approved',
            'borrowed': 'Borrowed',
            'completed': 'Completed',
            'cancelled': 'Cancelled'
        };
        return statuses[status] || status;
    }

    getTransactionActions(transaction) {
        // Return appropriate action buttons based on transaction status and user role
        let actions = '';

        if (transaction.type === 'lending' && transaction.status === 'pending') {
            actions += `
                <button class="btn btn-primary btn-sm" onclick="app.approveTransaction(${transaction.id})">
                    Approve
                </button>
                <button class="btn btn-outline btn-sm" onclick="app.rejectTransaction(${transaction.id})">
                    Reject
                </button>
            `;
        }

        return actions;
    }

    setupTransactionTabs() {
        const tabBtns = document.querySelectorAll('.transaction-tabs .tab-btn');
        const tabContents = document.querySelectorAll('.transactions-content .tab-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.getAttribute('data-tab');

                // Update active tab button
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update active tab content
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === `${tabName}-tab`) {
                        content.classList.add('active');
                    }
                });
            });
        });
    }

    async loadProfile() {
        if (!authManager.isAuthenticated) return;

        try {
            const profileData = await api.get('/auth/profile');
            if (profileData && profileData.user) {
                try {
                    const raw = localStorage.getItem('user');
                    const prev = raw ? JSON.parse(raw) : {};
                    const merged = { ...prev, ...profileData.user };
                    localStorage.setItem('user', JSON.stringify(merged));
                    if (window.authManager) authManager.currentUser = merged;
                } catch (_) { /* noop */ }
            }
            this.renderProfile(profileData.user, profileData.stats);
            await this.updateUserStatsAndRating();
        } catch (error) {
            console.error('Failed to load profile:', error);
            // Fallback to basic user data
            const user = authManager.getCurrentUser();
            if (user) {
                this.renderProfile(user, { books_count: 0, transactions_count: 0, average_rating: 0, credits: 100 });
                await this.updateUserStatsAndRating();
            }
        }
    }



    renderProfile(profile, stats) {
        // Use profile data if available, fallback to current user
        const userData = profile || authManager.getCurrentUser();
        if (!userData) return;

        // Update profile header information
        const profileName = document.getElementById('profile-name');
        const profileEmail = document.getElementById('profile-email');
        const profileStudentId = document.getElementById('profile-student-id');
        const profileProgram = document.getElementById('profile-program');
        const verificationBadge = document.getElementById('verification-badge');
        const profileImg = document.getElementById('profile-image');
        const profileBio = document.getElementById('profile-bio');

        if (profileName) profileName.textContent = `${userData.firstname} ${userData.lastname}`;
        if (profileEmail) profileEmail.textContent = userData.email;
        if (profileStudentId) profileStudentId.textContent = `Student ID: ${userData.student_id}`;
        if (profileProgram) profileProgram.textContent = userData.program;
        if (profileBio) {
            if (userData.bio && String(userData.bio).trim().length > 0) {
                profileBio.textContent = userData.bio;
                profileBio.style.display = '';
            } else {
                profileBio.textContent = '';
                profileBio.style.display = 'none';
            }
        }
        if (profileImg) {
            const imgSrc = userData.profileimage || userData.avatar_url || '/assets/default-avatar.svg';
            profileImg.src = imgSrc;
            profileImg.onerror = function () { this.onerror = null; this.src = '/assets/default-avatar.svg'; };
        }


        // Update verification badge
        if (verificationBadge) {
            const emailVerified = !!userData.email_verified;
            const docVerified = userData.verification_status === 'verified';
            const bothVerified = emailVerified && docVerified;
            const eitherVerified = emailVerified || docVerified;
            verificationBadge.className = `verification-badge ${eitherVerified ? 'verified' : 'unverified'}`;
            verificationBadge.innerHTML = `
                <i class="fas fa-${eitherVerified ? 'check-circle' : 'exclamation-triangle'}"></i>
                <span>${bothVerified ? 'Fully Verified' : (eitherVerified ? 'Verified' : 'Not Verified')}</span>
            `;
        }

        // Update credits
        const userCredits = document.getElementById('user-credits');
        if (userCredits) {
            const credits = userData.credits || stats.credits || 100;
            this.animateNumber(userCredits, credits);
        }

        // Update profile stats
        const userBooks = document.getElementById('user-books');
        const userTransactions = document.getElementById('user-transactions');
        const userRating = document.getElementById('user-rating');

        if (userBooks) this.animateNumber(userBooks, stats.books_count || 0);
        if (userTransactions) this.animateNumber(userTransactions, stats.transactions_count || 0);
        if (userRating) this.animateNumber(userRating, stats.average_rating || 0, 1);

        // Setup profile tabs
        this.setupProfileTabs();

        // Setup edit profile button (with delay to ensure DOM is ready)
        setTimeout(() => {
            this.setupEditProfileButton();
            this.setupEditProfilePictureButton();

        }, 100);
    }

    async updateUserStatsAndRating() {
        try {
            const user = authManager.getCurrentUser();
            const userStats = await api.getUserStats();
            const booksEl = document.getElementById('user-books');
            const txEl = document.getElementById('user-transactions');
            const creditsEl = document.getElementById('user-credits');
            if (booksEl) this.animateNumber(booksEl, userStats.ownedBooks || 0);
            if (txEl) this.animateNumber(txEl, userStats.totalTransactions || 0);
            if (creditsEl) this.animateNumber(creditsEl, userStats.credits || 0);

            if (user && user.id) {
                const feedback = await api.getUserFeedback(user.id);
                if (Array.isArray(feedback) && feedback.length) {
                    const avg = feedback.reduce((s, f) => s + (parseInt(f.rating, 10) || 0), 0) / feedback.length;
                    const ratingEl = document.getElementById('user-rating');
                    if (ratingEl) this.animateNumber(ratingEl, parseFloat(avg.toFixed(1)) || 0, 1);
                }
            }
        } catch (_) { }
    }

    setupProfileTabs() {
        const tabBtns = document.querySelectorAll('.profile-tabs .tab-btn');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all tabs
                tabBtns.forEach(b => b.classList.remove('active'));
                // Add active class to clicked tab
                btn.classList.add('active');

                // Get tab name from data attribute
                const tabName = btn.getAttribute('data-tab');

                // Load tab content
                this.loadProfileTabContent(tabName);
            });
        });

        // Auto-load the first active tab content
        const activeTab = document.querySelector('.profile-tabs .tab-btn.active');
        if (activeTab) {
            const tabName = activeTab.getAttribute('data-tab');
            this.loadProfileTabContent(tabName);
        } else {
            // If no active tab, load the first tab content
            const firstTab = tabBtns[0];
            if (firstTab) {
                const tabName = firstTab.getAttribute('data-tab');
                this.loadProfileTabContent(tabName);
            }
        }
    }

    loadProfileTabContent(tabName) {
        const tabContent = document.querySelector('.profile-tab-content');
        if (!tabContent) return;

        switch (tabName) {
            case 'info':
                tabContent.innerHTML = this.getPersonalInfoTab();
                break;

            case 'verification':
                tabContent.innerHTML = this.getVerificationTab();
                this.setupVerificationEventListeners();
                break;

            case 'books':
                tabContent.innerHTML = this.getMyBooksTab();
                // Trigger book loading after DOM is ready
                setTimeout(() => {
                    if (typeof bookManagement !== 'undefined' && bookManagement.loadMyBooks) {
                        console.log('🔄 Triggering loadMyBooks from main.js');
                        bookManagement.loadMyBooks();
                    }
                }, 100);
                break;

            case 'reviews':
                tabContent.innerHTML = this.getReviewsTab();
                this.loadUserReviews();
                break;

            // ✅ ADD THIS NEW CASE
            case 'violations':
                tabContent.innerHTML = this.getViolationsTab();
                setTimeout(() => {
                    this.loadViolationHistory();
                }, 100);
                break;

            case 'settings':
                tabContent.innerHTML = this.getSettingsTab();
                this.setupSettingsEventListeners();
                break;

            case 'borrowing-history':
                tabContent.innerHTML = `
                <div class="history-container">
                  <h3>Borrowing & Lending History</h3>
                  <div class="history-header-actions">
                    <button class="btn-text" id="expand-history-all">
                      <i class="fas fa-expand"></i>
                      View as full list
                    </button>
                  </div>
                  <div class="history-grid">
                    <!-- Borrowing Column -->
                    <div class="history-column">
                      <h4><i class="fas fa-book-reader"></i> Books I Borrowed</h4>
                      <div id="borrowing-history-list" class="history-list">
                        <div class="loading-state">
                          <i class="fas fa-spinner fa-spin"></i>
                          <p>Loading borrowing history...</p>
                        </div>
                      </div>
                    </div>
                    
                    <!-- Lending Column -->
                    <div class="history-column">
                      <h4><i class="fas fa-hands-helping"></i> Books I Lent</h4>
                      <div id="lending-history-list" class="history-list">
                        <div class="loading-state">
                          <i class="fas fa-spinner fa-spin"></i>
                          <p>Loading lending history...</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
            `;

                // Load history and wire up modal after DOM is ready
                setTimeout(() => {
                    this.loadBorrowingLendingHistory();
                    this.setupHistoryExpandButton();
                }, 100);
                break;
        }
    }


    getPersonalInfoTab() {
        const user = authManager.getCurrentUser();
        if (!user) return '';

        return `
            <div class="profile-info-content">
                <h3>Personal Information</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <label>Full Name</label>
                        <p>${user.firstname} ${user.lastname}</p>
                    </div>
                    <div class="info-item">
                        <label>Email</label>
                        <p>${user.email}</p>
                    </div>
                    <div class="info-item">
                        <label>Student ID</label>
                        <p>${user.student_id}</p>
                    </div>
                    <div class="info-item">
                        <label>Program</label>
                        <p>${user.program}</p>
                    </div>
                    <div class="info-item">
                        <label>Member Since</label>
                        <p>${new Date(user.created_at).toLocaleDateString()}</p>
                    </div>
                </div>
            </div>
        `;
    }

    getVerificationTab() {
        const user = authManager.getCurrentUser();
        if (!user) return '';

        const emailVerified = !!user.email_verified;
        const docVerified = user.verification_status === 'verified';
        const bothVerified = emailVerified && docVerified;
        const eitherVerified = emailVerified || docVerified;
        const verificationMethod = user.verification_method || 'none';

        return `
            <div class="verification-content">
                <div class="verification-header">
                    <h3><i class="fas fa-shield-alt"></i> Account Verification</h3>
                    <div class="verification-status ${eitherVerified ? 'verified' : 'unverified'}">
                        <i class="fas ${eitherVerified ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
                        <span>${bothVerified ? 'Fully Verified' : (eitherVerified ? 'Verified' : 'Unverified Account')}</span>
                    </div>
                </div>

                <div class="verification-info">
                    <div class="info-card">
                        <div class="info-icon">
                            <i class="fas fa-info-circle"></i>
                        </div>
                        <div class="info-content">
                            <h4>Why Verify Your Account?</h4>
                            <ul>
                                <li> Build trust with other users</li>
                                <li> Access to premium features</li>
                                <li> Higher borrowing limits</li>
                                <li> Priority in book requests</li>
                                <li> Enhanced security protection</li>
                            </ul>
                        </div>
                    </div>
                </div>

                ${!bothVerified ? `
                    <!-- Verification Method Selection -->
                    <div class="verification-methods">
                        <h4><i class="fas fa-route"></i> Choose Verification Method</h4>
                        <div class="method-grid">
                            <div class="method-card ${emailVerified ? 'completed' : ''}" data-method="email">
                                <div class="method-icon">
                                    <i class="fas fa-envelope"></i>
                                </div>
                                <div class="method-content">
                                    <h5>Email Verification</h5>
                                    <p>Quick and easy verification using your PLV email address</p>
                                    <div class="method-status">
                                        ${emailVerified ?
                    '<span class="status-badge verified"><i class="fas fa-check"></i> Completed</span>' :
                    '<span class="status-badge pending"><i class="fas fa-clock"></i> Pending</span>'
                }
                                    </div>
                                </div>
                                ${!emailVerified ? `
                                <button class="method-btn btn-primary" id="email-verify-btn">
                                    <i class="fas fa-paper-plane"></i>
                                    Verify Email
                                </button>` : ''}
                            </div>

                            <div class="method-card ${docVerified ? 'completed' : ''}" data-method="document">
                                <div class="method-icon">
                                    <i class="fas fa-id-card"></i>
                                </div>
                                <div class="method-content">
                                    <h5>Document Upload</h5>
                                    <p>Upload your Student ID for automatic OCR verification</p>
                                    <div class="method-status">
                                        ${docVerified ?
                    '<span class="status-badge verified"><i class="fas fa-check"></i> Completed</span>' :
                    '<span class="status-badge pending"><i class="fas fa-upload"></i> Ready</span>'
                }
                                    </div>
                                </div>
                                ${!docVerified ? `
                                <button class="method-btn btn-primary" id="document-verify-btn">
                                    <i class="fas fa-camera"></i>
                                    Upload Documents
                                </button>` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- Email Verification Section -->
                    <div class="verification-section" id="email-verification-section" style="display: none;">
                        <div class="section-header">
                            <h4><i class="fas fa-envelope"></i> Email Verification</h4>
                            <button class="btn btn-ghost btn-sm" id="back-to-methods">
                                <i class="fas fa-arrow-left"></i> Back to Methods
                            </button>
                        </div>
                        
                        <div class="email-verification-content">
                            <div class="email-info">
                                <div class="email-display">
                                    <i class="fas fa-envelope"></i>
                                    <span>${user.email}</span>
                                    ${user.email && user.email.includes('@plv.edu.ph') ?
                    '<span class="plv-badge"><i class="fas fa-university"></i> PLV Email</span>' :
                    '<span class="warning-badge"><i class="fas fa-exclamation-triangle"></i> Non-PLV Email</span>'
                }
                                </div>
                                <p class="email-description">
                                    We'll send a verification code to your email address. 
                                    ${user.email && user.email.includes('@plv.edu.ph') ?
                    'PLV emails are automatically trusted for faster verification.' :
                    'Please ensure you have access to this email address.'
                }
                                </p>
                            </div>

                            <div class="email-verification-form">
                                <div class="form-step" id="send-code-step">
                                    <button class="btn btn-primary btn-large" id="send-verification-code">
                                        <i class="fas fa-paper-plane"></i>
                                        Send Verification Code
                                    </button>
                                </div>

                                <div class="form-step" id="verify-code-step" style="display: none;">
                                    <div class="code-input-group">
                                        <label for="verification-code">Enter 6-digit verification code:</label>
                                        <div class="code-input-container">
                                            <input type="text" id="verification-code" maxlength="6" placeholder="000000" 
                                                   class="code-input" autocomplete="off">
                                            <button class="btn btn-primary" id="verify-code-btn">
                                                <i class="fas fa-check"></i>
                                                Verify Code
                                            </button>
                                        </div>
                                    </div>
                                    <div class="code-actions">
                                        <button class="btn btn-ghost" id="resend-code-btn" disabled>
                                            <i class="fas fa-redo"></i>
                                            Resend Code (<span id="resend-timer">60</span>s)
                                        </button>
                                    </div>
                                </div>

                                <div class="form-step" id="email-success-step" style="display: none;">
                                    <div class="success-message">
                                        <i class="fas fa-check-circle"></i>
                                        <h5>Email Verified Successfully!</h5>
                                        <p>Your email has been verified. You can now access all platform features.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Document Upload Section -->
                    <div class="verification-section" id="document-verification-section" style="display: none;">
                        <div class="section-header">
                            <h4><i class="fas fa-id-card"></i> Document Upload Verification</h4>
                            <button class="btn btn-ghost btn-sm" id="back-to-methods-doc">
                                <i class="fas fa-arrow-left"></i> Back to Methods
                            </button>
                        </div>
                        
                        <!-- Enhanced OCR Upload Form -->
                        <form id="profile-verification-form" class="verification-form">
                            <div class="upload-grid">
                                <div class="upload-item">
                                    <div class="upload-area" id="profile-front-upload">
                                        <div class="upload-icon">
                                            <i class="fas fa-id-card"></i>
                                        </div>
                                        <div class="upload-text">
                                            <strong>Front Side of Student ID</strong>
                                            <span>Click to select or drag and drop</span>
                                            <small>JPG, PNG, PDF (Max 5MB)</small>
                                        </div>
                                    </div>
                                    <input type="file" id="profile-front-file" accept=".jpg,.jpeg,.png,.pdf" style="display: none;">
                                    <div id="profile-front-preview" class="file-preview-container"></div>
                                </div>

                                <div class="upload-item">
                                    <div class="upload-area" id="profile-back-upload">
                                        <div class="upload-icon">
                                            <i class="fas fa-id-card"></i>
                                        </div>
                                        <div class="upload-text">
                                            <strong>Back Side of Student ID</strong>
                                            <span>Optional - Click to select or drag and drop</span>
                                            <small>JPG, PNG, PDF (Max 5MB)</small>
                                        </div>
                                    </div>
                                    <input type="file" id="profile-back-file" accept=".jpg,.jpeg,.png,.pdf" style="display: none;">
                                    <div id="profile-back-preview" class="file-preview-container"></div>
                                </div>
                            </div>

                            <!-- Debug Toggle -->
                            <div class="debug-toggle" style="margin: 15px 0; text-align: center;">
                                <label style="display: inline-flex; align-items: center; cursor: pointer; color: var(--text-muted); font-size: 0.9rem;">
                                    <input type="checkbox" id="profile-debug-mode" style="margin-right: 8px;">
                                    <span>🔬 Show OCR Debug Info</span>
                                </label>
                            </div>

                            <div class="form-actions">
                                <button type="submit" id="profile-upload-btn" class="btn btn-primary btn-large" disabled>
                                    <i class="fas fa-upload"></i>
                                    Upload Documents for Verification
                                </button>
                            </div>

                            <!-- Upload Progress -->
                            <div class="upload-progress" id="profile-upload-progress" style="display: none;">
                                <div class="progress-bar-container">
                                    <div class="progress-bar">
                                        <div id="profile-upload-progress-bar" class="progress-fill"></div>
                                    </div>
                                    <div class="progress-text" id="profile-upload-progress-text">This may take a few seconds...</div>
                                </div>
                            </div>

                            <!-- Debug Output -->
                            <div class="debug-output" id="profile-debug-output" style="display: none; margin-top: 20px; padding: 15px; background: rgba(255, 255, 255, 0.02); border-radius: var(--radius-lg); border: 1px solid rgba(255, 255, 255, 0.1);">
                                <h4 style="color: var(--info); margin-bottom: 10px; font-size: 1.1rem;">🔍 OCR Processing Details</h4>
                                <div class="debug-log" id="profile-debug-log" style="font-family: 'Consolas', monospace; font-size: 0.85rem; color: var(--success); max-height: 300px; overflow-y: auto; white-space: pre-wrap; word-wrap: break-word; background: rgba(0, 0, 0, 0.3); padding: 10px; border-radius: 4px;"></div>
                            </div>
                        </form>
                    </div>
                ` : `
                    <div class="verification-success">
                        <div class="success-icon">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <h4>Account Successfully Verified!</h4>
                        <p>Your account has been verified and you now have access to all platform features.</p>
                        <div class="verification-details">
                            <div class="detail-item">
                                <span class="label">Status:</span>
                                <span class="value verified">Verified</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Method:</span>
                                <span class="value">${(emailVerified && docVerified) ? 'Email + Document' : (verificationMethod === 'email' ? 'Email Verification' : 'Document Upload')}</span>
                            </div>
                            ${emailVerified ? `
                                <div class="detail-item">
                                    <span class="label">Email:</span>
                                    <span class="value">${user.email}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `}

                <div class="verification-tips">
                    <h4><i class="fas fa-lightbulb"></i> Verification Tips</h4>
                    <div class="tips-grid">
                        <div class="tip-item">
                            <i class="fas fa-envelope"></i>
                            <span>Use your PLV email for faster verification</span>
                        </div>
                        <div class="tip-item">
                            <i class="fas fa-camera"></i>
                            <span>Take clear, well-lit photos of documents</span>
                        </div>
                        <div class="tip-item">
                            <i class="fas fa-shield-alt"></i>
                            <span>Verification increases your credibility</span>
                        </div>
                        <div class="tip-item">
                            <i class="fas fa-clock"></i>
                            <span>Email verification is usually instant</span>
                        </div>
                        <div class="tip-item">
                            <i class="fas fa-bell"></i>
                            <span>We9ll notify you in Notifications when document verification is complete</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderHistory() {
        const tabContent = document.querySelector('.profile-tab-content');
        if (!tabContent) return;

        tabContent.innerHTML = `
        <div class="history-section" id="borrowing-history">
            <h4>Borrowing History</h4>
            <ul id="borrowing-list" class="history-items"></ul>
        </div>
        <div class="history-section" id="lending-history">
            <h4>Lending History</h4>
            <ul id="lending-list" class="history-items"></ul>
        </div>
    `;

        // Fetch transaction data from backend
        api.getTransactions().then(data => {
            const borrowList = document.getElementById('borrowing-list');
            const lendList = document.getElementById('lending-list');

            borrowList.innerHTML = '';
            lendList.innerHTML = '';

            data.transactions.forEach(tx => {
                const item = document.createElement('li');
                item.classList.add('history-item');

                item.innerHTML = `
                <div class="history-book">
                    <strong>${tx.book_title || 'Untitled Book'}</strong>
                    <span>by ${tx.book_author || 'Unknown'}</span>
                </div>
                <div class="history-meta">
                    <p>${tx.is_borrower ? `Lender: ${tx.lender_name}` : `Borrower: ${tx.borrower_name}`}</p>
                    <p>${new Date(tx.created_at).toLocaleDateString()}</p>
                    <span class="status ${tx.status.toLowerCase()}">${tx.status}</span>
                </div>
            `;

                if (tx.is_borrower) {
                    borrowList.appendChild(item);
                } else {
                    lendList.appendChild(item);
                }
            });

            if (!borrowList.children.length) borrowList.innerHTML = "<p>No borrowing history yet.</p>";
            if (!lendList.children.length) lendList.innerHTML = "<p>No lending history yet.</p>";
        }).catch(err => {
            console.error("Failed to load transactions:", err);
            tabContent.innerHTML = `<p>Error loading history. Please try again later.</p>`;
        });
    }


    getMyBooksTab() {
        return `
            <div class="my-books-content" id="books-content">
                <div class="loading-state">
                    <i class="fas fa-spinner fa-spin fa-2x"></i>
                    <p>Loading your books...</p>
                </div>
            </div>
        `;
    }

    getReviewsTab() {
        return `
            <div class="reviews-content">
                <h3>Reviews & Ratings</h3>
                <div id="reviews-list" class="reviews-list">
                    <div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Loading reviews...</div>
                </div>
            </div>
        `;
    }

    async loadUserReviews() {
        const container = document.getElementById('reviews-list') || document.querySelector('.reviews-content');
        const user = authManager.getCurrentUser();
        if (!container || !user) return;
        try {
            const feedback = await api.getUserFeedback(user.id);
            if (!Array.isArray(feedback) || feedback.length === 0) {
                container.innerHTML = `
                    <div class="no-feedback">
                        <i class="far fa-star"></i>
                        <p>No reviews yet.</p>
                    </div>
                `;
                const ratingEl = document.getElementById('user-rating');
                if (ratingEl) this.animateNumber(ratingEl, 0, 1);
                return;
            }

            const html = feedback.map(f => {
                const rating = Math.max(0, Math.min(5, parseInt(f.rating, 10) || 0));
                const stars = `${'<i class=\"fas fa-star\"></i>'.repeat(rating)}${'<i class=\"far fa-star\"></i>'.repeat(5 - rating)}`;
                const date = new Date(f.created).toLocaleDateString();
                const details = [
                    f.book_cond ? `<div class=\"feedback-detail-item\"><i class=\"fas fa-book\"></i><span>Condition: ${String(f.book_cond).replace('_', ' ')}</span></div>` : '',
                    f.return_time ? `<div class=\"feedback-detail-item\"><i class=\"fas fa-clock\"></i><span>Returned: ${f.return_time}</span></div>` : ''
                ].join('');
                return `
                    <div class=\"feedback-item\">
                        <div class=\"feedback-header\">
                            <div>
                                <strong>${(f.reviewer_name || 'Anonymous')}</strong>
                                <div class=\"feedback-rating\">${stars}</div>
                            </div>
                            <div class=\"feedback-date\">${date}</div>
                        </div>
                        ${f.comment ? `<p class=\"feedback-comment\">${f.comment}</p>` : ''}
                        ${details ? `<div class=\"feedback-details\">${details}</div>` : ''}
                    </div>
                `;
            }).join('');
            container.innerHTML = html;

            const avg = feedback.reduce((s, f) => s + (parseInt(f.rating, 10) || 0), 0) / feedback.length;
            const ratingEl = document.getElementById('user-rating');
            if (ratingEl) this.animateNumber(ratingEl, parseFloat(avg.toFixed(1)) || 0, 1);
        } catch (error) {
            container.innerHTML = `<p class=\"error-message\">Failed to load reviews</p>`;
        }
    }

    getSettingsTab() {
        const user = authManager.getCurrentUser();
        const emailVerified = !!(user && user.email_verified);
        const docVerified = !!(user && user.verification_status === 'verified');
        const isVerified = emailVerified && docVerified;

        return `
            <div class="settings-content">
                <h3>Account Settings</h3>
                
                <div class="settings-section">
                    <h4>Account Verification</h4>
                    <div class="verification-status">
                        <div class="status-indicator ${isVerified ? 'verified' : 'unverified'}">
                            <i class="fas fa-${isVerified ? 'check-circle' : 'exclamation-triangle'}"></i>
                            <span>${isVerified ? 'Account Verified' : 'Account Not Verified'}</span>
                        </div>
                        <p class="status-description">
                            ${isVerified
                ? 'Your account is fully verified.'
                : 'Verify your student email and upload your ID/COR to become fully verified.'
            }
                        </p>
                    </div>
                    
                    <div class="verification-methods-info">
                        <h5>Available Verification Methods:</h5>
                        <div class="method-list">
                            <div class="method-item">
                                <i class="fas fa-envelope"></i>
                                <div class="method-details">
                                    <strong>Email OTP</strong>
                                    <span>Quick verification via email code</span>
                                </div>
                            </div>
                            <div class="method-item">
                                <i class="fas fa-id-card"></i>
                                <div class="method-details">
                                    <strong>Document Verification</strong>
                                    <span>Upload COR or School ID for secure verification</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="settings-section">
                    <h4>Notifications</h4>
                    <label class="toggle">
                        <input type="checkbox" checked>
                        <span>Email notifications</span>
                    </label>
                    <label class="toggle">
                        <input type="checkbox" checked>
                        <span>Transaction updates</span>
                    </label>
                </div>
                
                <div class="settings-section">
                    <h4>Privacy</h4>
                    <label class="toggle">
                        <input type="checkbox" checked>
                        <span>Show profile to other users</span>
                    </label>
                </div>
            </div>
        `;
    }

    setupSettingsEventListeners() {
        // Re-verify account button
        const reverifyBtn = document.getElementById('reverify-account');
        if (reverifyBtn) {
            reverifyBtn.addEventListener('click', () => {
                this.handleReverifyAccount();
            });
        }

        // Change verification method button
        const changeMethodBtn = document.getElementById('change-verification-method');
        if (changeMethodBtn) {
            changeMethodBtn.addEventListener('click', () => {
                this.handleChangeVerificationMethod();
            });
        }
    }

    handleReverifyAccount() {
        // Set pending email for verification flow
        const user = authManager.getCurrentUser();
        if (user) {
            authManager.pendingEmail = user.email;
            authManager.openModal('verification-choice-modal');
        }
    }

    handleChangeVerificationMethod() {
        // Same as re-verify but with different messaging
        this.handleReverifyAccount();
    }

    async loadNotifications() {
        if (!authManager.isAuthenticated) return;

        const container = document.getElementById('notifications-list');
        if (container) {
            container.innerHTML = `
                <div class="notification-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading notifications...</p>
                </div>
            `;
        }

        try {
            const filter = this.notificationsFilter || 'all';
            const unreadOnly = filter === 'unread';
            const resp = await api.getNotifications(unreadOnly, 20, 0);
            const list = Array.isArray(resp?.notifications) ? resp.notifications : (Array.isArray(resp) ? resp : []);
            const totalUnread = typeof resp?.unreadCount === 'number'
                ? resp.unreadCount
                : (Array.isArray(list) ? list.filter(n => !n.is_read).length : 0);

            this.renderNotifications(list);
            this.updateNotificationBadge(list, totalUnread);
            this.updateNotificationsHeader(totalUnread);
        } catch (error) {
            console.error('Failed to load notifications:', error);
            if (container) {
                container.innerHTML = `
                    <div class="notification-empty">
                        <i class="fas fa-bell-slash"></i>
                        <p>Failed to load notifications. Please try again.</p>
                    </div>
                `;
            }
        }
    }

    renderNotifications(notifications) {
        const notificationsList = document.getElementById('notifications-list');
        if (!notificationsList) return;

        if (!notifications || notifications.length === 0) {
            notificationsList.innerHTML = `
                <div class="notification-empty">
                    <i class="fas fa-bell"></i>
                    <p>You're all caught up! No new notifications.</p>
                </div>
            `;
            return;
        }

        notificationsList.innerHTML = notifications.map(n => {
            let msg = '';
            try {
                const body = typeof n.body === 'string' ? JSON.parse(n.body) : n.body;
                if (body && typeof body === 'object' && body.message) msg = body.message;
                else if (typeof body === 'string') msg = body;
            } catch (_) {
                msg = typeof n.body === 'string' ? n.body : (n.message || '');
            }
            const time = n.created || n.created_at || '';
            const cat = n.category || n.type || '';
            const title = n.title || '';
            return `
            <div class="notification-card ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-category="${cat}">
                <div class="notification-icon">
                    <i class="fas fa-${this.getNotificationIcon(cat)}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-title">${title}</div>
                    <div class="notification-message">${msg}</div>
                    <div class="notification-time">${this.formatTime ? this.formatTime(time) : time}</div>
                </div>
            </div>`;
        }).join('');
    }

    getNotificationIcon(type) {
        const icons = {
            'transaction': 'exchange-alt',
            'reminder': 'clock',
            'credit': 'coins',
            'system': 'cog',
            // legacy fallbacks
            'book': 'book',
            'message': 'envelope'
        };
        return icons[type] || 'bell';
    }

    updateNotificationBadge(notifications, unreadCountOverride) {
        const badge = document.getElementById('notification-badge');
        if (!badge) return;

        let unreadCount = typeof unreadCountOverride === 'number'
            ? unreadCountOverride
            : (Array.isArray(notifications)
                ? notifications.filter(n => !n.is_read).length
                : 0);

        // Keep badge text in sync
        badge.textContent = unreadCount;

        // Prefer the new NotificationManager badge animation if available
        if (window.notificationManager && typeof window.notificationManager.updateBadge === 'function') {
            window.notificationManager.unreadCount = unreadCount;
            window.notificationManager.updateBadge();
        } else {
            // Fallback: simple show/hide via active class
            if (unreadCount > 0) {
                badge.classList.add('active');
            } else {
                badge.classList.remove('active');
            }
        }
    }

    updateNotificationsHeader(unreadCount) {
        const pill = document.getElementById('notifications-unread-pill');
        if (pill) {
            pill.textContent = unreadCount;
            pill.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
        }

        const subtitle = document.getElementById('notifications-subtitle');
        if (subtitle) {
            if (unreadCount > 0) {
                subtitle.textContent = `You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}.`;
            } else {
                subtitle.textContent = 'You are all caught up. New notifications will appear here.';
            }
        }
    }

    setRequestsBadge(count) {
        const navBadge = document.getElementById('requests-badge');
        if (navBadge) {
            navBadge.textContent = count;
            navBadge.style.display = count > 0 ? 'inline' : 'none';
        }
    }

    setMonitoringBadge(count) {
        const navBadge = document.getElementById('monitoring-badge');
        if (navBadge) {
            navBadge.textContent = count;
            navBadge.style.display = count > 0 ? 'inline' : 'none';
        }
    }

    async updateMonitoringBadge() {
        try {
            if (!authManager || !authManager.isAuthenticated) {
                this.setMonitoringBadge(0);
                return 0;
            }

            const data = await api.getTransactions();
            const list = Array.isArray(data?.transactions) ? data.transactions : (Array.isArray(data) ? data : []);

            const activeCount = list.filter(t => t.status === 'approved' || t.status === 'borrowed').length;
            const pendingFeedbackCount = list.filter(t => t.status === 'returned').length;
            const totalActive = activeCount + pendingFeedbackCount;

            this.setMonitoringBadge(totalActive);
            return totalActive;
        } catch (error) {
            console.error('Failed to update monitoring badge:', error);
            return 0;
        }
    }

    startMonitoringBadgePolling() {
        if (this._monitoringBadgeTimer) return;
        this._monitoringBadgeTimer = setInterval(() => {
            if (document.visibilityState === 'visible') {
                const p = this.updateMonitoringBadge();
                if (p && typeof p.catch === 'function') p.catch(() => { });
            }
        }, 30000);
    }

    clearMonitoringBadgePolling() {
        if (this._monitoringBadgeTimer) {
            clearInterval(this._monitoringBadgeTimer);
            this._monitoringBadgeTimer = null;
        }
        this.setMonitoringBadge(0);
    }

    async updateRequestsBadge() {
        try {
            if (!authManager || !authManager.isAuthenticated) {
                this.setRequestsBadge(0);
                return 0;
            }

            const data = await api.getTransactions();
            const list = Array.isArray(data?.transactions) ? data.transactions : (Array.isArray(data) ? data : []);
            const userId = authManager.currentUser?.id;
            const incoming = list.filter(t => t.lender_id === userId);
            const count = incoming.length;
            this.setRequestsBadge(count);
            return count;
        } catch (error) {
            console.error('Failed to update requests badge:', error);
            return 0;
        }
    }

    startRequestsBadgePolling() {
        if (this._requestsBadgeTimer) return;
        this._requestsBadgeTimer = setInterval(() => {
            if (document.visibilityState === 'visible') {
                const p = this.updateRequestsBadge();
                if (p && typeof p.catch === 'function') p.catch(() => { });
            }
        }, 30000);
    }

    clearRequestsBadgePolling() {
        if (this._requestsBadgeTimer) {
            clearInterval(this._requestsBadgeTimer);
            this._requestsBadgeTimer = null;
        }
        this.setRequestsBadge(0);
    }

    setChatBadge(count) {
        const badge = document.getElementById('chat-count');
        if (badge) {
            badge.textContent = count;
        }

        const floatingBadge = document.getElementById('floating-chat-badge');
        if (floatingBadge) {
            floatingBadge.textContent = count;
            floatingBadge.classList.toggle('hidden', !count || count <= 0);
        }
    }

    async updateChatBadge() {
        try {
            if (!authManager || !authManager.isAuthenticated) {
                this.setChatBadge(0);
                return 0;
            }

            // If Active Chats tab is already loaded, use its data to avoid an extra request
            if (window.requestManager && window.requestManager.currentTab === 'active-chats' && Array.isArray(window.requestManager.currentChats)) {
                const list = window.requestManager.currentChats;
                const unreadTotal = list.reduce((sum, chat) => sum + (chat.unread_count || 0), 0);
                this.setChatBadge(unreadTotal);
                return unreadTotal;
            }

            // Fallback: fetch chats and compute unread messages from API data
            const chats = await api.get(`/chats?_=${Date.now()}`);
            const list = Array.isArray(chats) ? chats : [];
            const unreadTotal = list.reduce((sum, chat) => sum + (chat.unread_count || 0), 0);
            this.setChatBadge(unreadTotal);
            return unreadTotal;
        } catch (error) {
            console.error('Failed to update chat badge:', error);
            return 0;
        }
    }

    startChatBadgePolling() {
        if (this._chatBadgeTimer) return;
        this._chatBadgeTimer = setInterval(() => {
            if (document.visibilityState === 'visible') {
                const p = this.updateChatBadge();
                if (p && typeof p.catch === 'function') p.catch(() => { });
            }
        }, 30000);
    }

    clearChatBadgePolling() {
        if (this._chatBadgeTimer) {
            clearInterval(this._chatBadgeTimer);
            this._chatBadgeTimer = null;
        }
        this.setChatBadge(0);
    }

    async loadPlatformStats() {
        try {
            const stats = await api.getPlatformStats();
            this.updateStatsDisplay(stats);
        } catch (error) {
            // Don't show error for stats if user is not authenticated
            if (error.status !== 401) {
                console.error('Failed to load platform stats:', error);
            }
        }
    }

    showAuthenticatedFeatures() {
        // Load data without forcing sections visible; rendering will toggle visibility as needed
        if (window.savedSearchesManager && typeof window.savedSearchesManager.loadSavedSearches === 'function') {
            window.savedSearchesManager.loadSavedSearches();
        }
        if (typeof window.booksManager !== 'undefined' && window.booksManager && typeof window.booksManager.loadRecentlyViewed === 'function') {
            window.booksManager.loadRecentlyViewed();
        }

        const floatingChatBtn = document.getElementById('floating-chat-button');
        if (floatingChatBtn) {
            floatingChatBtn.classList.remove('hidden');
        }
    }

    hideAuthenticatedFeatures() {
        const recentlyViewedSection = document.getElementById('recently-viewed-section');
        if (recentlyViewedSection) recentlyViewedSection.style.display = 'none';

        const floatingChatBtn = document.getElementById('floating-chat-button');
        if (floatingChatBtn) {
            floatingChatBtn.classList.add('hidden');
        }
    }

    updateStatsDisplay(stats) {
        const totalUsers = document.getElementById('total-users');
        const totalBooks = document.getElementById('total-books');
        const totalTransactions = document.getElementById('total-transactions');
        const avgRating = document.getElementById('avg-rating');

        if (totalUsers) this.animateNumber(totalUsers, stats.total_users || 0);
        if (totalBooks) this.animateNumber(totalBooks, stats.total_books || 0);
        if (totalTransactions) this.animateNumber(totalTransactions, stats.total_transactions || 0);
        if (avgRating) this.animateNumber(avgRating, stats.average_rating || 0, 1);
    }

    animateNumber(element, target, decimals = 0) {
        const start = 0;
        const duration = 2000;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const current = start + (target - start) * this.easeOutQuart(progress);
            element.textContent = decimals > 0 ? current.toFixed(decimals) : Math.floor(current);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }

    handleInitialRoute() {
        try {
            const params = new URLSearchParams(window.location.search || '');
            const verified = params.get('verified');
            const verr = params.get('verify_error');
            if (verified === '1') {
                if (typeof window.showToast === 'function') window.showToast('Email verified successfully', 'success', 5000);
                const newUrl = window.location.pathname + (window.location.hash || '#profile');
                window.history.replaceState({}, '', newUrl);
            } else if (verr) {
                const map = { missing: 'Verification link is incomplete', invalid: 'Invalid verification link', expired: 'Verification link expired', not_found: 'User not found', server: 'Verification failed due to a server error' };
                const msg = map[verr] || 'Verification failed';
                if (typeof window.showToast === 'function') window.showToast(msg, 'error', 6000);
                const newUrl = window.location.pathname + window.location.hash;
                window.history.replaceState({}, '', newUrl);
            }
        } catch (_) { }
        const hash = window.location.hash.slice(1);
        if (hash) {
            this.navigateToSection(hash);
        } else {
            this.navigateToSection('home');
        }
    }

    handleHashChange() {
        const hash = window.location.hash.slice(1);
        if (hash) {
            this.navigateToSection(hash);
        }
    }

    handleResize() {
        // Handle responsive behavior
        const navMenu = document.getElementById('nav-menu');
        if (window.innerWidth > 768 && navMenu) {
            navMenu.classList.remove('active');
        }
    }

    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        console.log('Hiding loading screen:', loadingScreen);
        if (loadingScreen) {
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
                console.log('Loading screen hidden');
                // Fallback: force hide after animation
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                }, 500);
            }, 1000);
        }
    }

    loadCurrentSection() {
        // Reload the current section data
        this.loadSectionData(this.currentSection);
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            // Clear any inline styles that might have been set
            modal.style.display = '';
            modal.style.visibility = '';
            modal.style.opacity = '';
            modal.style.zIndex = '';
            document.body.style.overflow = '';
        }

        // Special handling for book details modal
        if (modalId === 'book-details-modal' && window.booksManager) {
            window.booksManager.closeBookModal();
        }
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    }

    async approveTransaction(transactionId) {
        try {
            await api.updateTransactionStatus(transactionId, 'approved');
            this.loadTransactions();
            await this.updateMonitoringBadge();
            authManager.showToast('Transaction approved!', 'success');
        } catch (error) {
            authManager.showToast(error.message, 'error');
        }
    }

    async rejectTransaction(transactionId) {
        try {
            await api.updateTransactionStatus(transactionId, 'cancelled');
            this.loadTransactions();
            await this.updateMonitoringBadge();
            authManager.showToast('Transaction rejected', 'info');
        } catch (error) {
            authManager.showToast(error.message, 'error');
        }
    }

    setupVerificationEventListeners() {
        // Method selection buttons
        const emailVerifyBtn = document.getElementById('email-verify-btn');
        const documentVerifyBtn = document.getElementById('document-verify-btn');

        // Navigation buttons
        const backToMethodsBtn = document.getElementById('back-to-methods');
        const backToMethodsDocBtn = document.getElementById('back-to-methods-doc');

        // Email verification elements
        const sendCodeBtn = document.getElementById('send-verification-code');
        const verifyCodeBtn = document.getElementById('verify-code-btn');
        const resendCodeBtn = document.getElementById('resend-code-btn');
        const verificationCodeInput = document.getElementById('verification-code');

        // Document upload elements
        const frontUpload = document.getElementById('profile-front-upload');
        const frontFile = document.getElementById('profile-front-file');
        const backUpload = document.getElementById('profile-back-upload');
        const backFile = document.getElementById('profile-back-file');
        const debugMode = document.getElementById('profile-debug-mode');
        const form = document.getElementById('profile-verification-form');

        // Re-verify and change method buttons
        const reVerifyBtn = document.getElementById('re-verify-btn');
        const changeMethodBtn = document.getElementById('change-method-btn');

        // Method selection handlers
        if (emailVerifyBtn) {
            emailVerifyBtn.addEventListener('click', () => this.showEmailVerification());
        }

        if (documentVerifyBtn) {
            documentVerifyBtn.addEventListener('click', () => this.showDocumentVerification());
        }

        // Navigation handlers
        if (backToMethodsBtn) {
            backToMethodsBtn.addEventListener('click', () => this.showVerificationMethods());
        }

        if (backToMethodsDocBtn) {
            backToMethodsDocBtn.addEventListener('click', () => this.showVerificationMethods());
        }

        // Email verification handlers
        if (sendCodeBtn) {
            sendCodeBtn.addEventListener('click', () => this.sendVerificationCode());
        }

        if (verifyCodeBtn) {
            verifyCodeBtn.addEventListener('click', () => this.verifyEmailCode());
        }

        if (resendCodeBtn) {
            resendCodeBtn.addEventListener('click', () => this.resendVerificationCode());
        }

        if (verificationCodeInput) {
            verificationCodeInput.addEventListener('input', (e) => {
                // Auto-format and validate code input
                e.target.value = e.target.value.replace(/\D/g, '').substring(0, 6);

                // Auto-verify when 6 digits are entered
                if (e.target.value.length === 6) {
                    this.verifyEmailCode();
                }
            });

            verificationCodeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.verifyEmailCode();
                }
            });
        }

        // Document upload handlers
        if (frontUpload && frontFile) {
            frontUpload.addEventListener('click', () => frontFile.click());
            frontFile.addEventListener('change', (e) => this.handleProfileFileSelect(e, 'front'));
        }

        if (backUpload && backFile) {
            backUpload.addEventListener('click', () => backFile.click());
            backFile.addEventListener('change', (e) => this.handleProfileFileSelect(e, 'back'));
        }

        if (debugMode) {
            debugMode.addEventListener('change', (e) => this.toggleProfileDebugMode(e.target.checked));
        }

        if (form) {
            form.addEventListener('submit', (e) => this.handleProfileVerificationUpload(e));
        }

        // Re-verify and change method handlers
        if (reVerifyBtn) {
            reVerifyBtn.addEventListener('click', () => this.handleReVerification());
        }

        if (changeMethodBtn) {
            changeMethodBtn.addEventListener('click', () => this.showVerificationMethods());
        }

        // Initialize state
        this.profileSelectedFiles = { front: null, back: null };
        this.resendTimer = null;
    }

    handleProfileFileSelect(event, side) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file
        const maxSize = 5 * 1024 * 1024; // 5MB
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

        if (file.size > maxSize) {
            showToast('File size too large (max 5MB)', 'error');
            return;
        }

        if (!allowedTypes.includes(file.type)) {
            showToast('Invalid file type. Only JPG, PNG, PDF allowed', 'error');
            return;
        }

        this.profileSelectedFiles[side] = file;
        this.showProfileFilePreview(file, side);
        this.updateProfileUploadButton();
    }

    showProfileFilePreview(file, side) {
        const previewContainer = document.getElementById(`profile-${side}-preview`);
        if (!previewContainer) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            previewContainer.innerHTML = `
                <div class="file-preview">
                    <img src="${e.target.result}" alt="${side} preview">
                    <div class="file-info">
                        <span class="file-name">${file.name}</span>
                        <span class="file-size">${this.formatFileSize(file.size)}</span>
                    </div>
                    <button type="button" class="remove-file" onclick="app.removeProfileFile('${side}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        };
        reader.readAsDataURL(file);
    }

    removeProfileFile(side) {
        this.profileSelectedFiles[side] = null;
        const previewContainer = document.getElementById(`profile-${side}-preview`);
        const fileInput = document.getElementById(`profile-${side}-file`);

        if (previewContainer) previewContainer.innerHTML = '';
        if (fileInput) fileInput.value = '';

        this.updateProfileUploadButton();
    }

    updateProfileUploadButton() {
        const uploadBtn = document.getElementById('profile-upload-btn');
        if (uploadBtn) {
            uploadBtn.disabled = !this.profileSelectedFiles.front;
        }
    }

    toggleProfileDebugMode(enabled) {
        this.profileDebugMode = enabled;
        const debugOutput = document.getElementById('profile-debug-output');
        if (debugOutput) {
            debugOutput.style.display = enabled ? 'block' : 'none';
        }

        if (enabled) {
            this.profileDebugLog('🔬 Debug mode enabled - OCR processing details will be shown');
        }
    }

    profileDebugLog(message) {
        if (!this.profileDebugMode) return;

        const debugLog = document.getElementById('profile-debug-log');
        if (debugLog) {
            const timestamp = new Date().toLocaleTimeString();
            debugLog.textContent += `[${timestamp}] ${message}\n`;
            debugLog.scrollTop = debugLog.scrollHeight;
        }
    }

    async handleProfileVerificationUpload(event) {
        event.preventDefault();

        if (!this.profileSelectedFiles.front) {
            showToast('Please select at least the front side of your ID', 'error');
            return;
        }

        this.setProfileUploadingState(true);

        try {
            const formData = new FormData();
            formData.append('frontId', this.profileSelectedFiles.front);

            if (this.profileSelectedFiles.back) {
                formData.append('backId', this.profileSelectedFiles.back);
            }

            this.profileDebugLog('🚀 Starting OCR processing (queued)...');
            this.profileDebugLog('📤 Uploading documents to server...');

            const response = await fetch('/api/verification/upload-documents', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authManager.getToken()}`
                },
                body: formData
            });

            this.profileDebugLog(`📥 Server response: ${response.status} ${response.statusText}`);

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Verification failed');
            }

            // New async behavior: treat successful response as a queued OCR job
            if (result.status === 'queued') {
                showToast(result.message || 'Documents uploaded. We\'ll notify you once processing is complete.', 'info');
                this.profileDebugLog('⏳ OCR processing queued on server. Waiting for notification...');
                this.clearProfileUploadForm();
                return;
            }

            // Fallback: if backend still returns full OCR result, handle it as before
            this.handleProfileVerificationSuccess(result);

        } catch (error) {
            console.error('Profile verification error:', error);
            showToast(`Verification error: ${error.message}`, 'error');
            this.profileDebugLog(`💥 Processing error: ${error.message}`);
        } finally {
            this.setProfileUploadingState(false);
        }
    }

    handleProfileVerificationSuccess(result) {
        const { autoApproved, message, failureReasons } = result;

        // Show debug information if enabled
        if (this.profileDebugMode) {
            this.displayProfileDebugInfo(result);
        }

        // Show appropriate message based on result
        if (autoApproved) {
            showToast(message, 'success');
            // Refresh the profile to show updated verification status
            setTimeout(() => {
                this.loadProfile();
            }, 1000);
        } else {
            // Show failure reasons if available
            if (failureReasons && failureReasons.length > 0) {
                showToast(message, 'error');
            } else {
                showToast(message, 'warning');
            }
        }

        // Clear form
        this.clearProfileUploadForm();
    }

    displayProfileDebugInfo(result) {
        this.profileDebugLog('🎨 === OCR PROCESSING RESULTS ===');

        // Show preprocessing results if available
        if (result.preprocessingResults) {
            this.profileDebugLog('🎨 Image Preprocessing Methods Tried:');
            result.preprocessingResults.forEach(prep => {
                this.profileDebugLog(`  ${prep.method}: ${prep.confidence}% confidence, ${prep.textLength} chars`);
            });
            this.profileDebugLog(`🏆 Best method selected: ${result.method} (${result.description})`);
        }

        // Show extracted text
        const extractedText = result.extractedText || result.results?.front?.extractedText || '';
        this.profileDebugLog(`📝 Extracted Text (${extractedText.length} characters):`);
        this.profileDebugLog(extractedText.substring(0, 300) + (extractedText.length > 300 ? '...' : ''));

        // Show extracted info
        const info = result.results?.front?.extractedInfo || result.extractedInfo || {};
        this.profileDebugLog('🔍 Extracted Information:');
        this.profileDebugLog(`  Student ID: ${info.studentId || 'Not found'}`);
        this.profileDebugLog(`  Name: ${info.name || 'Not found'}`);
        if (info.nameSource) {
            this.profileDebugLog(`  Name Source: ${info.nameSource === 'plv_email' ? '📧 PLV Email' : '👤 User Input'}`);
        }
        this.profileDebugLog(`  University: ${info.university || 'Not found'}`);

        // Show matching results
        const matches = info.matches || {};
        this.profileDebugLog('✅ Matching Results:');
        this.profileDebugLog(`  Student ID Match: ${matches.studentId ? '✅ YES' : '❌ NO'}`);
        this.profileDebugLog(`  Name Match: ${matches.name ? '✅ YES' : '❌ NO'}`);
        if (info.nameSource === 'plv_email' && matches.name) {
            this.profileDebugLog(`  📧 Name verified using PLV email format!`);
        }
        this.profileDebugLog(`  University Match: ${matches.university ? '✅ YES' : '❌ NO'}`);

        // Show verification decision
        const autoApproved = result.autoApproved;
        this.profileDebugLog(`🎯 Verification Decision: ${autoApproved ? '✅ AUTO-APPROVED' : '⏳ REQUIRES REVIEW'}`);

        this.profileDebugLog('🎨 === END OCR RESULTS ===\n');
    }

    setProfileUploadingState(isUploading) {
        const uploadBtn = document.getElementById('profile-upload-btn');
        const progressContainer = document.getElementById('profile-upload-progress');

        if (uploadBtn) {
            uploadBtn.disabled = isUploading;
            uploadBtn.innerHTML = isUploading ?
                '<i class="fas fa-spinner fa-spin"></i> Uploading documents...' :
                '<i class="fas fa-upload"></i> Upload Documents for Verification';
        }

        if (progressContainer) {
            // Show progress only during the short upload phase, not for the entire OCR time
            progressContainer.style.display = isUploading ? 'block' : 'none';
        }
    }

    clearProfileUploadForm() {
        this.profileSelectedFiles = { front: null, back: null };

        const frontFile = document.getElementById('profile-front-file');
        const backFile = document.getElementById('profile-back-file');
        const frontPreview = document.getElementById('profile-front-preview');
        const backPreview = document.getElementById('profile-back-preview');

        if (frontFile) frontFile.value = '';
        if (backFile) backFile.value = '';
        if (frontPreview) frontPreview.innerHTML = '';
        if (backPreview) backPreview.innerHTML = '';

        this.updateProfileUploadButton();
    }

    handleReVerification() {
        // Reload the verification tab to show upload form
        this.loadProfileTabContent('verification');
    }

    // Email Verification Methods
    showEmailVerification() {
        const methodsSection = document.querySelector('.verification-methods');
        const emailSection = document.getElementById('email-verification-section');

        if (methodsSection) methodsSection.style.display = 'none';
        if (emailSection) emailSection.style.display = 'block';
    }

    showDocumentVerification() {
        const methodsSection = document.querySelector('.verification-methods');
        const documentSection = document.getElementById('document-verification-section');

        if (methodsSection) methodsSection.style.display = 'none';
        if (documentSection) documentSection.style.display = 'block';
    }

    showVerificationMethods() {
        const methodsSection = document.querySelector('.verification-methods');
        const emailSection = document.getElementById('email-verification-section');
        const documentSection = document.getElementById('document-verification-section');

        if (methodsSection) methodsSection.style.display = 'block';
        if (emailSection) emailSection.style.display = 'none';
        if (documentSection) documentSection.style.display = 'none';
    }

    async sendVerificationCode() {
        const sendBtn = document.getElementById('send-verification-code');
        const originalText = sendBtn.innerHTML;

        try {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

            const user = authManager.getCurrentUser();
            if (!user || !user.email) {
                throw new Error('No email found for verification');
            }

            await api.sendOTP(user.email);

            // Show code input step
            document.getElementById('send-code-step').style.display = 'none';
            document.getElementById('verify-code-step').style.display = 'block';

            // Start resend timer
            this.startResendTimer();

            showToast('Verification code sent to your email!', 'success');

        } catch (error) {
            console.error('Send verification code error:', error);
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = originalText;
        }
    }

    async verifyEmailCode() {
        const codeInput = document.getElementById('verification-code');
        const verifyBtn = document.getElementById('verify-code-btn');
        const code = codeInput.value.trim();

        if (code.length !== 6) {
            showToast('Please enter a 6-digit verification code', 'error');
            return;
        }

        const originalText = verifyBtn.innerHTML;

        try {
            verifyBtn.disabled = true;
            verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

            const user = authManager.getCurrentUser();
            if (!user || !user.email) {
                throw new Error('No email found for verification');
            }

            await api.verifyOTP(user.email, code);

            // Show success step
            document.getElementById('verify-code-step').style.display = 'none';
            document.getElementById('email-success-step').style.display = 'block';

            // Update user data
            authManager.currentUser.email_verified = true;
            authManager.currentUser.is_verified = true;
            authManager.currentUser.verification_method = 'email';

            showToast('Email verified successfully!', 'success');

            // Reload verification tab after 2 seconds
            setTimeout(() => {
                this.loadProfileTabContent('verification');
            }, 2000);

        } catch (error) {
            console.error('Verify email code error:', error);
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = originalText;
        }
    }

    async resendVerificationCode() {
        const resendBtn = document.getElementById('resend-code-btn');
        const originalText = resendBtn.innerHTML;

        try {
            resendBtn.disabled = true;
            resendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

            const user = authManager.getCurrentUser();
            if (!user || !user.email) {
                throw new Error('No email found for verification');
            }

            await api.sendOTP(user.email);

            // Restart resend timer
            this.startResendTimer();
            showToast('New verification code sent!', 'success');

        } catch (error) {
            console.error('Resend verification code error:', error);
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            resendBtn.innerHTML = originalText;
        }
    }

    startResendTimer() {
        const resendBtn = document.getElementById('resend-code-btn');
        const timerSpan = document.getElementById('resend-timer');
        let seconds = 60;
        if (this.resendTimer) {
            clearInterval(this.resendTimer);
        }

        resendBtn.disabled = true;

        this.resendTimer = setInterval(() => {
            seconds--;
            if (timerSpan) timerSpan.textContent = seconds;

            if (seconds <= 0) {
                clearInterval(this.resendTimer);
                resendBtn.disabled = false;
                if (timerSpan) timerSpan.textContent = '60';
            }
        }, 1000);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    setupEditProfileButton() {
        const editProfileBtn = document.getElementById('edit-profile-btn');
        console.log('Setting up edit profile button:', editProfileBtn);
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Edit profile button clicked');
                this.openEditProfileModal();
            });
            console.log('Edit profile button event listener added');
        } else {
            console.log('Edit profile button not found');
        }
    }

    setupEditProfilePictureButton() {
        const editAvatarBtn = document.getElementById('edit-avatar');
        if (!editAvatarBtn) {
            console.log('Edit avatar button not found');
            return;
        }

        editAvatarBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Edit profile picture button clicked');
            this.openEditProfilePictureModal();
        });

        console.log('Edit profile picture button setup complete');
    }

    openEditProfilePictureModal() {
        console.log('Opening profile picture modal...');

        if (!authManager.currentUser) {
            console.error('No current user found');
            showToast('Please log in first', 'error');
            return;
        }

        // Use authManager's openModal method (since it's working for other modals)
        authManager.openModal('edit-profile-picture-modal');

        // Now set up the event listeners
        setTimeout(() => {
            const modal = document.getElementById('edit-profile-picture-modal');
            if (modal) {
                const closeBtn = document.getElementById('close-edit-picture-modal');
                const cancelBtn = document.getElementById('cancel-picture-upload');
                const uploadArea = document.getElementById('picture-upload-area');
                const fileInput = document.getElementById('profile-picture-input');
                const uploadBtn = document.getElementById('upload-picture-btn');

                if (closeBtn) closeBtn.addEventListener('click', () => modal.remove());
                if (cancelBtn) cancelBtn.addEventListener('click', () => modal.remove());

                if (uploadArea && fileInput) {
                    uploadArea.addEventListener('click', () => fileInput.click());
                    fileInput.addEventListener('change', (e) => this.handleProfilePictureSelect(e, modal));
                }

                if (uploadBtn) {
                    uploadBtn.addEventListener('click', () => this.handleProfilePictureUpload(modal));
                }

                console.log('Profile picture modal setup complete');
            }
        }, 100);
    }



    handleProfilePictureSelect(event, modal) {
        const file = event.target.files[0];
        if (!file) return;

        // Validation
        const maxSize = 5 * 1024 * 1024; // 5MB
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];

        if (file.size > maxSize) {
            showToast('File size too large. Max 5MB', 'error');
            return;
        }

        if (!allowedTypes.includes(file.type)) {
            showToast('Invalid file type. Only JPG, PNG allowed', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.initProfileCropper(modal, e.target.result);
        };
        reader.readAsDataURL(file);
    }

    initProfileCropper(modal, imgSrc) {
        // Switch to crop step
        const stepUpload = modal.querySelector('#picture-step-upload');
        const stepCrop = modal.querySelector('#picture-step-crop');
        const backBtn = modal.querySelector('#back-to-upload');
        const uploadBtn = modal.querySelector('#upload-picture-btn');
        if (stepUpload && stepCrop) {
            stepUpload.style.display = 'none';
            stepCrop.style.display = 'block';
        }
        if (backBtn) backBtn.style.display = 'inline-flex';
        if (uploadBtn) uploadBtn.disabled = false;

        const img = modal.querySelector('#crop-image');
        const viewport = modal.querySelector('#crop-viewport');
        const zoom = modal.querySelector('#crop-zoom');
        const resetBtn = modal.querySelector('#crop-reset');

        if (!img || !viewport || !zoom) return;
        img.src = imgSrc;

        const state = {
            scale: 1,
            minScale: 1,
            dx: 0,
            dy: 0,
            iw: 0,
            ih: 0,
            v: viewport.clientWidth
        };
        this._profileCropState = state;

        img.onload = () => {
            state.iw = img.naturalWidth || img.width;
            state.ih = img.naturalHeight || img.height;
            const scaleX = state.v / state.iw;
            const scaleY = state.v / state.ih;
            state.minScale = Math.max(scaleX, scaleY);
            state.scale = state.minScale;
            zoom.min = state.minScale.toString();
            zoom.max = (state.minScale * 3).toString();
            zoom.step = '0.01';
            zoom.value = state.scale.toString();
            this.updateProfileCropTransform(img, state);
        };

        // Dragging
        let dragging = false;
        let lastX = 0, lastY = 0;
        const onDown = (e) => {
            dragging = true;
            viewport.classList.add('dragging');
            lastX = (e.touches ? e.touches[0].clientX : e.clientX);
            lastY = (e.touches ? e.touches[0].clientY : e.clientY);
            e.preventDefault();
        };
        const onMove = (e) => {
            if (!dragging) return;
            const x = (e.touches ? e.touches[0].clientX : e.clientX);
            const y = (e.touches ? e.touches[0].clientY : e.clientY);
            state.dx += (x - lastX);
            state.dy += (y - lastY);
            lastX = x; lastY = y;
            this.clampProfileCrop(state);
            this.updateProfileCropTransform(img, state);
        };
        const onUp = () => {
            dragging = false;
            viewport.classList.remove('dragging');
        };
        viewport.addEventListener('mousedown', onDown);
        viewport.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        viewport.addEventListener('touchstart', onDown, { passive: false });
        viewport.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onUp);

        // Wheel zoom
        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = -e.deltaY;
            const factor = delta > 0 ? 1.05 : 0.95;
            state.scale = Math.min(parseFloat(zoom.max), Math.max(state.minScale, state.scale * factor));
            zoom.value = state.scale.toString();
            this.clampProfileCrop(state);
            this.updateProfileCropTransform(img, state);
        }, { passive: false });

        // Slider zoom
        zoom.addEventListener('input', () => {
            state.scale = parseFloat(zoom.value);
            this.clampProfileCrop(state);
            this.updateProfileCropTransform(img, state);
        });

        // Reset
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                state.scale = state.minScale;
                state.dx = 0;
                state.dy = 0;
                zoom.value = state.scale.toString();
                this.updateProfileCropTransform(img, state);
            });
        }

        // Back button
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                stepCrop.style.display = 'none';
                stepUpload.style.display = 'block';
                backBtn.style.display = 'none';
                uploadBtn.disabled = true;
                // cleanup handlers
                viewport.removeEventListener('mousedown', onDown);
                viewport.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                viewport.removeEventListener('touchstart', onDown);
                viewport.removeEventListener('touchmove', onMove);
                window.removeEventListener('touchend', onUp);
            }, { once: true });
        }
    }

    clampProfileCrop(state) {
        // Ensure the image covers viewport fully
        const dispW = state.iw * state.scale;
        const dispH = state.ih * state.scale;
        const maxOffsetX = Math.max(0, (dispW - state.v) / 2);
        const maxOffsetY = Math.max(0, (dispH - state.v) / 2);
        state.dx = Math.max(-maxOffsetX, Math.min(maxOffsetX, state.dx));
        state.dy = Math.max(-maxOffsetY, Math.min(maxOffsetY, state.dy));
    }

    updateProfileCropTransform(img, state) {
        img.style.transform = `translate(-50%, -50%) translate(${state.dx}px, ${state.dy}px) scale(${state.scale})`;
    }

    async getProfileCroppedBlob(modal) {
        const img = modal.querySelector('#crop-image');
        const viewport = modal.querySelector('#crop-viewport');
        const state = this._profileCropState;
        if (!img || !viewport || !state || !state.iw) return null;
        const v = viewport.clientWidth; // square viewport size

        // Map viewport square to original image coords
        const sx = (-state.dx - v / 2) / state.scale + state.iw / 2;
        const sy = (-state.dy - v / 2) / state.scale + state.ih / 2;
        const sw = v / state.scale;
        const sh = v / state.scale;

        const canvas = document.createElement('canvas');
        const size = 512; // output size
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, size, size);

        // Clamp source rect within image bounds
        const sxc = Math.max(0, Math.min(state.iw - 1, sx));
        const syc = Math.max(0, Math.min(state.ih - 1, sy));
        const swc = Math.max(1, Math.min(state.iw - sxc, sw));
        const shc = Math.max(1, Math.min(state.ih - syc, sh));

        ctx.drawImage(img, sxc, syc, swc, shc, 0, 0, size, size);
        return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.95));
    }

    async handleProfilePictureUpload(modal) {
        const uploadBtn = modal.querySelector('#upload-picture-btn');
        const originalText = uploadBtn.innerHTML;

        try {
            uploadBtn.disabled = true;
            uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

            // Use cropped blob if available; fallback to raw file
            let blob = await this.getProfileCroppedBlob(modal);
            if (!blob) {
                const fileInput = modal.querySelector('#profile-picture-input');
                if (!fileInput || !fileInput.files[0]) {
                    showToast('Please select a picture first', 'error');
                    return;
                }
                blob = fileInput.files[0];
            }

            const formData = new FormData();
            const filename = blob.name || 'profile.png';
            formData.append('profilepicture', blob, filename);

            const response = await fetch('/api/users/profile-picture', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authManager.getToken()}`
                },
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // Update profile image in memory
                authManager.currentUser.profileimage = result.imageUrl;
                authManager.currentUser.avatarurl = result.imageUrl;

                // Update displayed image
                const profileImg = document.getElementById('profile-image');
                if (profileImg) {
                    profileImg.src = result.imageUrl;
                }

                showToast('Profile picture updated successfully!', 'success');

                // Close modal after success
                setTimeout(() => modal.remove(), 500);
            } else {
                throw new Error(result.message || 'Upload failed');
            }
        } catch (error) {
            console.error('Profile picture upload error:', error);
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = originalText;
        }
    }


    openEditProfileModal() {
        console.log('Opening edit profile modal');

        const user = authManager.getCurrentUser();
        console.log('Current user:', user);

        const nameIdLocked = !!(user && (user.is_verified || user.verification_status === 'verified'));
        const lockAttr = nameIdLocked ? 'disabled' : '';

        if (!user) {
            console.log('No user found, cannot open edit profile modal');
            return;
        }

        // Remove any existing modal
        const existingModal = document.getElementById('edit-profile-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHTML = `
        <div class="modal-overlay" id="edit-profile-modal" style="display: flex; z-index: 10000;">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3><i class="fas fa-user-edit"></i> Edit Profile</h3>
                    <button class="modal-close" type="button" id="close-edit-profile-modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <form id="edit-profile-form" class="modal-body">
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="edit-firstname">First Name</label>
                            <input type="text" id="edit-firstname" value="${user.firstname || ''}" ${lockAttr} required>
                        </div>
                        <div class="form-group">
                            <label for="edit-lastname">Last Name</label>
                            <input type="text" id="edit-lastname" value="${user.lastname || ''}" ${lockAttr} required>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="edit-email">Email Address</label>
                        <input type="email" id="edit-email" value="${user.email || ''}" disabled>
                        <small class="form-help">Email cannot be changed</small>
                    </div>
                    
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="edit-student-id">Student ID</label>
                            <input type="text" id="edit-student-id" value="${user.studentid || user.student_id || ''}" ${lockAttr} required>
                        </div>
                        <div class="form-group">
                            <label for="edit-program">Program</label>
                            <input type="text" id="edit-program" value="${user.program || ''}" required>
                        </div>
                    </div>
                    ${nameIdLocked ? `<div class="form-group"><small class="form-help" style="color: var(--warning);">Verified account: name and student number are locked.</small></div>` : ''}
                    
                    <div class="form-group">
                        <label for="edit-bio">Bio (Optional)</label>
                        <textarea id="edit-bio" rows="3" placeholder="Tell others about yourself...">${user.bio || ''}</textarea>
                    </div>
                    
                    <div class="modal-footer">
                        <button type="button" class="btn btn-outline" id="cancel-edit-profile">Cancel</button>
                        <button type="submit" class="btn btn-primary" id="save-profile-btn">
                            <i class="fas fa-save"></i> Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

        console.log('Adding modal HTML to body');
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Get modal element
        const modal = document.getElementById('edit-profile-modal');

        // Prevent background scroll while modal is open
        const restoreScroll = () => { document.body.style.overflow = ''; };
        document.body.style.overflow = 'hidden';

        // CRITICAL: Stop propagation on modal to prevent setupModals from closing it
        modal.addEventListener('click', (e) => {
            // Only close if clicking directly on the overlay (not the content)
            if (e.target === modal) {
                modal.remove();
                restoreScroll();
            }
        }, false);

        // Prevent clicks inside modal content from bubbling
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // Setup close button
        const closeBtn = document.getElementById('close-edit-profile-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                modal.remove();
                restoreScroll();
            });
        }

        // Setup cancel button
        const cancelBtn = document.getElementById('cancel-edit-profile');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                modal.remove();
                restoreScroll();
            });
        }

        // Setup form submit
        const form = document.getElementById('edit-profile-form');
        console.log('Edit profile form:', form);

        if (form) {
            form.addEventListener('submit', (e) => this.handleEditProfileSubmit(e));
            console.log('Form submit handler added');
        } else {
            console.log('Edit profile form not found');
        }

        // Force modal to stay visible
        modal.style.display = 'flex';
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';

        console.log('Modal displayed');
    }




    async loadBorrowingLendingHistory() {
        try {
            const [borrowedResp, lentResp] = await Promise.all([
                api.getBorrowingHistory(),
                api.getLendingHistory()
            ]);

            const borrowedHistory = borrowedResp.borrowedHistory || [];
            const lentHistory = lentResp.lentHistory || [];

            // Cache for modal usage
            this.borrowHistoryCache = borrowedHistory;
            this.lendHistoryCache = lentHistory;

            this.renderHistoryList(
                'borrowing-history-list',
                borrowedHistory,
                'borrowed'
            );

            this.renderHistoryList(
                'lending-history-list',
                lentHistory,
                'lent'
            );

        } catch (error) {
            console.error('Failed to load history:', error);
            const borrowList = document.getElementById('borrowing-history-list');
            const lendList = document.getElementById('lending-history-list');

            if (borrowList) {
                borrowList.innerHTML = '<p class="error-message">Failed to load borrowing history</p>';
            }
            if (lendList) {
                lendList.innerHTML = '<p class="error-message">Failed to load lending history</p>';
            }
        }
    }

    renderHistoryList(containerId, transactions, type) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!Array.isArray(transactions) || transactions.length === 0) {
            container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <p>No ${type === 'borrowed' ? 'borrowing' : 'lending'} history yet</p>
      </div>
    `;
            return;
        }

        container.innerHTML = transactions.map(tx => `
    <div class="history-item ${this.getTransactionStatusClass(tx.status)}">
      <div class="history-book-info">
        <div class="book-title">${tx.title || 'Untitled Book'}</div>
        <div class="book-author">by ${tx.author || 'Unknown Author'}</div>
      </div>
      
      <div class="history-details">
        <div class="history-meta">
          <span class="history-user">
            <i class="fas fa-user"></i>
            ${type === 'borrowed'
                ? `${tx.owner_firstname} ${tx.owner_lastname}`
                : `${tx.borrower_firstname} ${tx.borrower_lastname}`}
          </span>
          <span class="history-date">
            <i class="fas fa-calendar"></i>
            ${new Date(tx.created_at).toLocaleDateString()}
          </span>
        </div>
        
        <div class="history-status">
          <span class="status-badge status-${tx.status}">
            ${this.formatTransactionStatus(tx.status)}
          </span>
        </div>
      </div>
    </div>
  `).join('');
    }

    getTransactionStatusClass(status) {
        const classes = {
            'pending': 'status-pending',
            'approved': 'status-approved',
            'ongoing': 'status-ongoing',
            'completed': 'status-completed',
            'cancelled': 'status-cancelled',
            'rejected': 'status-rejected'
        };
        return classes[status] || '';
    }

    formatTransactionStatus(status) {
        const statuses = {
            'pending': 'Pending',
            'approved': 'Approved',
            'ongoing': 'Ongoing',
            'completed': 'Completed',
            'cancelled': 'Cancelled',
            'rejected': 'Rejected'
        };
        return statuses[status] || status;
    }

    setupHistoryExpandButton() {
        const expandBtn = document.getElementById('expand-history-all');
        const modal = document.getElementById('history-modal');
        if (!expandBtn || !modal) return;

        // Button inside the tab content (re-created whenever tab is rendered)
        expandBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.openHistoryModal('all');
        });

        // Wire modal chrome (tabs / overlay) only once
        if (!modal.dataset.historyModalWired) {
            modal.dataset.historyModalWired = '1';

            const tabs = modal.querySelectorAll('.history-modal-tab');
            tabs.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const tab = btn.getAttribute('data-tab') || 'all';
                    this.setHistoryModalTab(tab);
                });
            });

            // Close modal when clicking overlay
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        }
    }

    openHistoryModal(initialTab = 'all') {
        const modal = document.getElementById('history-modal');
        const content = document.getElementById('history-modal-content');
        if (!modal || !content) return;

        const hasCachedData = Array.isArray(this.borrowHistoryCache) && this.borrowHistoryCache.length > 0 ||
            Array.isArray(this.lendHistoryCache) && this.lendHistoryCache.length > 0;

        const showError = () => {
            content.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-circle"></i>
          <p>Could not load history. Please try again later.</p>
        </div>
      `;
        };

        const renderAndOpen = (tabName) => {
            this.setHistoryModalTab(tabName);
            if (window.authManager && typeof authManager.openModal === 'function') {
                authManager.openModal('history-modal');
            } else {
                modal.classList.add('active');
            }
        };

        if (!hasCachedData) {
            content.innerHTML = `
        <div class="loading-state">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Loading history...</p>
        </div>
      `;

            this.loadBorrowingLendingHistory()
                .then(() => renderAndOpen(initialTab))
                .catch((err) => {
                    console.error('Failed to load history for modal:', err);
                    showError();
                });
        } else {
            renderAndOpen(initialTab);
        }
    }

    setHistoryModalTab(tabName) {
        const modal = document.getElementById('history-modal');
        const content = document.getElementById('history-modal-content');
        if (!modal || !content) return;

        const normalizedTab = ['borrow', 'lend', 'all'].includes(tabName) ? tabName : 'all';

        // Update tab buttons
        const tabs = modal.querySelectorAll('.history-modal-tab');
        tabs.forEach(btn => {
            const btnTab = btn.getAttribute('data-tab') || 'all';
            btn.classList.toggle('active', btnTab === normalizedTab);
        });

        const items = this.getNormalizedHistoryForModal(normalizedTab);
        content.innerHTML = this.renderHistoryModalList(items, normalizedTab);
    }

    getNormalizedHistoryForModal(tabName) {
        const borrow = Array.isArray(this.borrowHistoryCache) ? this.borrowHistoryCache : [];
        const lend = Array.isArray(this.lendHistoryCache) ? this.lendHistoryCache : [];
        const result = [];

        if (tabName === 'borrow' || tabName === 'all') {
            borrow.forEach(tx => {
                result.push({
                    type: 'borrow',
                    title: tx.title || 'Untitled Book',
                    author: tx.author || 'Unknown Author',
                    counterpart: `${(tx.owner_firstname || '').trim()} ${(tx.owner_lastname || '').trim()}`.trim(),
                    status: tx.status || '',
                    created_at: tx.created_at
                });
            });
        }

        if (tabName === 'lend' || tabName === 'all') {
            lend.forEach(tx => {
                result.push({
                    type: 'lend',
                    title: tx.title || 'Untitled Book',
                    author: tx.author || 'Unknown Author',
                    counterpart: `${(tx.borrower_firstname || '').trim()} ${(tx.borrower_lastname || '').trim()}`.trim(),
                    status: tx.status || '',
                    created_at: tx.created_at
                });
            });
        }

        if (tabName === 'all') {
            result.sort((a, b) => {
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bTime - aTime;
            });
        }

        return result;
    }

    renderHistoryModalList(items, tabName) {
        if (!Array.isArray(items) || items.length === 0) {
            const label = tabName === 'borrow'
                ? 'borrowing'
                : tabName === 'lend'
                    ? 'lending'
                    : 'borrowing or lending';

            return `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>No ${label} history yet.</p>
        </div>
      `;
        }

        return `
        <ul class="history-modal-list">
            ${items.map(item => `
                <li class="history-modal-item">
                    <div class="history-modal-main">
                        <div class="history-modal-title">${escapeHtml(String(item.title || 'Untitled Book'))}</div>
                        <div class="history-modal-sub">
                            ${escapeHtml(String(item.author || 'Unknown Author'))}
                            ${item.counterpart
                ? ` • ${item.type === 'borrow' ? 'From' : 'To'} ${escapeHtml(String(item.counterpart))}`
                : ''}
                        </div>
                    </div>
                    <div class="history-modal-meta">
                        <span class="history-modal-status">${escapeHtml(String((item.status || '').toUpperCase()))}</span>
                        ${item.created_at ? `<span class="history-modal-date">${formatDate(item.created_at)}</span>` : ''}
                    </div>
                </li>
            `).join('')}
        </ul>
      `;
    }


    async handleEditProfileSubmit(event) {
        event.preventDefault();

        const saveBtn = document.getElementById('save-profile-btn');
        const originalText = saveBtn.innerHTML;

        try {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            const locked = document.getElementById('edit-firstname')?.disabled === true;
            const payload = {
                program: document.getElementById('edit-program').value.trim(),
                bio: document.getElementById('edit-bio').value.trim()
            };
            if (!locked) {
                payload.firstname = document.getElementById('edit-firstname').value.trim();
                payload.lastname = document.getElementById('edit-lastname').value.trim();
                payload.studentid = document.getElementById('edit-student-id').value.trim();
            }

            // Validate required fields
            if (!payload.program) {
                throw new Error('Please fill in all required fields');
            }
            if (!locked) {
                if (!payload.firstname || !payload.lastname || !payload.studentid) {
                    throw new Error('Please fill in all required fields');
                }
            }

            // Make API call
            const response = await fetch(`/api/users/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authManager.getToken()}`
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.success) {
                // Close modal
                const modal = document.getElementById('edit-profile-modal');
                if (modal) modal.remove();

                showToast('Profile updated successfully!', 'success');

                // Just reload the page - simplest and safest
                setTimeout(() => window.location.reload(), 500);
            }

        } catch (error) {
            console.error('Profile update error:', error);
            showToast(`Error: ${error.message}`, 'error');

        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }

    // Violation History Methods
    getViolationsTab() {
        return `
            <div class="violations-content">
                <h3>Violation History & Account Standing</h3>
                <div id="violation-summary" class="violation-summary">
                    <div class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Loading account standing...</p>
                    </div>
                </div>
                <div id="violation-list" class="violation-list">
                    <div class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Loading violation history...</p>
                    </div>
                </div>
            </div>
        `;
    }

    async loadViolationHistory() {
        const summaryContainer = document.getElementById('violation-summary');
        const listContainer = document.getElementById('violation-list');
        const user = authManager.getCurrentUser();

        if (!summaryContainer || !listContainer || !user) return;

        try {
            const response = await fetch(`/api/users/violation-history/${user.id}`, {
                headers: {
                    'Authorization': `Bearer ${authManager.getToken()}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch violations');

            const data = await response.json();

            // Render summary
            summaryContainer.innerHTML = `
                <h4>Account Standing</h4>
                <div class="stat-grid">
                    <div class="stat-item">
                        <span class="stat-label">Status:</span>
                        <span class="status-badge ${data.summary.accountStatus}">${this.formatAccountStatus(data.summary.accountStatus)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Offense Count:</span>
                        <span class="offense-count ${data.summary.offenseCount >= 2 ? 'warning' : ''}">${data.summary.offenseCount}/3</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Lowest Credits Reached:</span>
                        <span class="credits-value">${data.summary.lowestCreditReached}</span>
                    </div>
                </div>
                ${data.summary.offenseCount >= 2 ? `
                    <div class="warning-banner">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>${data.summary.offenseCount === 2 ? 'Final Warning: One more violation will result in permanent ban!' : 'Account permanently banned due to repeated violations'}</span>
                    </div>
                ` : ''}
            `;

            // Render violation list
            if (data.violations.length === 0) {
                listContainer.innerHTML = `
                    <div class="no-violations">
                        <i class="fas fa-check-circle"></i>
                        <p>No violations recorded! Keep up the good behavior ✨</p>
                    </div>
                `;
            } else {
                listContainer.innerHTML = `
                    <h4>Recent Violations</h4>
                    <div class="violations-list">
                        ${data.violations.map(v => `
                            <div class="violation-item">
                                <div class="violation-header">
                                    <div class="violation-type">${this.formatViolationType(v.violation_type)}</div>
                                    <div class="violation-date">${new Date(v.created_at).toLocaleDateString()}</div>
                                </div>
                                <div class="violation-details">
                                    <span class="credits-lost">-${v.credits_deducted} credits</span>
                                    <span class="balance-after">Balance after: ${v.credit_balance_after}</span>
                                </div>
                                ${v.description ? `<p class="violation-desc">${v.description}</p>` : ''}
                            </div>
                        `).join('')}
                    </div>
                `;
            }

        } catch (error) {
            console.error('Error loading violation history:', error);
            summaryContainer.innerHTML = '<p class="error-message">Failed to load account standing</p>';
            listContainer.innerHTML = '<p class="error-message">Failed to load violation history</p>';
        }
    }

    formatAccountStatus(status) {
        const statuses = {
            'active': 'Active',
            'warned': 'Warned',
            'restricted': 'Restricted',
            'banned': 'Permanently Banned'
        };
        return statuses[status] || status;
    }

    formatViolationType(type) {
        const types = {
            'late_return': 'Late Return',
            'damaged_book': 'Damaged Book',
            'no_return': 'No Return',
            'other': 'Other Violation'
        };
        return types[type] || type;
    }


}
// ============================
// ADVANCED BOOK SEARCH & FILTER SYSTEM
// ============================

document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("book-search");
    const programFilter = document.getElementById("program-filter");
    const conditionFilter = document.getElementById("condition-filter");
    const availabilityFilter = document.getElementById("availability-filter");
    const sortFilter = document.getElementById("sort-filter");
    sortFilter.addEventListener("change", performSearch);
    const booksGrid = document.getElementById("books-grid");

    // === AUTOCOMPLETE (robust, debug-friendly) ===
    let autocompleteBox = null;
    let debounceTimer = null;
    let lastQuery = '';
    let activeRequestId = 0;

    function ensureAutocompleteBox() {
        if (!autocompleteBox) {
            autocompleteBox = document.createElement('div');
            autocompleteBox.className = 'autocomplete-list';
            // append after the input inside the container
            if (searchInput && searchInput.parentNode) {
                searchInput.parentNode.appendChild(autocompleteBox);
            } else {
                document.body.appendChild(autocompleteBox);
            }
        }
        autocompleteBox.innerHTML = '';
        return autocompleteBox;
    }

    async function handleAutocomplete() {
        const q = searchInput.value.trim();
        lastQuery = q;

        // hide on short query
        if (q.length < 2) {
            if (autocompleteBox) autocompleteBox.innerHTML = '';
            return;
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            const thisRequestId = ++activeRequestId;
            try {
                // call backend - try multiple shapes defensively
                let resp = null;
                try {
                    // Prefer api.getBookSuggestions if available
                    if (typeof api.getBookSuggestions === 'function') {
                        resp = await api.getBookSuggestions({ q }); // some clients use object param
                    } else if (typeof api.searchBooks === 'function') {
                        // fallback to searchBooks
                        resp = await api.searchBooks({ query: q, limit: 10 });
                    } else if (typeof api.getBooks === 'function') {
                        resp = await api.getBooks({ query: q, limit: 10 });
                    } else {
                        throw new Error('No API method available for suggestions');
                    }
                } catch (fetchErr) {
                    // try alternate call signature: api.getBookSuggestions(q)
                    if (typeof api.getBookSuggestions === 'function') {
                        try { resp = await api.getBookSuggestions(q); } catch (_) { /* swallow */ }
                    }
                }

                // For debugging: log the raw response
                console.log('AUTOCOMPLETE - raw response for "', q, '":', resp);

                // If another request started after this one, discard these results
                if (thisRequestId !== activeRequestId) {
                    console.log('AUTOCOMPLETE - stale response discarded');
                    return;
                }

                // Normalize response -> suggestions array of objects
                let suggestions = [];

                if (!resp) {
                    suggestions = [];
                } else if (Array.isArray(resp)) {
                    // backend directly returned array
                    suggestions = resp;
                } else if (Array.isArray(resp.suggestions)) {
                    suggestions = resp.suggestions;
                } else if (Array.isArray(resp.results)) {
                    suggestions = resp.results;
                } else if (Array.isArray(resp.books)) {
                    // searchBooks returns {books: [...]}
                    suggestions = resp.books.map(b => ({
                        title: b.title,
                        author: b.author,
                        course_code: b.course_code || b.course || b.owner_program
                    }));
                } else {
                    // try to find any iterable array inside object
                    const arr = Object.values(resp).find(v => Array.isArray(v));
                    suggestions = arr || [];
                }

                // Normalize element shape to ensure title/author/course_code exist
                suggestions = suggestions.map(item => {
                    if (typeof item === 'string') {
                        return { title: item, author: 'Unknown', course_code: 'N/A' };
                    } else {
                        return {
                            title: item.title || item.name || item.book_title || item.title_text || 'Untitled',
                            author: item.author || item.author_name || item.book_author || 'Unknown',
                            course_code: item.course_code || item.course || item.owner_program || 'N/A',
                            raw: item
                        };
                    }
                });

                ensureAutocompleteBox();

                if (!suggestions.length) {
                    autocompleteBox.innerHTML = `<div class="autocomplete-item">No suggestions found</div>`;
                    return;
                }

                // Render items
                autocompleteBox.innerHTML = suggestions.map((s, idx) => `
                <div class="autocomplete-item" 
                     data-idx="${idx}" 
                     data-title="${(s.title || '').replace(/"/g, '&quot;')}" 
                     data-author="${(s.author || '').replace(/"/g, '&quot;')}"
                     data-course="${(s.course_code || '').replace(/"/g, '&quot;')}">
                    <strong>${s.title || 'Untitled'}</strong><br>
                    <small>by ${s.author || 'Unknown'} (${s.course_code || 'N/A'})</small>
                </div>
            `).join('');

                // Attach click listeners (clear previous first)
                autocompleteBox.querySelectorAll('.autocomplete-item').forEach(item => {
                    item.removeEventListener('click', onAutocompleteClick); // safe remove
                    item.addEventListener('click', onAutocompleteClick);
                });

            } catch (err) {
                console.error('Autocomplete fetch/render error:', err);
                ensureAutocompleteBox();
                autocompleteBox.innerHTML = `<div class="autocomplete-item">Error loading suggestions</div>`;
            }
        }, 240); // debounce
    }

    function onAutocompleteClick(e) {
        const item = e.currentTarget;
        const title = item.getAttribute('data-title') || '';
        // set search value then perform search
        searchInput.value = title;
        if (autocompleteBox) autocompleteBox.innerHTML = '';
        performSearch();
    }


    // Perform book search (delegate to BooksManager so pagination & Load More work)
    async function performSearch() {
        const query = (searchInput?.value || '').trim();
        const extra = {
            program: programFilter?.value || '',
            condition: conditionFilter?.value || '',
            availability: availabilityFilter?.value || '',
            sort: sortFilter ? (sortFilter.value || '') : ''
        };

        if (window.booksManager) {
            await window.booksManager.searchBooks(query, extra);
        } else {
            // Fallback: initial implementation if BooksManager isn't available
            try {
                const data = await api.searchBooks({ query, ...extra });
                const booksGrid = document.getElementById('books-grid');
                if (booksGrid) {
                    booksGrid.innerHTML = (data.books || []).map(() => '').join('');
                }
            } catch (error) {
                console.error('Search failed:', error);
            }
        }
    }

    // Note: Rendering is handled by BooksManager.renderBooks


    // Open detailed view of a single book
    async function openBookDetails(bookId) {
        try {
            const data = await api.getBook(bookId);
            const book = data.book;

            showBookDetailModal({
                title: book.title ?? "Untitled",
                author: book.author ?? "Unknown",
                isbn: book.isbn ?? "N/A",
                subject: book.subject ?? "N/A",
                minimum_credits: book.minimum_credits ?? "N/A",
                status: book.status ?? (book.is_available ? "Available" : "Borrowed"),
                description: book.description ?? "No description available.",
                image_url: book.image_url ?? "/images/default-book.png"
            });

            saveRecentlyViewed(book);
        } catch (error) {
            console.error("Failed to open book details:", error);
        }
    }


    // Save recently viewed books
    function saveRecentlyViewed(book) {
        const viewed = JSON.parse(localStorage.getItem("recentlyViewed") || "[]");
        const exists = viewed.find(b => b.id === book.id);
        if (!exists) {
            viewed.unshift({
                id: book.id,
                title: book.title,
                author: book.author,
                image_url: book.image_url
            });
        }
        localStorage.setItem("recentlyViewed", JSON.stringify(viewed.slice(0, 6)));
    }

    function renderRecentlyViewed() {
        const container = document.getElementById("recently-viewed-list");
        if (!container) return;

        const viewed = JSON.parse(localStorage.getItem("recentlyViewed") || "[]");
        container.innerHTML = viewed.length
            ? viewed.map(b => `
            <div class="recent-item" onclick="api.getBook(${b.id}).then(r => showBookDetailModal(r.book))">
                <img src="${b.image_url || '/images/default-book.png'}" alt="${b.title}">
                <p>${b.title}</p>
            </div>
          `).join("")
            : "<p>No recently viewed books.</p>";
    }

    function renderSavedSearches() {
        const container = document.getElementById("saved-searches-list");
        if (!container) return;

        const searches = api.getSavedSearches();
        container.innerHTML = searches.length
            ? searches.map((f, i) => `
            <button class="saved-search-item" data-index="${i}">
                ${f.query || 'Untitled Search'}
            </button>
          `).join("")
            : "<p>No saved searches yet.</p>";

        container.querySelectorAll(".saved-search-item").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = btn.dataset.index;
                const filters = api.getSavedSearches()[idx];
                Object.assign(searchInput, { value: filters.query || '' });
                programFilter.value = filters.program || '';
                conditionFilter.value = filters.condition || '';
                availabilityFilter.value = filters.availability || '';
                performSearch();
            });
        });
    }

    function renderRecommendations() {
        const recContainer = document.getElementById("recommended-books");
        if (!recContainer) return;

        const viewed = JSON.parse(localStorage.getItem("recentlyViewed") || "[]");
        if (viewed.length === 0) {
            recContainer.innerHTML = "<p>No recommendations yet.</p>";
            return;
        }

        const recs = viewed.slice(0, 3);
        recContainer.innerHTML = recs.map(b => `
    <div class="rec-card" onclick="api.getBook(${b.id}).then(r => showBookDetailModal(r.book))">
      <img src="${b.image_url || '/images/default-book.png'}" alt="${b.title}">
      <p>${b.title}</p>
    </div>
  `).join("");
    }

    // ========================================
    // SAVED SEARCHES FUNCTIONALITY
    // ========================================

    class SavedSearchesManager {
        constructor() {
            this.savedSearches = [];
            this.init();
        }

        init() {
            this.setupEventListeners();
        }

        setupEventListeners() {
            // Save current search button
            const saveSearchBtn = document.getElementById('save-search-btn');
            if (saveSearchBtn) {
                saveSearchBtn.addEventListener('click', () => this.showSaveSearchModal());
            }

            // Saved searches dropdown/list
            const savedSearchesList = document.getElementById('saved-searches-list');
            if (savedSearchesList) {
                savedSearchesList.addEventListener('click', (e) => {
                    if (e.target.classList.contains('apply-search')) {
                        const searchId = e.target.dataset.searchId;
                        this.applySavedSearch(searchId);
                    } else if (e.target.classList.contains('delete-search')) {
                        const searchId = e.target.dataset.searchId;
                        this.deleteSavedSearch(searchId);
                    }
                });
            }
        }

        async loadSavedSearches() {
            if (!authManager.isAuthenticated) return;

            try {
                const response = await api.getSavedSearches();
                this.savedSearches = response.searches || [];
                this.renderSavedSearches();
            } catch (error) {
                console.error('Failed to load saved searches:', error);
            }
        }

        renderSavedSearches() {
            const container = document.getElementById('saved-searches-list');
            if (!container) return;

            if (this.savedSearches.length === 0) {
                container.innerHTML = '<p class="empty-state">No saved searches yet</p>';
                return;
            }

            container.innerHTML = this.savedSearches.map(search => `
      <div class="saved-search-item" data-search-id="${search.id}">
        <div class="search-info">
          <h4>${search.search_name}</h4>
          <small>Last used: ${this.formatDate(search.last_used || search.created_at)}</small>
        </div>
        <div class="search-actions">
          <button class="btn-icon apply-search" data-search-id="${search.id}" title="Apply this search">
            <i class="fas fa-search"></i>
          </button>
          <button class="btn-icon delete-search" data-search-id="${search.id}" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
        }


        showSaveSearchModal() {
            // Get current search filters from BooksManager
            const currentFilters = booksManager.filters;

            if (Object.keys(currentFilters).length === 0) {
                showToast('Please apply some filters before saving', 'warning');
                return;
            }

            const searchName = prompt('Enter a name for this search:');
            if (!searchName) return;

            this.saveCurrentSearch(searchName, currentFilters);
        }

        async saveCurrentSearch(name, criteria) {
            try {
                await api.saveSearch(name, criteria);
                showToast('Search saved successfully!', 'success');
                await this.loadSavedSearches();
            } catch (error) {
                console.error('Failed to save search:', error);
                showToast('Failed to save search', 'error');
            }
        }

        async applySavedSearch(searchId) {
            const search = this.savedSearches.find(s => s.id == searchId);
            if (!search) return;

            try {
                // Update last_used timestamp
                await api.updateSavedSearch(searchId);

                // Apply the filters to BooksManager
                booksManager.filters = { ...search.search_criteria };
                await booksManager.loadBooks(search.search_criteria, true);

                // Update UI filters to reflect the applied search
                this.updateFilterUI(search.search_criteria);

                showToast(`Applied search: ${search.search_name}`, 'success');
            } catch (error) {
                console.error('Failed to apply saved search:', error);
                showToast('Failed to apply search', 'error');
            }
        }

        async deleteSavedSearch(searchId) {
            if (!confirm('Are you sure you want to delete this saved search?')) return;

            try {
                await api.deleteSavedSearch(searchId);
                showToast('Search deleted successfully', 'success');
                await this.loadSavedSearches();
            } catch (error) {
                console.error('Failed to delete search:', error);
                showToast('Failed to delete search', 'error');
            }
        }

        updateFilterUI(filters) {
            // Update filter dropdowns/inputs to reflect the saved search
            if (filters.subject) {
                const subjectFilter = document.getElementById('subject-filter');
                if (subjectFilter) subjectFilter.value = filters.subject;
            }
            if (filters.program) {
                const programFilter = document.getElementById('program-filter');
                if (programFilter) programFilter.value = filters.program;
            }
            if (filters.condition) {
                const conditionFilter = document.getElementById('condition-filter');
                if (conditionFilter) conditionFilter.value = filters.condition;
            }
            if (filters.availability !== undefined) {
                const availFilter = document.getElementById('availability-filter');
                if (availFilter) availFilter.value = filters.availability;
            }
            // Add more filter mappings as needed
        }

        formatDate(dateString) {
            if (!dateString) return 'Never';
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
            if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
            return date.toLocaleDateString();
        }
    }

    // ========================================
    // INITIALIZE SAVED SEARCHES MANAGER
    // ========================================
    let savedSearchesManager = null;

    // Initialize when DOM is ready
    function initSavedSearches() {
        try {
            if (typeof SavedSearchesManager !== 'undefined') {
                savedSearchesManager = new SavedSearchesManager();
                window.savedSearchesManager = savedSearchesManager;
                console.log('✅ SavedSearchesManager initialized:', savedSearchesManager);

                // Load saved searches if user is authenticated
                if (authManager && authManager.isAuthenticated) {
                    setTimeout(() => {
                        savedSearchesManager.loadSavedSearches();
                    }, 1000);
                }
            } else {
                console.error('❌ SavedSearchesManager class not found');
            }
        } catch (error) {
            console.error('❌ Failed to initialize SavedSearchesManager:', error);
        }
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSavedSearches);
    } else {
        initSavedSearches();
    }

    // Listen for login events
    document.addEventListener('login-success', () => {
        if (window.savedSearchesManager) {
            window.savedSearchesManager.loadSavedSearches();
        }
    });


    // Call on page load
    document.addEventListener('DOMContentLoaded', () => {
        if (localStorage.getItem('token')) {
            checkAccountStatus();
        }
    });


    // Display a modal for book details
    function showBookDetailModal(book) {
        const modal = document.createElement("div");
        modal.className = "modal active";
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${book.title}</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <img src="${book.image_url || '/images/default-book.png'}" alt="${book.title}">
                    <p><strong>Author:</strong> ${book.author}</p>
                    <p><strong>ISBN:</strong> ${book.isbn || 'N/A'}</p>
                    <p><strong>Subject:</strong> ${book.subject || 'N/A'}</p>
                    <p><strong>Credits Required:</strong> ${book.minimum_credits || 'N/A'}</p>
                    <p><strong>Availability:</strong> ${book.status}</p>
                    <p><strong>Description:</strong> ${book.description || 'No description available.'}</p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // ======================
    // EVENT LISTENERS
    // ======================
    searchInput.addEventListener("input", handleAutocomplete);
    programFilter.addEventListener("change", performSearch);
    conditionFilter.addEventListener("change", performSearch);
    availabilityFilter.addEventListener("change", performSearch);

    // Enter key triggers search
    searchInput.addEventListener("keypress", e => {
        if (e.key === "Enter") {
            e.preventDefault();
            performSearch();
        }
    });

    // ============================================
    // NOTIFICATION MANAGER
    // ============================================

    class NotificationManager {
        constructor() {
            this.notificationBell = document.getElementById('notification-bell');
            this.notificationDropdown = document.getElementById('notification-dropdown');
            this.notificationBadge = document.getElementById('notification-badge');
            this.notificationList = document.getElementById('notification-list');
            this.markAllReadBtn = document.getElementById('mark-all-read-btn');

            this.currentTab = 'all';
            this.notifications = [];
            this.unreadCount = 0;
            this._hasPolledOnce = false;

            this.init();
        }

        init() {
            // Event listeners
            if (this.notificationBell) {
                this.notificationBell.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleDropdown();
                });
            }

            if (this.markAllReadBtn) {
                this.markAllReadBtn.addEventListener('click', () => this.markAllAsRead());
            }

            // Tab switching
            document.querySelectorAll('.notification-tab').forEach(tab => {
                tab.addEventListener('click', (e) => this.switchTab(tab.dataset.tab, e));
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#notification-bell') &&
                    !e.target.closest('.notification-dropdown')) {
                    this.closeDropdown();
                }
            });

            // Start polling for notifications
            this.startPolling();

            // Perform an initial load so the navbar badge reflects
            // the current unread count immediately for logged-in users.
            try {
                if (typeof authManager !== 'undefined' && authManager && authManager.isAuthenticated) {
                    this.loadNotifications();
                }
            } catch (_) { /* noop */ }
        }

        toggleDropdown() {
            if (this.notificationDropdown.classList.contains('active')) {
                this.closeDropdown();
            } else {
                this.openDropdown();
            }
        }

        async openDropdown() {
            this.notificationDropdown.classList.add('active');
            await this.loadNotifications();
        }

        closeDropdown() {
            this.notificationDropdown.classList.remove('active');
        }

        switchTab(tab, evt) {
            this.currentTab = tab;

            // Update UI
            document.querySelectorAll('.notification-tab').forEach(t => {
                t.classList.remove('active');
            });
            if (evt && evt.target) {
                evt.target.classList.add('active');
            } else {
                const el = document.querySelector(`.notification-tab[data-tab="${tab}"]`);
                if (el) el.classList.add('active');
            }

            // Render notifications
            this.renderNotifications();
        }

        async loadNotifications() {
            try {
                const unreadOnly = this.currentTab === 'unread';
                const response = await api.getNotifications(unreadOnly, 20, 0);

                this.notifications = response.notifications || [];
                this.unreadCount = response.unreadCount || 0;

                this.updateBadge();
                this.renderNotifications();
            } catch (error) {
                console.error('Failed to load notifications:', error);
                this.notificationList.innerHTML = `
                <div class="notification-empty">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Failed to load notifications</p>
                </div>
            `;
            }
        }

        renderNotifications() {
            if (this.notifications.length === 0) {
                this.notificationList.innerHTML = `
                <div class="notification-empty">
                    <i class="fas fa-inbox"></i>
                    <p>No ${this.currentTab === 'unread' ? 'unread ' : ''}notifications yet</p>
                </div>
            `;
                return;
            }

            this.notificationList.innerHTML = this.notifications.map(n => {
                let msg = '';
                try {
                    const body = typeof n.body === 'string' ? JSON.parse(n.body) : n.body;
                    if (body && typeof body === 'object' && body.message) msg = body.message;
                    else if (typeof body === 'string') msg = body;
                } catch (_) {
                    msg = typeof n.body === 'string' ? n.body : (n.message || '');
                }
                const cat = n.category || n.type || '';
                const created = n.created || n.created_at;
                const safeTitle = typeof escapeHtml === 'function' ? escapeHtml(n.title || '') : (n.title || '');
                const safeMsg = typeof escapeHtml === 'function' ? escapeHtml(msg) : msg;
                return `
                <div class="notification-item ${!n.is_read ? 'unread' : ''}" 
                     onclick="notificationManager.handleNotificationClick(${n.id}, '${cat}')">
                    <div class="notification-content">
                        <div class="notification-icon ${this.getNotificationClass(cat)}">
                            ${this.getNotificationIcon(cat)}
                        </div>
                        <div class="notification-text">
                            <div class="notification-title">${safeTitle}</div>
                            <div class="notification-message">${safeMsg}</div>
                            <div class="notification-time">${this.formatTime(created)}</div>
                        </div>
                    </div>
                </div>`;
            }).join('');
        }

        getNotificationIcon(type) {
            const icons = {
                'request': '<i class="fas fa-envelope-open"></i>',
                'approval': '<i class="fas fa-check-circle"></i>',
                'rejection': '<i class="fas fa-times-circle"></i>',
                'pickup': '<i class="fas fa-box-open"></i>',
                'return': '<i class="fas fa-undo"></i>',
                'reminder': '<i class="fas fa-clock"></i>',
                'overdue': '<i class="fas fa-exclamation-triangle"></i>',
                'feedback': '<i class="fas fa-star"></i>'
            };
            return icons[type] || '<i class="fas fa-bell"></i>';
        }

        getNotificationClass(type) {
            const classes = {
                'request': 'request',
                'approval': 'approval',
                'rejection': 'rejection',
                'pickup': 'request',
                'return': 'approval',
                'reminder': 'reminder',
                'overdue': 'overdue',
                'feedback': 'feedback'
            };
            return classes[type] || 'request';
        }

        formatTime(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;

            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);

            if (minutes < 1) return 'Just now';
            if (minutes < 60) return `${minutes}m ago`;
            if (hours < 24) return `${hours}h ago`;
            if (days < 7) return `${days}d ago`;

            return date.toLocaleDateString();
        }

        updateBadge() {
            if (this.notificationBadge) {
                this.notificationBadge.textContent = this.unreadCount;
                if (this.unreadCount > 0) {
                    this.notificationBadge.classList.add('active');
                } else {
                    this.notificationBadge.classList.remove('active');
                }
            }
        }

        showNewNotificationToast(newCountDelta) {
            try {
                const count = Number.isFinite(newCountDelta) && newCountDelta > 0 ? newCountDelta : 1;
                const message = count === 1
                    ? 'You have a new notification. Click to view.'
                    : `You have ${count} new notifications. Click to view.`;

                if (typeof window.showToast === 'function') {
                    const toast = window.showToast(message, 'info', 5000);
                    if (toast) {
                        toast.style.cursor = 'pointer';
                        toast.addEventListener('click', () => {
                            try {
                                if (window.app && typeof window.app.navigateToSection === 'function') {
                                    window.app.navigateToSection('notifications');
                                } else if (window.app && typeof window.app.switchSection === 'function') {
                                    window.app.switchSection('notifications');
                                }
                            } catch (_) { /* noop */ }
                        }, { once: true });
                    }
                }
            } catch (_) { /* noop */ }
        }

        async handleNotificationClick(notificationId, type) {
            try {
                // Mark as read
                if (this.notifications.find(n => n.id === notificationId && !n.is_read)) {
                    await api.markNotificationAsRead(notificationId);
                }

                // Navigate based on type
                switch (type) {
                    case 'request':
                    case 'approval':
                    case 'rejection':
                        if (window.app && typeof window.app.navigateToSection === 'function') window.app.navigateToSection('requests');
                        break;
                    case 'feedback':
                        if (window.app && typeof window.app.navigateToSection === 'function') window.app.navigateToSection('profile');
                        break;
                    case 'reminder':
                    case 'overdue':
                        if (window.app && typeof window.app.navigateToSection === 'function') window.app.navigateToSection('monitoring');
                        break;
                    default:
                        if (window.app && typeof window.app.navigateToSection === 'function') window.app.navigateToSection('notifications');
                }

                // Reload notifications
                await this.loadNotifications();
                this.closeDropdown();
            } catch (error) {
                console.error('Error handling notification click:', error);
            }
        }

        async markAllAsRead() {
            try {
                await api.markAllNotificationsAsRead();
                await this.loadNotifications();
            } catch (error) {
                console.error('Failed to mark all as read:', error);
            }
        }

        startPolling() {
            // Poll for new notifications every 30 seconds
            setInterval(async () => {
                if (document.visibilityState === 'visible') {
                    try {
                        const response = await api.getNotifications(false, 1, 0);
                        const newUnreadCount = response.unreadCount || 0;

                        // Update badge if count changed
                        if (newUnreadCount !== this.unreadCount) {
                            const previousCount = this.unreadCount;
                            this.unreadCount = newUnreadCount;
                            this.updateBadge();

                            // Only treat as new notifications when count increases after the first poll
                            if (this._hasPolledOnce && newUnreadCount > previousCount) {
                                this.playNotificationSound();
                                this.showNewNotificationToast(newUnreadCount - previousCount);
                            }
                        }

                        // Mark that we've completed at least one poll
                        if (!this._hasPolledOnce) {
                            this._hasPolledOnce = true;
                        }

                        // If dropdown is open, refresh the list
                        if (this.notificationDropdown.classList.contains('active')) {
                            await this.loadNotifications();
                        }
                    } catch (error) {
                        console.error('Error polling notifications:', error);
                    }
                }
            }, 30000); // 30 seconds
        }

        playNotificationSound() {
            // Respect user preference if added later
            const pref = localStorage.getItem('notificationSound');
            if (pref === 'off') return;

            try {
                // Reuse shared notification audio if available (used by chat toasts)
                if (!window.__notifAudio) {
                    window.__notifAudio = new Audio('/assets/notif.mp3');
                    try { window.__notifAudio.load(); } catch (_) { /* ignore */ }
                }
                window.__notifAudio.currentTime = 0;
                window.__notifAudio.volume = 0.5;
                const p = window.__notifAudio.play();
                if (p && typeof p.catch === 'function') {
                    p.catch(() => {
                        // Fallback: lightweight Web Audio beep
                        try {
                            const ctx = new (window.AudioContext || window.webkitAudioContext)();
                            const o = ctx.createOscillator();
                            const g = ctx.createGain();
                            o.type = 'sine';
                            o.frequency.value = 880;
                            g.gain.value = 0.04;
                            o.connect(g);
                            g.connect(ctx.destination);
                            o.start();
                            setTimeout(() => { o.stop(); ctx.close(); }, 140);
                        } catch (_) { /* ignore */ }
                    });
                }
            } catch (_) {
                // Final fallback: try a simple Web Audio beep
                try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    const o = ctx.createOscillator();
                    const g = ctx.createGain();
                    o.type = 'sine';
                    o.frequency.value = 880;
                    g.gain.value = 0.04;
                    o.connect(g);
                    g.connect(ctx.destination);
                    o.start();
                    setTimeout(() => { o.stop(); ctx.close(); }, 140);
                } catch (_) { /* ignore */ }
            }
        }
    }

    // Initialize notification manager when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.notificationManager) {
            window.notificationManager = new NotificationManager();
        }
    });

});

// ========================================
// INITIALIZE SAVED SEARCHES MANAGER
// ========================================

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize SavedSearchesManager once
    if (typeof SavedSearchesManager !== 'undefined' && !window.savedSearchesManager) {
        window.savedSearchesManager = new SavedSearchesManager();
        savedSearchesManager = window.savedSearchesManager;
        console.log('✅ SavedSearchesManager initialized');

        // Load saved searches if user is logged in
        if (authManager && authManager.isAuthenticated) {
            setTimeout(() => {
                if (window.savedSearchesManager && typeof window.savedSearchesManager.loadSavedSearches === 'function') {
                    window.savedSearchesManager.loadSavedSearches();
                }
            }, 500); // Small delay to ensure everything is loaded
        }
    }
});

// Listen for login events
document.addEventListener('login-success', () => {
    if (window.savedSearchesManager && typeof window.savedSearchesManager.loadSavedSearches === 'function') {
        window.savedSearchesManager.loadSavedSearches();
    }
});


if (authManager.isAuthenticated && window.savedSearchesManager && typeof window.savedSearchesManager.loadSavedSearches === 'function') {
    window.savedSearchesManager.loadSavedSearches();
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

// Initialize features when user logs in
document.addEventListener('user-logged-in', async () => {
    if (window.savedSearchesManager && typeof window.savedSearchesManager.loadSavedSearches === 'function') {
        await window.savedSearchesManager.loadSavedSearches();
    }
    if (typeof window.booksManager !== 'undefined' && window.booksManager && typeof window.booksManager.loadRecentlyViewed === 'function') {
        await window.booksManager.loadRecentlyViewed();
    }
});

// Load on page load if already authenticated
if (authManager.isAuthenticated) {
    if (window.savedSearchesManager && typeof window.savedSearchesManager.loadSavedSearches === 'function') {
        window.savedSearchesManager.loadSavedSearches();
    }
    if (typeof window.booksManager !== 'undefined' && window.booksManager && typeof window.booksManager.loadRecentlyViewed === 'function') {
        window.booksManager.loadRecentlyViewed();
    }
}

// ========================================
// LISTEN FOR LOGIN/LOGOUT EVENTS
// (Add this at the very end of main.js)
// ========================================

// Listen for successful login
document.addEventListener('login-success', () => {
    if (window.app) {
        window.app.showAuthenticatedFeatures();
    }
});

// Listen for logout
document.addEventListener('logout', () => {
    if (window.app) {
        window.app.hideAuthenticatedFeatures();
    }
});

