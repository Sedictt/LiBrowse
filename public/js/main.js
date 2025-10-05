// LiBrowse - Main Application Logic
class App {
    constructor() {
        this.currentSection = 'home';
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupNavigation();
        this.setupModals();
        this.handleInitialRoute();
        await this.loadPlatformStats();
        this.hideLoadingScreen();
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
            ctaRegisterBtn.addEventListener('click', () => {
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
            mobileRegisterBtn.addEventListener('click', () => {
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

        // Window resize handler
        window.addEventListener('resize', this.handleResize.bind(this));

        // Hash change handler
        window.addEventListener('hashchange', this.handleHashChange.bind(this));
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
                    this.closeModal(modalId);
                }
            });
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
        // Check authentication for protected sections
        const protectedSections = ['requests', 'transactions', 'profile', 'notifications'];
        if (protectedSections.includes(sectionName) && !authManager.requireAuth()) {
            return;
        }

        // Hide all sections
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });

        // Show target section
        const targetSection = document.getElementById(`${sectionName}-section`);
        if (targetSection) {
            targetSection.classList.add('active');
            this.currentSection = sectionName;
        }

        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        const navLink = document.querySelector(`[data-section="${sectionName}"]`);
        if (navLink) {
            navLink.classList.add('active');
        }

        // Update URL hash
        window.location.hash = sectionName;

        // Load section-specific data
        this.loadSectionData(sectionName);

