// CAPTCHA Integration for Booqy Platform (reCAPTCHA v2)
class CaptchaManager {
    constructor() {
        this.siteKey = '6Ldt1dgrAAAAAA_wftZA-i2aDLCDspvhIgIMvbvt';
        this.enabled = true;
        this.development = false;
        this.initialized = false;
        this.version = 'v2';
        
        // Initialize when page loads
        this.init();
    }

    async init() {
        try {
            console.log('🛡️  reCAPTCHA v2 Configuration:', {
                enabled: this.enabled,
                siteKey: this.siteKey ? 'Configured' : 'Not configured',
                version: this.version
            });

            // Wait for reCAPTCHA v2 API to load
            this.waitForRecaptcha();

        } catch (error) {
            console.error('Failed to load CAPTCHA configuration:', error);
            this.showFallbackMessages();
        }
    }

    waitForRecaptcha() {
        // Wait for reCAPTCHA v2 API to load
        const checkRecaptcha = () => {
            if (typeof grecaptcha !== 'undefined' && grecaptcha.render) {
                this.initializeCaptchaWidgets();
            } else {
                setTimeout(checkRecaptcha, 100);
            }
        };
        checkRecaptcha();
    }

    initializeCaptchaWidgets() {
        try {
            // Initialize login CAPTCHA
            const loginContainer = document.getElementById('login-recaptcha');
            if (loginContainer && !loginContainer.hasAttribute('data-rendered')) {
                grecaptcha.render('login-recaptcha', {
                    'sitekey': this.siteKey,
                    'theme': 'light',
                    'size': 'normal'
                });
                loginContainer.setAttribute('data-rendered', 'true');
            }

            // Initialize registration CAPTCHA
            const registerContainer = document.getElementById('register-recaptcha');
            if (registerContainer && !registerContainer.hasAttribute('data-rendered')) {
                grecaptcha.render('register-recaptcha', {
                    'sitekey': this.siteKey,
                    'theme': 'light',
                    'size': 'normal'
                });
                registerContainer.setAttribute('data-rendered', 'true');
            }

            this.initialized = true;
            console.log('✅ reCAPTCHA v2 widgets initialized successfully');

        } catch (error) {
            console.error('Failed to initialize CAPTCHA widgets:', error);
            this.showFallbackMessages();
        }
    }

    showFallbackMessages() {
        // Show fallback messages when CAPTCHA is disabled
        const loginFallback = document.getElementById('login-captcha-fallback');
        const registerFallback = document.getElementById('register-captcha-fallback');
        const loginRecaptcha = document.getElementById('login-recaptcha');
        const registerRecaptcha = document.getElementById('register-recaptcha');

        if (loginFallback && loginRecaptcha) {
            loginRecaptcha.style.display = 'none';
            loginFallback.style.display = 'block';
        }

        if (registerFallback && registerRecaptcha) {
            registerRecaptcha.style.display = 'none';
            registerFallback.style.display = 'block';
        }
    }

    // Get CAPTCHA response for form submission (reCAPTCHA v2)
    getCaptchaResponse(formType) {
        if (!this.enabled || !this.initialized) {
            return null;
        }

        try {
            const widgetId = formType === 'login' ? 'login-recaptcha' : 'register-recaptcha';
            const widget = document.getElementById(widgetId);
            
            if (widget && widget.hasAttribute('data-rendered')) {
                return grecaptcha.getResponse(widget);
            }
            
            return null;
        } catch (error) {
            console.error('Failed to get CAPTCHA response:', error);
            return null;
        }
    }

    // Reset CAPTCHA widget (v2)
    resetCaptcha(formType) {
        if (!this.enabled || !this.initialized) {
            return;
        }

        try {
            const widgetId = formType === 'login' ? 'login-recaptcha' : 'register-recaptcha';
            const widget = document.getElementById(widgetId);
            
            if (widget && widget.hasAttribute('data-rendered')) {
                grecaptcha.reset(widget);
                console.log(`🔄 reCAPTCHA v2 reset for ${formType}`);
            }
        } catch (error) {
            console.error('Failed to reset CAPTCHA:', error);
        }
    }

    // Validate CAPTCHA before form submission (v2 version)
    validateCaptcha(formType) {
        if (!this.enabled) {
            return true; // Skip validation when disabled
        }

        const response = this.getCaptchaResponse(formType);
        
        if (!response || response.length === 0) {
            if (window.showToast) {
                window.showToast('Please complete the CAPTCHA verification', 'error');
            }
            return false;
        }

        return true;
    }

    // Add CAPTCHA response to form data (v2 version)
    addCaptchaToFormData(formData, formType) {
        if (this.enabled) {
            const response = this.getCaptchaResponse(formType);
            if (response) {
                formData.append('g-recaptcha-response', response);
            }
        }
        return formData;
    }

    // Add CAPTCHA response to JSON data (v2 version)
    addCaptchaToJSON(data, formType) {
        if (this.enabled) {
            const response = this.getCaptchaResponse(formType);
            if (response) {
                data['g-recaptcha-response'] = response;
            }
        }
        return data;
    }
}

// Create global CAPTCHA manager instance
window.captchaManager = new CaptchaManager();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CaptchaManager;
}
