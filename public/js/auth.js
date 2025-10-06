// Authentication Manager for LiBrowse

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.pendingEmail = null;
        this.init();
    }

    init() {
        this.checkAuth();
        this.setupModalEventListeners();
        this.setupAuthButtons();
        this.setupFormValidation();
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
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Register form
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => this.handleRegister(e));
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
            const response = await api.login(email, password);
            
            if (response.token && response.user) {
                this.setAuth(response.token, response.user);
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
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        const formData = {
            firstname: document.getElementById('register-firstname').value,
            lastname: document.getElementById('register-lastname').value,
            email: document.getElementById('register-email').value,
            student_id: document.getElementById('register-student-id').value,
            program: document.getElementById('register-program').value,
            password: document.getElementById('register-password').value,
            confirm_password: document.getElementById('register-confirm-password').value
        };

        // Validation
        if (Object.values(formData).some(val => !val)) {
            this.showToast('Please fill in all fields', 'error');
            return;
        }

        if (!isValidPLVEmail(formData.email)) {
            this.showToast('Please use your PLV email address', 'error');
            return;
        }

        const passwordValidation = validatePassword(formData.password);
        if (!passwordValidation.isValid) {
            this.showToast('Please meet all password requirements', 'error');
            return;
        }

        if (formData.password !== formData.confirm_password) {
            this.showToast('Passwords do not match', 'error');
            return;
        }

        try {
            const response = await api.register(formData);
            
            if (response.token && response.user) {
                this.setAuth(response.token, response.user);
                this.pendingEmail = formData.email;
                this.closeModal('register-modal');
                this.showToast('Registration successful!', 'success');
                
                // Open verification choice modal
                setTimeout(() => {
                    this.openModal('verification-choice-modal');
                }, 500);
            } else {
                this.showToast(response.error || 'Registration failed', 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showToast(error.message || 'Registration failed. Please try again.', 'error');
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

    showToast(message, type = 'info') {
        showToast(message, type);
    }
}

// Create global authManager instance
const authManager = new AuthManager();