        // Close mobile menu if open
        const navMenu = document.getElementById('nav-menu');
        if (navMenu) {
            navMenu.classList.remove('active');
        }
    }

    async loadSectionData(sectionName) {
        switch (sectionName) {
            case 'books':
                if (booksManager) {
                    await booksManager.loadBooks(true);
                }
                break;
            case 'requests':
                if (requestManager) {
                    await requestManager.loadRequests();
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
            const transactions = await api.getTransactions();
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
            this.renderProfile(profileData.user, profileData.stats);
        } catch (error) {
            console.error('Failed to load profile:', error);
            // Fallback to basic user data
            const user = authManager.getCurrentUser();
            if (user) {
                this.renderProfile(user, { books_count: 0, transactions_count: 0, average_rating: 0, credits: 100 });
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

        if (profileName) profileName.textContent = `${userData.firstname} ${userData.lastname}`;
        if (profileEmail) profileEmail.textContent = userData.email;
        if (profileStudentId) profileStudentId.textContent = `Student ID: ${userData.student_id}`;
        if (profileProgram) profileProgram.textContent = userData.program;

        // Update verification badge
        if (verificationBadge) {
            const isVerified = userData.is_verified !== undefined ? userData.is_verified : true;
            verificationBadge.className = `verification-badge ${isVerified ? 'verified' : 'unverified'}`;
            verificationBadge.innerHTML = `
                <i class="fas fa-${isVerified ? 'check-circle' : 'exclamation-triangle'}"></i>
                <span>${isVerified ? 'Verified' : 'Not Verified'}</span>
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
        }, 100);
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
                break;
            case 'reviews':
                tabContent.innerHTML = this.getReviewsTab();
                break;
            case 'settings':
                tabContent.innerHTML = this.getSettingsTab();
                this.setupSettingsEventListeners();
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

        const isVerified = user.is_verified || user.verification_status === 'verified';
        const verificationMethod = user.verification_method || 'none';
        const emailVerified = user.email_verified || false;

        return `
            <div class="verification-content">
                <div class="verification-header">
                    <h3><i class="fas fa-shield-alt"></i> Account Verification</h3>
                    <div class="verification-status ${isVerified ? 'verified' : 'unverified'}">
                        <i class="fas ${isVerified ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
                        <span>${isVerified ? 'Verified Account' : 'Unverified Account'}</span>
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
                                <li>✅ Build trust with other users</li>
                                <li>✅ Access to premium features</li>
                                <li>✅ Higher borrowing limits</li>
                                <li>✅ Priority in book requests</li>
                                <li>✅ Enhanced security protection</li>
                            </ul>
                        </div>
                    </div>
                </div>

                ${!isVerified ? `
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
                                <button class="method-btn ${emailVerified ? 'btn-outline' : 'btn-primary'}" 
                                        id="email-verify-btn">
                                    <i class="fas ${emailVerified ? 'fa-redo' : 'fa-paper-plane'}"></i>
                                    ${emailVerified ? 'Re-verify Email' : 'Verify Email'}
                                </button>
                            </div>

                            <div class="method-card" data-method="document">
                                <div class="method-icon">
                                    <i class="fas fa-id-card"></i>
                                </div>
                                <div class="method-content">
                                    <h5>Document Upload</h5>
                                    <p>Upload your Student ID for automatic OCR verification</p>
                                    <div class="method-status">
                                        <span class="status-badge pending"><i class="fas fa-upload"></i> Ready</span>
                                    </div>
                                </div>
                                <button class="method-btn btn-primary" id="document-verify-btn">
                                    <i class="fas fa-camera"></i>
                                    Upload Documents
                                </button>
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
                                    <div class="progress-text" id="profile-upload-progress-text">Uploading...</div>
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
                                <span class="value">${verificationMethod === 'email' ? 'Email Verification' : 'Document Upload'}</span>
                            </div>
                            ${verificationMethod === 'email' ? `
                                <div class="detail-item">
                                    <span class="label">Email:</span>
                                    <span class="value">${user.email}</span>
                                </div>
                            ` : ''}
                        </div>
                        <div class="verification-actions">
                            <button class="btn btn-outline-primary" id="re-verify-btn">
                                <i class="fas fa-shield-alt"></i>
                                Re-verify Account
                            </button>
                            <button class="btn btn-ghost" id="change-method-btn">
                                <i class="fas fa-exchange-alt"></i>
                                Change Method
                            </button>
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
                    </div>
                </div>
            </div>
        `;
    }

    getMyBooksTab() {
        return `
            <div class="my-books-content">
                <h3>My Books</h3>
                <p>Loading your books...</p>
            </div>
        `;
    }

    getReviewsTab() {
        return `
            <div class="reviews-content">
                <h3>Reviews & Ratings</h3>
                <p>Loading reviews...</p>
            </div>
        `;
    }

    getSettingsTab() {
        const user = authManager.getCurrentUser();
        const isVerified = user ? true : false; // Assume verified if logged in
        
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
                                ? 'Your account has been successfully verified. You can re-verify using a different method if needed.'
                                : 'Please verify your account to access all features and build trust with other users.'
                            }
                        </p>
                    </div>
                    
                    <div class="verification-actions">
                        <button class="btn btn-primary" id="reverify-account">
                            <i class="fas fa-shield-alt"></i>
                            ${isVerified ? 'Re-verify Account' : 'Verify Account'}
                        </button>
                        ${isVerified ? `
                            <button class="btn btn-outline" id="change-verification-method">
                                <i class="fas fa-exchange-alt"></i>
                                Change Verification Method
                            </button>
                        ` : ''}
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

        try {
            const notifications = await api.getNotifications();
            this.renderNotifications(notifications);
            this.updateNotificationBadge(notifications);
        } catch (error) {
            console.error('Failed to load notifications:', error);
        }
    }

    renderNotifications(notifications) {
        const notificationsList = document.getElementById('notifications-list');
        if (!notificationsList) return;

        if (!notifications || notifications.length === 0) {
            notificationsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-bell"></i>
                    <h3>No notifications</h3>
                    <p>You're all caught up!</p>
                </div>
            `;
            return;
        }

        notificationsList.innerHTML = notifications.map(notification => `
            <div class="notification-card ${notification.read ? '' : 'unread'}">
                <div class="notification-icon">
                    <i class="fas fa-${this.getNotificationIcon(notification.type)}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-title">${notification.title}</div>
                    <div class="notification-message">${notification.message}</div>
                    <div class="notification-time">${this.formatTime(notification.created_at)}</div>
                </div>
            </div>
        `).join('');
    }

    getNotificationIcon(type) {
        const icons = {
            'transaction': 'exchange-alt',
            'book': 'book',
            'message': 'envelope',
            'system': 'cog'
        };
        return icons[type] || 'bell';
    }

    updateNotificationBadge(notifications) {
        const badge = document.getElementById('notification-badge');
        if (badge) {
            const unreadCount = notifications.filter(n => !n.read).length;
            badge.textContent = unreadCount;
            badge.style.display = unreadCount > 0 ? 'block' : 'none';
        }
    }

    async loadPlatformStats() {
        try {
            const stats = await api.getPlatformStats();
            this.updateStatsDisplay(stats);
        } catch (error) {
            console.error('Failed to load platform stats:', error);
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

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
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
            authManager.showToast('Transaction approved!', 'success');
        } catch (error) {
            authManager.showToast(error.message, 'error');
        }
    }

    async rejectTransaction(transactionId) {
        try {
            await api.updateTransactionStatus(transactionId, 'cancelled');
            this.loadTransactions();
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
                    <img src="${e.target.result}" alt="${side} preview" style="max-width: 200px; max-height: 150px; border-radius: 4px;">
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

            this.profileDebugLog('🚀 Starting OCR processing...');
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

            if (result.success) {
                this.handleProfileVerificationSuccess(result);
            } else {
                throw new Error(result.message || 'Verification failed');
            }

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
                '<i class="fas fa-spinner fa-spin"></i> Processing Documents...' : 
                '<i class="fas fa-upload"></i> Upload Documents for Verification';
        }

        if (progressContainer) {
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

            const response = await fetch('/api/verification/send-email-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authManager.getToken()}`
                }
            });

            const result = await response.json();

            if (result.success) {
                // Show code input step
                document.getElementById('send-code-step').style.display = 'none';
                document.getElementById('verify-code-step').style.display = 'block';
                
                // Start resend timer
                this.startResendTimer();
                
                // Show development code for PLV emails
                if (result.devCode && result.isPLVEmail) {
                    const codeInput = document.getElementById('verification-code');
                    if (codeInput) {
                        codeInput.value = result.devCode;
                        codeInput.style.backgroundColor = 'rgba(255, 184, 0, 0.1)';
                        codeInput.style.borderColor = 'rgba(255, 184, 0, 0.3)';
                    }
                    showToast(`PLV Email: Code auto-filled for development (${result.devCode})`, 'warning');
                } else {
                    showToast(result.message || 'Verification code sent to your email!', 'success');
                }
                
                // Show note if provided
                if (result.note) {
                    setTimeout(() => {
                        showToast(result.note, 'info');
                    }, 2000);
                }
            } else {
                throw new Error(result.message || 'Failed to send verification code');
            }

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

            const response = await fetch('/api/verification/verify-email-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authManager.getToken()}`
                },
                body: JSON.stringify({ code })
            });

            const result = await response.json();

            if (result.success) {
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
                
            } else {
                throw new Error(result.message || 'Invalid verification code');
            }

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

            const response = await fetch('/api/verification/send-email-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authManager.getToken()}`
                }
            });

            const result = await response.json();

            if (result.success) {
                // Restart resend timer
                this.startResendTimer();
                showToast('New verification code sent!', 'success');
            } else {
                throw new Error(result.message || 'Failed to resend verification code');
            }

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

    openEditProfileModal() {
        console.log('Opening edit profile modal');
        const user = authManager.getCurrentUser();
        console.log('Current user:', user);
        if (!user) {
            console.log('No user found, cannot open edit profile modal');
            return;
        }

        const modalHTML = `
            <div class="modal-overlay" id="edit-profile-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-user-edit"></i> Edit Profile</h3>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <form id="edit-profile-form" class="modal-body">
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="edit-firstname">First Name</label>
                                <input type="text" id="edit-firstname" value="${user.firstname || ''}" required>
                            </div>
                            <div class="form-group">
                                <label for="edit-lastname">Last Name</label>
                                <input type="text" id="edit-lastname" value="${user.lastname || ''}" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="edit-email">Email Address</label>
                            <input type="email" id="edit-email" value="${user.email || ''}" required>
                        </div>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="edit-student-id">Student ID</label>
                                <input type="text" id="edit-student-id" value="${user.student_id || ''}" required>
                            </div>
                            <div class="form-group">
                                <label for="edit-program">Program</label>
                                <input type="text" id="edit-program" value="${user.program || ''}" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="edit-bio">Bio (Optional)</label>
                            <textarea id="edit-bio" rows="3" placeholder="Tell others about yourself...">${user.bio || ''}</textarea>
                        </div>
                    </form>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">
                            Cancel
                        </button>
                        <button type="submit" form="edit-profile-form" class="btn btn-primary" id="save-profile-btn">
                            <i class="fas fa-save"></i>
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        `;

        console.log('Adding modal HTML to body');
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Add form submit handler
        const form = document.getElementById('edit-profile-form');
        console.log('Edit profile form:', form);
        if (form) {
            form.addEventListener('submit', (e) => this.handleEditProfileSubmit(e));
            console.log('Form submit handler added');
        } else {
            console.log('Edit profile form not found');
        }

        // Show the modal
        const modal = document.getElementById('edit-profile-modal');
        if (modal) {
            modal.style.display = 'flex';
            console.log('Modal displayed');
        }
    }

    async handleEditProfileSubmit(event) {
        event.preventDefault();
        
        const saveBtn = document.getElementById('save-profile-btn');
        const originalText = saveBtn.innerHTML;
        
        try {
            // Show loading state
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            const formData = {
                firstname: document.getElementById('edit-firstname').value.trim(),
                lastname: document.getElementById('edit-lastname').value.trim(),
                email: document.getElementById('edit-email').value.trim(),
                student_id: document.getElementById('edit-student-id').value.trim(),
                program: document.getElementById('edit-program').value.trim(),
                bio: document.getElementById('edit-bio').value.trim()
            };

            // Validate required fields
            if (!formData.firstname || !formData.lastname || !formData.email || !formData.student_id || !formData.program) {
                throw new Error('Please fill in all required fields');
            }

            // Make API call to update profile
            const response = await fetch('/api/users/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authManager.getToken()}`
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
                // Update current user data
                authManager.currentUser = { ...authManager.currentUser, ...formData };
                
                // Close modal
                document.getElementById('edit-profile-modal').remove();
                
                // Refresh profile display
                this.loadProfile();
                
                showToast('Profile updated successfully!', 'success');
            } else {
                throw new Error(result.message || 'Failed to update profile');
            }

        } catch (error) {
            console.error('Profile update error:', error);
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            // Restore button state
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

document.addEventListener("DOMContentLoaded", () => {
    const loginBtn = document.getElementById("mobile-login-btn");
    const registerBtn = document.getElementById("mobile-register-btn");
    const loginModal = document.getElementById("login-modal");
    const registerModal = document.getElementById("register-modal");
    const closeButtons = document.querySelectorAll(".modal-close");

    function openModal(modal) {
        if (modal) modal.classList.add("active");
    }
    function closeModal(modal) {
        if (modal) modal.classList.remove("active");
    }

    if (loginBtn) loginBtn.addEventListener("click", () => openModal(loginModal));
    if (registerBtn) registerBtn.addEventListener("click", () => openModal(registerModal));

    closeButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const modalId = btn.dataset.modal;
            const modal = document.getElementById(modalId);
            if (modal) closeModal(modal);
        });
    });

    // Login form
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("login-email").value;
            const password = document.getElementById("login-password").value;

            try {
                const data = await loginUser(email, password); // from auth.js
                if (data.success) {
                    alert("Login successful!");
                    closeModal(loginModal);
                } else {
                    alert(data.error || "Login failed");
                }
            } catch (err) {
                console.error("Login error:", err);
            }
        });
    }

    // Register form
    const registerForm = document.getElementById("register-form");
    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const formData = {
                firstname: document.getElementById("register-firstname").value,
                lastname: document.getElementById("register-lastname").value,
                email: document.getElementById("register-email").value,
                student_id: document.getElementById("register-student-id").value,
                program: document.getElementById("register-program").value,
                password: document.getElementById("register-password").value,
                confirm_password: document.getElementById("register-confirm-password").value
            };

            try {
                const data = await registerUser(formData); // from auth.js
                if (data.success) {
                    alert("Registration successful!");
                    closeModal(registerModal);
                    openModal(document.getElementById("verification-choice-modal"));
                } else {
                    alert(data.error || "Registration failed");
                }
            } catch (err) {
                console.error("Register error:", err);
            }
        });
    }
});