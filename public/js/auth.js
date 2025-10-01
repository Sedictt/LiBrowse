// PLV BookSwap - Authentication Management
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.init();
    }

    async init() {
        // Check if user is already logged in
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const response = await api.verifyToken();
                this.setUser(response.user);
                this.updateUI();
            } catch (error) {
                console.error('Token verification failed:', error);
                this.logout();
            }
        }
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Login form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', this.handleLogin.bind(this));
        }

        // Register form
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', this.handleRegister.bind(this));
        }

        // OTP form
        const otpForm = document.getElementById('otp-form');
        if (otpForm) {
            otpForm.addEventListener('submit', this.handleOTPVerification.bind(this));
        }

        // Modal switches
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

        // Resend OTP
        const resendOTP = document.getElementById('resend-otp');
        if (resendOTP) {
            resendOTP.addEventListener('click', this.handleResendOTP.bind(this));
        }

        // Logout
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', this.logout.bind(this));
        }

        // Login/Register buttons
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');

        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.openModal('login-modal'));
        }

        if (registerBtn) {
            registerBtn.addEventListener('click', () => this.openModal('register-modal'));
        }

        // Password validation
        this.setupPasswordValidation();

        // Verification choice handlers
        this.setupVerificationHandlers();
    }

    async handleLogin(e) {
        e.preventDefault();
        
        // Validate CAPTCHA before proceeding
        if (window.captchaManager && !window.captchaManager.validateCaptcha('login')) {
            return;
        }
        
        const formData = new FormData(e.target);
        const email = formData.get('email');
        const password = formData.get('password');

        // Add CAPTCHA response to login data
        const loginData = { email, password };
        if (window.captchaManager) {
            window.captchaManager.addCaptchaToJSON(loginData, 'login');
        }

        try {
            this.showLoading(e.target);
            const response = await api.loginWithCaptcha(loginData);
            
            if (response.token) {
                api.setToken(response.token);
                this.setUser(response.user);
                this.closeModal('login-modal');
                this.updateUI();
                this.showToast('Login successful!', 'success');
            }
        } catch (error) {
            this.showToast(error.message, 'error');
            // Reset CAPTCHA on login error
            if (window.captchaManager) {
                window.captchaManager.resetCaptcha('login');
            }
        } finally {
            this.hideLoading(e.target);
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        // Validate CAPTCHA before proceeding
        if (window.captchaManager && !window.captchaManager.validateCaptcha('register')) {
            return;
        }
        
        const formData = new FormData(e.target);
        const userData = {
            firstname: formData.get('firstname'),
            lastname: formData.get('lastname'),
            email: formData.get('email'),
            student_id: formData.get('student_id'),
            program: formData.get('program'),
            password: formData.get('password'),
            confirm_password: formData.get('confirm_password')
        };

        // Add CAPTCHA response to registration data
        if (window.captchaManager) {
            window.captchaManager.addCaptchaToJSON(userData, 'register');
        }

        // Validate password requirements
        if (!this.validatePassword()) {
            this.showToast('Please ensure your password meets all requirements', 'error');
            return;
        }

        // Validate passwords match
        if (userData.password !== userData.confirm_password) {
            this.showToast('Passwords do not match', 'error');
            return;
        }

        // Validate PLV email
        if (!userData.email.endsWith('@plv.edu.ph')) {
            this.showToast('Please use your PLV email address (@plv.edu.ph)', 'error');
            return;
        }

        try {
            this.showLoading(e.target);
            const response = await api.register(userData);
            
            // Registration successful, show verification choice
            this.closeModal('register-modal');
            this.openModal('verification-choice-modal');
            this.pendingEmail = userData.email;
            this.showToast('Registration successful! Please choose your verification method.', 'success');
        } catch (error) {
            console.error('Registration error:', error);
            
            // Show detailed validation errors if available
            if (error.details && Array.isArray(error.details)) {
                const errorMessages = error.details.map(detail => detail.msg).join('\n');
                this.showToast(`Validation failed:\n${errorMessages}`, 'error');
            } else {
                this.showToast(error.message, 'error');
            }
            // Reset CAPTCHA on registration error
            if (window.captchaManager) {
                window.captchaManager.resetCaptcha('register');
            }
        } finally {
            this.hideLoading(e.target);
        }
    }

    async handleOTPVerification(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const otp = formData.get('otp');

        if (!this.pendingEmail) {
            this.showToast('Session expired. Please register again.', 'error');
            this.closeModal('otp-modal');
            return;
        }

        try {
            this.showLoading(e.target);
            const response = await api.verifyOTP(this.pendingEmail, otp);
            
            if (response.token) {
                api.setToken(response.token);
                this.setUser(response.user);
                this.closeModal('otp-modal');
                this.updateUI();
                this.showToast('Email verified successfully! Welcome to PLV BookSwap!', 'success');
                this.pendingEmail = null;
            }
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading(e.target);
        }
    }

    async handleResendOTP(e) {
        e.preventDefault();
        
        if (!this.pendingEmail) {
            this.showToast('Session expired. Please register again.', 'error');
            return;
        }

        try {
            // Assuming we have a resend OTP endpoint
            await api.post('/auth/resend-otp', { email: this.pendingEmail }, { auth: false });
            this.showToast('Verification code resent!', 'success');
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    setUser(user) {
        this.currentUser = user;
        this.isAuthenticated = true;
    }

    logout() {
        api.logout();
        this.currentUser = null;
        this.isAuthenticated = false;
        this.updateUI();
        this.showToast('Logged out successfully', 'info');
        
        // Redirect to home if on protected page
        if (window.location.hash && window.location.hash !== '#home') {
            window.location.hash = '#home';
        }
    }

    updateUI() {
        const navAuth = document.getElementById('nav-auth');
        const navUser = document.getElementById('nav-user');
        const profileName = document.getElementById('profile-name');
        const profileEmail = document.getElementById('profile-email');

        if (this.isAuthenticated && this.currentUser) {
            // Hide auth buttons, show user menu
            if (navAuth) navAuth.classList.add('hidden');
            if (navUser) navUser.classList.remove('hidden');
            
            // Update profile info
            if (profileName) {
                profileName.textContent = `${this.currentUser.firstname} ${this.currentUser.lastname}`;
            }
            if (profileEmail) {
                profileEmail.textContent = this.currentUser.email;
            }

            // Update user avatar
            const userAvatar = document.getElementById('user-avatar');
            if (userAvatar && this.currentUser.profile_image) {
                userAvatar.innerHTML = `<img src="${this.currentUser.profile_image}" alt="Profile">`;
            }
        } else {
            // Show auth buttons, hide user menu
            if (navAuth) navAuth.classList.remove('hidden');
            if (navUser) navUser.classList.add('hidden');
        }
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
            
            // Reset form
            const form = modal.querySelector('form');
            if (form) form.reset();
        }
    }

    showLoading(form) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        }
    }

    hideLoading(form) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            // Restore original text based on form
            if (form.id === 'login-form') {
                submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
            } else if (form.id === 'register-form') {
                submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Register';
            } else if (form.id === 'otp-form') {
                submitBtn.innerHTML = '<i class="fas fa-check"></i> Verify Email';
            }
        }
    }

    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <div class="toast-message">${message}</div>
                <button class="toast-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        toastContainer.appendChild(toast);

        // Show toast
        setTimeout(() => toast.classList.add('show'), 100);

        // Auto remove after 5 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    // Check if user is authenticated
    requireAuth() {
        if (!this.isAuthenticated) {
            this.openModal('login-modal');
            return false;
        }
        return true;
    }

    // Get current user
    getCurrentUser() {
        return this.currentUser;
    }

    isLoggedIn() {
        return this.isAuthenticated && this.currentUser !== null;
    }

    getToken() {
        return localStorage.getItem('token');
    }

    setupPasswordValidation() {
        const passwordInput = document.getElementById('register-password');
        const confirmPasswordInput = document.getElementById('register-confirm-password');

        if (passwordInput) {
            passwordInput.addEventListener('input', this.validatePassword.bind(this));
        }

        if (confirmPasswordInput) {
            confirmPasswordInput.addEventListener('input', this.validatePasswordMatch.bind(this));
        }
    }

    // Validate password requirements
    validatePassword() {
        const password = document.getElementById('register-password').value;
        
        // Password requirements
        const requirements = {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /\d/.test(password),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        };

        // Update UI for each requirement
        Object.keys(requirements).forEach(req => {
            const element = document.getElementById(`req-${req}`);
            if (element) {
                element.classList.remove('valid', 'invalid');
                element.classList.add(requirements[req] ? 'valid' : 'invalid');
            }
        });

        // Also validate password match if confirm password has value
        this.validatePasswordMatch();

        return Object.values(requirements).every(Boolean);
    }

    // Validate password match
    validatePasswordMatch() {
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;
        const matchIndicator = document.getElementById('password-match-indicator');

        if (!matchIndicator) return;

        if (confirmPassword === '') {
            matchIndicator.textContent = '';
            matchIndicator.classList.remove('match', 'no-match');
            return;
        }

        if (password === confirmPassword) {
            matchIndicator.textContent = '✓ Passwords match';
            matchIndicator.classList.remove('no-match');
            matchIndicator.classList.add('match');
        } else {
            matchIndicator.textContent = '✗ Passwords do not match';
            matchIndicator.classList.remove('match');
            matchIndicator.classList.add('no-match');
        }
    }

    // Setup verification choice handlers
    setupVerificationHandlers() {
        // OTP choice
        const chooseOtpBtn = document.getElementById('choose-otp');
        if (chooseOtpBtn) {
            chooseOtpBtn.addEventListener('click', this.handleChooseOTP.bind(this));
        }

        // Document choice
        const chooseDocumentBtn = document.getElementById('choose-document');
        if (chooseDocumentBtn) {
            chooseDocumentBtn.addEventListener('click', this.handleChooseDocument.bind(this));
        }

        // Back to verification choice
        const backToChoice = document.getElementById('back-to-verification-choice');
        const backToChoice2 = document.getElementById('back-to-verification-choice-2');
        
        if (backToChoice) {
            backToChoice.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeModal('otp-modal');
                this.openModal('verification-choice-modal');
            });
        }

        if (backToChoice2) {
            backToChoice2.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeModal('document-modal');
                this.openModal('verification-choice-modal');
            });
        }

        // Document form
        const documentForm = document.getElementById('document-form');
        if (documentForm) {
            documentForm.addEventListener('submit', this.handleDocumentVerification.bind(this));
        }

        // File preview
        const documentFile = document.getElementById('document-file');
        if (documentFile) {
            documentFile.addEventListener('change', this.handleFilePreview.bind(this));
        }
    }

    // Handle OTP choice
    async handleChooseOTP() {
        if (!this.pendingEmail) {
            this.showToast('Session expired. Please register again.', 'error');
            return;
        }

        try {
            const response = await api.post('/auth/send-otp', { email: this.pendingEmail }, { auth: false });
            
            this.closeModal('verification-choice-modal');
            this.openModal('otp-modal');
            
            if (response.otp) {
                // Development mode - show OTP in toast
                this.showToast(`Development mode: Your OTP is ${response.otp}`, 'info');
            } else {
                this.showToast('Verification code sent to your email!', 'success');
            }
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    // Handle document choice
    handleChooseDocument() {
        this.closeModal('verification-choice-modal');
        this.openModal('document-modal');
    }

    // Handle document verification
    async handleDocumentVerification(e) {
        e.preventDefault();
        
        if (!this.pendingEmail) {
            this.showToast('Session expired. Please register again.', 'error');
            return;
        }

        const formData = new FormData(e.target);
        const documentType = formData.get('documentType');
        const documentFile = formData.get('document');

        if (!documentFile || documentFile.size === 0) {
            this.showToast('Please select a document to upload', 'error');
            return;
        }

        try {
            this.showLoading(e.target);
            
            // Static demo - just send document type
            const response = await api.post('/auth/verify-document', {
                email: this.pendingEmail,
                documentType: documentType
            }, { auth: false });

            if (response.token) {
                api.setToken(response.token);
                this.setUser(response.user);
                this.closeModal('document-modal');
                this.updateUI();
                this.showToast(response.message, 'success');
                this.pendingEmail = null;
            }
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading(e.target);
        }
    }

    // Handle file preview
    handleFilePreview(e) {
        const file = e.target.files[0];
        const preview = document.getElementById('document-preview');
        
        if (!file || !preview) return;

        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `
                    <img src="${e.target.result}" alt="Document preview">
                    <div class="file-info">${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)</div>
                `;
                preview.classList.add('active');
            };
            reader.readAsDataURL(file);
        } else {
            preview.innerHTML = `
                <i class="fas fa-file-pdf" style="font-size: 3rem; color: var(--error); margin-bottom: 1rem;"></i>
                <div class="file-info">${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)</div>
            `;
            preview.classList.add('active');
        }
    }
}

// Initialize auth manager
const authManager = new AuthManager();

// Global access
window.authManager = authManager;

// Global authentication check function
function isAuthenticated() {
    return authManager.isAuthenticated;
}

// Make it globally available
window.isAuthenticated = isAuthenticated;
