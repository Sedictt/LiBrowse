// Authentication Manager for LiBrowse

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.pendingEmail = null;
        this.init();
    }

    init() {
        console.log('🔧 AuthManager initializing...');
        this.checkAuth();
        this.setupModalEventListeners();
        this.setupAuthButtons();
        this.setupFormValidation();
        this.setupAuthEvents();
        console.log('✅ AuthManager initialized');
    }

    checkAuth() {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');

        if (token && user) {
            this.isAuthenticated = true;
            this.currentUser = JSON.parse(user);
            this.updateUIForAuthState(true);
        } else {
            this.updateUIForAuthState(false);
        }
    }

    showVerificationSuccessModal(opts = {}) {
        const existing = document.getElementById('verification-success-modal');
        if (!existing) {
            const modalHTML = `
                <div id="verification-success-modal" class="modal" style="z-index:10000;">
                    <div class="modal-content" style="max-width: 520px;">
                        <div class="modal-header">
                            <h3>${opts.title || 'Verification Successful'}</h3>
                            <button class="modal-close" onclick="authManager.closeModal('verification-success-modal')">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="modal-body" style="text-align: center; padding: 30px 20px;">
                            <i class="fas fa-check-circle" style="font-size: 64px; color: #10B981; margin-bottom: 15px;"></i>
                            <h4 style="color: #10B981; margin: 0 0 10px;">You're Verified!</h4>
                            <p style="color: var(--text-muted); margin-bottom: 20px;">${opts.message || 'Your account is now verified.'}</p>
                            <div style="display:flex; gap: 12px; justify-content: center;">
                                <button class="btn btn-primary" onclick="authManager.onVerificationSuccessContinue()">
                                    Continue
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;
            const wrapper = document.createElement('div');
            wrapper.innerHTML = modalHTML;
            document.body.appendChild(wrapper.firstElementChild);
        } else {
            const titleEl = existing.querySelector('.modal-header h3');
            const bodyP = existing.querySelector('.modal-body p');
            if (titleEl && opts.title) titleEl.textContent = opts.title;
            if (bodyP && opts.message) bodyP.textContent = opts.message;
        }

        this.openModal('verification-success-modal');
    }

    onVerificationSuccessContinue() {
        this.closeModal('verification-success-modal');
        if (window.app) {
            window.app.loadCurrentSection();
        }
    }

    updateVerificationStatusUI(status, message) {
        const container = document.getElementById('verification-status-display');
        if (!container) return;

        let html = '';
        if (status === 'verified') {
            html = `
                <div class="status-card verified" style="padding: 20px; background: rgba(16, 185, 129, 0.12); border: 2px solid rgba(16, 185, 129, 0.35); border-radius: 8px; text-align: center;">
                    <i class="fas fa-check-circle" style="font-size: 48px; color: #10B981; margin-bottom: 15px;"></i>
                    <h4 style="color: #10B981; margin-bottom: 10px;">Verified</h4>
                    <p style="color: #a0aec0;">${message || 'Your account is verified.'}</p>
                </div>`;
        } else if (status === 'pending_review') {
            html = `
                <div class="status-card pending" style="padding: 20px; background: rgba(251, 191, 36, 0.1); border: 2px solid rgba(251, 191, 36, 0.3); border-radius: 8px; text-align: center;">
                    <i class="fas fa-clock" style="font-size: 48px; color: #fbbf24; margin-bottom: 15px;"></i>
                    <h4 style="color: #fbbf24; margin-bottom: 10px;">Verification Pending</h4>
                    <p style="color: #a0aec0;">${message || 'Admin review in progress.'}</p>
                </div>`;
        } else if (status === 'error') {
            html = `
                <div class="status-card error" style="padding: 20px; background: rgba(239, 68, 68, 0.12); border: 2px solid rgba(239, 68, 68, 0.35); border-radius: 8px; text-align: center;">
                    <i class="fas fa-times-circle" style="font-size: 48px; color: #EF4444; margin-bottom: 15px;"></i>
                    <h4 style="color: #EF4444; margin-bottom: 10px;">Verification Failed</h4>
                    <p style="color: #a0aec0;">${message || 'Please try again with a clearer image.'}</p>
                </div>`;
        }

        if (html) container.innerHTML = html;
    }

    setupAuthEvents() {
        // Listen for API auth errors (401/403) and prompt login
        window.addEventListener('auth:unauthorized', (e) => {
            console.warn('⚠️ Unauthorized API access', e.detail);
            this.showToast('Please login to continue.', 'warning');
            this.openModal('login-modal');
        });
    }

    setupAuthButtons() {
        // Desktop login/register buttons
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');

        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.openModal('login-modal'));
        }

        if (registerBtn) {
            registerBtn.addEventListener('click', () => this.openModal('register-modal'));
        }

        // Modal switching links
        const switchToRegister = document.getElementById('switch-to-register');
        const switchToLogin = document.getElementById('switch-to-login');

        if (switchToRegister) {
            switchToRegister.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeModal('login-modal');
                this.openModal('register-modal');
            });
        }

        if (switchToLogin) {
            switchToLogin.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeModal('register-modal');
                this.openModal('login-modal');
            });
        }

        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }

        // User avatar dropdown
        const userAvatar = document.getElementById('user-avatar');
        const userDropdown = document.getElementById('user-dropdown');

        if (userAvatar && userDropdown) {
            userAvatar.addEventListener('click', (e) => {
                e.stopPropagation();
                userDropdown.classList.toggle('active');
            });

            document.addEventListener('click', (e) => {
                if (!userAvatar.contains(e.target) && !userDropdown.contains(e.target)) {
                    userDropdown.classList.remove('active');
                }
            });
        }
    }

    setupModalEventListeners() {
        // Login form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            console.log('✅ Login form found, attaching listener');
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        } else {
            console.warn('⚠️ Login form not found');
        }

        // Register form
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            console.log('✅ Register form found, attaching listener');
            registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        } else {
            console.warn('⚠️ Register form not found');
        }
    }

    setupFormValidation() {
        // Password validation for registration
        const registerPassword = document.getElementById('register-password');
        const confirmPassword = document.getElementById('register-confirm-password');

        if (registerPassword) {
            registerPassword.addEventListener('input', () => {
                this.validatePasswordStrength(registerPassword.value);
            });
        }

        if (confirmPassword && registerPassword) {
            confirmPassword.addEventListener('input', () => {
                this.validatePasswordMatch(registerPassword.value, confirmPassword.value);
            });
        }
    }

    validatePasswordStrength(password) {
        const validation = validatePassword(password);
        const requirements = {
            'req-length': validation.requirements.length,
            'req-uppercase': validation.requirements.uppercase,
            'req-lowercase': validation.requirements.lowercase,
            'req-number': validation.requirements.number,
            'req-special': validation.requirements.special
        };

        for (const [id, isValid] of Object.entries(requirements)) {
            const element = document.getElementById(id);
            if (element) {
                element.classList.toggle('valid', isValid);
            }
        }

        return validation.isValid;
    }

    validatePasswordMatch(password, confirmPassword) {
        const indicator = document.getElementById('password-match-indicator');
        if (!indicator) return;

        if (confirmPassword === '') {
            indicator.textContent = '';
            indicator.className = 'password-match';
            return;
        }

        if (password === confirmPassword) {
            indicator.textContent = '✓ Passwords match';
            indicator.className = 'password-match match';
        } else {
            indicator.textContent = '✗ Passwords do not match';
            indicator.className = 'password-match no-match';
        }
    }

    async handleLogin(e) {
        e.preventDefault();

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
            this.showToast('Please fill in all fields', 'error');
            return;
        }

        if (!isValidPLVEmail(email)) {
            this.showToast('Please use your PLV email address', 'error');
            return;
        }

        try {
            // Collect reCAPTCHA token if enabled
            const captchaToken = (window.captcha && window.captcha.enabled)
                ? window.captcha.getResponse('login')
                : null;

            if (window.captcha && window.captcha.enabled && !captchaToken) {
                this.showToast('Please complete the CAPTCHA', 'error');
                return;
            }

            const response = await api.login(email, password, captchaToken);

            if (response.token && response.user) {
                const u = response.user || {};
                // Normalize to frontend shape
                const mappedUser = {
                    id: u.id,
                    email: u.email,
                    firstname: u.firstname || u.fname || '',
                    lastname: u.lastname || u.lname || '',
                    student_id: u.student_id || u.student_no || '',
                    program: u.program || u.course || '',
                    year: u.year || 1,
                    is_verified: u.is_verified ?? false,
                    credits: u.credits ?? 100,
                };
                this.setAuth(response.token, mappedUser);
                this.closeModal('login-modal');
                this.showToast('Welcome back!', 'success');

                // Reload the current section
                if (window.app) {
                    window.app.loadCurrentSection();
                }
            } else {
                this.showToast(response.error || 'Login failed', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showToast(error.message || 'Login failed. Please try again.', 'error');
        } finally {
            if (window.captcha && window.captcha.enabled) {
                window.captcha.reset('login');
            }
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        console.log('🔵 Register form submitted');

        const formData = {
            firstname: document.getElementById('register-firstname').value,
            lastname: document.getElementById('register-lastname').value,
            email: document.getElementById('register-email').value,
            student_id: document.getElementById('register-student-id').value,
            program: document.getElementById('register-program').value,
            password: document.getElementById('register-password').value,
            confirm_password: document.getElementById('register-confirm-password').value
        };

        console.log('📝 Form data:', { ...formData, password: '***', confirm_password: '***' });

        // Validation
        console.log('🔍 Starting validation...');
        if (Object.values(formData).some(val => !val)) {
            console.log('❌ Validation failed: Empty fields');
            this.showToast('Please fill in all fields', 'error');
            return;
        }

        console.log('✅ All fields filled');

        if (!isValidPLVEmail(formData.email)) {
            console.log('❌ Validation failed: Invalid PLV email');
            this.showToast('Please use your PLV email address', 'error');
            return;
        }

        console.log('✅ PLV email valid');

        const passwordValidation = validatePassword(formData.password);
        console.log('🔐 Password validation:', passwordValidation);
        if (!passwordValidation.isValid) {
            console.log('❌ Validation failed: Password requirements not met');
            this.showToast('Please meet all password requirements', 'error');
            return;
        }

        console.log('✅ Password valid');

        if (formData.password !== formData.confirm_password) {
            this.showToast('Passwords do not match', 'error');
            return;
        }

        try {
            console.log('📤 Sending registration request...');
            // Collect reCAPTCHA token if enabled
            const captchaToken = (window.captcha && window.captcha.enabled)
                ? window.captcha.getResponse('register')
                : null;

            if (window.captcha && window.captcha.enabled && !captchaToken) {
                this.showToast('Please complete the CAPTCHA', 'error');
                return;
            }

            const response = await api.register(formData, captchaToken);
            console.log('📥 Registration response:', response);

            if (response.message && response.requiresVerification) {
                // Store registration info temporarily
                this.pendingRegistration = {
                    userId: response.userId,
                    email: response.email,
                    ...formData
                };

                this.closeModal('register-modal');
                this.showToast('Registration successful! Please verify your account.', 'success');

                // Show verification choice modal
                setTimeout(() => {
                    this.showVerificationChoice();
                }, 500);
            } else if (response.token && response.user) {
                // Direct login (if verification not required)
                const u = response.user || {};
                // Map backend fields to frontend shape
                const mappedUser = {
                    id: u.id,
                    email: u.email,
                    firstname: u.firstname || u.fname || '',
                    lastname: u.lastname || u.lname || '',
                    student_id: u.student_id || u.student_no || '',
                    program: u.program || u.course || '',
                    year: u.year || 1,
                    is_verified: u.is_verified ?? false,
                    credits: u.credits ?? 100,
                };
                this.setAuth(response.token, mappedUser);
                this.closeModal('register-modal');
                this.showToast('Registration successful!', 'success');

                if (window.app) {
                    window.app.loadCurrentSection();
                }
            } else {
                console.warn('⚠️ Unexpected response format:', response);
                this.showToast(response.error || response.message || 'Registration failed', 'error');
            }
        } catch (error) {
            console.error('❌ Registration error:', error);
            this.showToast(error.message || 'Registration failed. Please try again.', 'error');
        } finally {
            if (window.captcha && window.captcha.enabled) {
                window.captcha.reset('register');
            }
        }
    }

    setAuth(token, user) {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        this.isAuthenticated = true;
        this.currentUser = user;
        this.updateUIForAuthState(true);
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        this.isAuthenticated = false;
        this.currentUser = null;
        this.updateUIForAuthState(false);
        this.showToast('Logged out successfully', 'info');

        // Redirect to home
        if (window.app) {
            window.app.navigateToSection('home');
        }
    }

    updateUIForAuthState(isAuthenticated) {
        const navAuth = document.getElementById('nav-auth');
        const navUser = document.getElementById('nav-user');
        const navMenu = document.getElementById('nav-menu');

        if (isAuthenticated) {
            if (navAuth) navAuth.classList.add('hidden');
            if (navUser) navUser.classList.remove('hidden');
            if (navMenu) navMenu.classList.add('authenticated');
        } else {
            if (navAuth) navAuth.classList.remove('hidden');
            if (navUser) navUser.classList.add('hidden');
            if (navMenu) navMenu.classList.remove('authenticated');
        }
    }

    requireAuth() {
        if (!this.isAuthenticated) {
            this.showToast('Please login to access this feature', 'warning');
            this.openModal('login-modal');
            return false;
        }
        return true;
    }

    getCurrentUser() {
        return this.currentUser;
    }

    getToken() {
        return localStorage.getItem('token');
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    showToast(message, type = 'info', duration = 5000) {
        console.log(`🔔 Toast: [${type}] ${message}`);

        // Check if toast container exists
        const container = document.getElementById('toast-container');
        if (!container) {
            console.error('❌ Toast container not found!');
            alert(message); // Fallback to alert
            return;
        }

        showToast(message, type, duration);
    }

    showVerificationChoice() {
        // Create a simple verification choice UI
        const message = `
            <div style="text-align: center; padding: 20px;">
                <h3 style="margin-bottom: 20px;">Choose Verification Method</h3>
                <p style="margin-bottom: 30px; color: var(--text-muted);">
                    To complete your registration, please verify your account using one of the methods below:
                </p>
                <div style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="authManager.startDocumentVerification()" 
                            style="padding: 15px 30px; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">
                        <i class="fas fa-id-card"></i> Upload Student ID
                    </button>
                    <button onclick="authManager.startOTPVerification()" 
                            style="padding: 15px 30px; background: var(--secondary); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">
                        <i class="fas fa-envelope"></i> Email Verification
                    </button>
                </div>
                <p style="margin-top: 20px; font-size: 14px; color: var(--text-muted);">
                    You can verify later from your profile page
                </p>
            </div>
        `;

        this.showToast(message, 'info', 10000);
    }

    async startOTPVerification() {
        const email = this.pendingRegistration?.email || this.currentUser?.email;
        if (!email) {
            this.showToast("No email found for verification", "error");
            return;
        }

        try {
            const response = await api.sendOTP(email);
            this.showToast(response.message, "success");
            this.showOTPModal(email);
        } catch (err) {
            this.showToast(err.message || "Failed to send OTP", "error");
        }
    }

    startOTPVerification() {
        this.showToast('OTP verification will be implemented soon', 'info');
    }

    showDocumentUploadModal() {
        // Check if modal already exists
        let modal = document.getElementById('document-upload-modal');
        if (!modal) {
            modal = this.createDocumentUploadModal();
            document.body.appendChild(modal);
        }
        this.openModal('document-upload-modal');
    }

    createDocumentUploadModal() {
        const modalHTML = `
            <div id="document-upload-modal" class="modal">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3>Upload Student ID for Verification</h3>
                        <button class="modal-close" onclick="authManager.closeModal('document-upload-modal')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom: 20px; color: var(--text-muted);">
                            Please upload clear photos of your PLV Student ID. Our system will automatically verify your information.
                        </p>
                        
                        <form id="document-upload-form" style="display: flex; flex-direction: column; gap: 20px;">
                            <div class="form-group">
                                <label for="front-id">Front of Student ID *</label>
                                <input type="file" id="front-id" name="frontId" accept="image/*,.pdf" required 
                                       style="padding: 10px; border: 2px dashed var(--border); border-radius: 8px; background: var(--bg-secondary);">
                                <small style="color: var(--text-muted);">Accepted formats: JPG, PNG, PDF (Max 5MB)</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="back-id">Back of Student ID (Optional)</label>
                                <input type="file" id="back-id" name="backId" accept="image/*,.pdf"
                                       style="padding: 10px; border: 2px dashed var(--border); border-radius: 8px; background: var(--bg-secondary);">
                                <small style="color: var(--text-muted);">Uploading both sides improves verification accuracy</small>
                            </div>
                            
                            <div id="upload-status" style="display: none; padding: 15px; border-radius: 8px; background: var(--bg-secondary);">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <i class="fas fa-spinner fa-spin"></i>
                                    <span>Processing your documents...</span>
                                </div>
                            </div>
                            
                            <button type="submit" class="btn btn-primary" style="padding: 12px; font-size: 16px;">
                                <i class="fas fa-upload"></i> Upload & Verify
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        `;

        const div = document.createElement('div');
        div.innerHTML = modalHTML;
        const modalElement = div.firstElementChild;

        // Add form submit handler
        const form = modalElement.querySelector('#document-upload-form');
        form.addEventListener('submit', (e) => this.handleDocumentUpload(e));

        return modalElement;
    }

    async handleDocumentUpload(e) {
        e.preventDefault();

        const form = e.target;
        const frontIdInput = form.querySelector('#front-id');
        const backIdInput = form.querySelector('#back-id');
        const statusDiv = form.querySelector('#upload-status');
        const submitBtn = form.querySelector('button[type="submit"]');

        if (!frontIdInput.files[0]) {
            this.showToast('Please select the front of your Student ID', 'error');
            return;
        }

        // Show loading state
        statusDiv.style.display = 'block';
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        try {
            // Create FormData
            const formData = new FormData();
            formData.append('frontId', frontIdInput.files[0]);
            if (backIdInput.files[0]) {
                formData.append('backId', backIdInput.files[0]);
            }

            // First, we need to login to get a token since registration doesn't return one
            // For now, let's show a message that they need to login first
            if (!this.getToken()) {
                // Try to login with the pending registration credentials
                if (this.pendingRegistration) {
                    try {
                        const loginResponse = await api.login(
                            this.pendingRegistration.email,
                            this.pendingRegistration.password
                        );

                        if (loginResponse.token) {
                            this.setAuth(loginResponse.token, loginResponse.user);
                        }
                    } catch (loginError) {
                        console.error('Auto-login failed:', loginError);
                        this.showToast('Please login first to upload documents', 'error');
                        this.closeModal('document-upload-modal');
                        this.openModal('login-modal');
                        return;
                    }
                } else {
                    this.showToast('Please login first to upload documents', 'error');
                    this.closeModal('document-upload-modal');
                    this.openModal('login-modal');
                    return;
                }
            }

            // Upload documents
            const response = await api.uploadVerificationDocuments(formData);

            statusDiv.style.display = 'none';
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload & Verify';

            if (response.success) {
                this.closeModal('document-upload-modal');

                if (response.autoApproved) {
                    this.showToast('✓ Verification successful! Your account is now verified.', 'success');
                    // Update local user state
                    try {
                        const userStr = localStorage.getItem('user');
                        if (userStr) {
                            const u = JSON.parse(userStr);
                            u.is_verified = true;
                            localStorage.setItem('user', JSON.stringify(u));
                            this.currentUser = u;
                        }
                    } catch (_) { }
                    // Update UI status card
                    this.updateVerificationStatusUI('verified', 'Your account is verified.');
                    // Show success modal
                    // Slight delay to avoid race with closing upload modal
                    console.log('🔔 Showing verification success modal...');
                    setTimeout(() => this.showVerificationSuccessModal({
                        title: 'Verification Successful',
                        message: 'Your Student ID has been verified. You now have full access to LiBrowse features.',
                    }), 120);
                } else {
                    this.showToast('Documents uploaded! Admin review in progress.', 'info');
                    // Update UI status card
                    this.updateVerificationStatusUI('pending_review', response.message || 'Admin review in progress.');
                    // Reload user data for pending state only
                    if (window.app) {
                        window.app.loadCurrentSection();
                    }
                }

                // Note: we intentionally do not reload immediately on auto-approval
                // to avoid hiding the success modal. Reload happens on Continue.
            } else {
                this.showToast(response.message || 'Upload failed', 'error');
                this.updateVerificationStatusUI('error', response.message || 'Verification failed.');
            }

        } catch (error) {
            console.error('Document upload error:', error);
            statusDiv.style.display = 'none';
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload & Verify';
            this.showToast(error.message || 'Upload failed. Please try again.', 'error');
        }
    }

    async startOTPVerification() {
        const email = this.pendingRegistration?.email || this.currentUser?.email;
        if (!email) {
            this.showToast("No email found for verification", "error");
            return;
        }

        try {
            const response = await api.sendOTP(email);
            this.showToast(response.message, "success");
            this.showOTPModal(email);
        } catch (err) {
            this.showToast(err.message || "Failed to send OTP", "error");
        }
    }

    showOTPModal(email) {
        const modal = document.createElement('div');
        modal.innerHTML = `
    <div class="modal active" id="otp-modal">
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h3>Email Verification</h3>
          <button class="modal-close" onclick="authManager.closeModal('otp-modal')"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="text-align:center;">
          <p>We’ve sent a 6-digit OTP to <b>${email}</b></p>
          <input type="text" id="otp-input" placeholder="Enter OTP" maxlength="6" style="text-align:center; font-size:20px; letter-spacing:4px; margin-bottom:10px;">
          <button class="btn btn-primary" onclick="authManager.verifyOTPCode('${email}')">Verify</button>
          <p id="otp-timer" style="margin-top:10px; color:gray;">Expires in 10:00</p>
          <button class="btn btn-link" id="resend-otp-btn" onclick="authManager.resendOTP('${email}')">Resend OTP</button>
        </div>
      </div>
    </div>
  `;
        document.body.appendChild(modal);
        this.startOTPTimer();
    }

    async verifyOTPCode(email) {
        const otp = document.getElementById("otp-input").value;
        try {
            const response = await api.verifyOTP(email, otp);
            this.showToast(response.message, "success");
            this.closeModal("otp-modal");
        } catch (err) {
            this.showToast(err.message || "Invalid or expired OTP", "error");
        }
    }

    async resendOTP(email) {
        try {
            const response = await api.sendOTP(email);
            this.showToast("New OTP sent!", "info");
            this.startOTPTimer();
        } catch (err) {
            this.showToast(err.message || "Failed to resend OTP", "error");
        }
    }

    startOTPTimer() {
        let timeLeft = 600; // 10 minutes
        const timerDisplay = document.getElementById("otp-timer");
        const interval = setInterval(() => {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            if (timerDisplay) timerDisplay.textContent = `Expires in ${minutes}:${seconds.toString().padStart(2, '0')}`;
            if (timeLeft-- <= 0) clearInterval(interval);
        }, 1000);
    }

}

// Create global authManager instance


const authManager = new AuthManager();
