// CAPTCHA handling for LiBrowse

// Check if reCAPTCHA is available
function isCaptchaAvailable() {
    return typeof grecaptcha !== 'undefined' && grecaptcha.ready;
}

// Initialize CAPTCHA
function initCaptcha() {
    // Check if in development mode or if reCAPTCHA is not configured
    const siteKey = document.querySelector('[data-sitekey]')?.getAttribute('data-sitekey');
    
    if (!siteKey || siteKey === '') {
        // Show fallback message
        const fallbacks = document.querySelectorAll('.captcha-fallback');
        fallbacks.forEach(fallback => {
            fallback.style.display = 'block';
        });
        
        // Hide reCAPTCHA containers
        const containers = document.querySelectorAll('.g-recaptcha');
        containers.forEach(container => {
            container.style.display = 'none';
        });
        
        console.log('CAPTCHA disabled - Development mode');
        return false;
    }
    
    // Initialize reCAPTCHA if available
    if (isCaptchaAvailable()) {
        grecaptcha.ready(() => {
            console.log('reCAPTCHA initialized');
        });
        return true;
    }
    
    return false;
}

// Get CAPTCHA response
function getCaptchaResponse(formType = 'login') {
    const siteKey = document.querySelector('[data-sitekey]')?.getAttribute('data-sitekey');
    
    // If no site key, return dummy response for development
    if (!siteKey || siteKey === '') {
        return 'dev-mode-skip';
    }
    
    // Get reCAPTCHA response
    if (isCaptchaAvailable()) {
        const containerId = formType === 'login' ? 'login-recaptcha' : 'register-recaptcha';
        const container = document.getElementById(containerId);
        
        if (container) {
            const widgetId = container.getAttribute('data-widget-id');
            if (widgetId) {
                return grecaptcha.getResponse(parseInt(widgetId));
            }
        }
    }
    
    return null;
}

// Reset CAPTCHA
function resetCaptcha(formType = 'login') {
    if (isCaptchaAvailable()) {
        const containerId = formType === 'login' ? 'login-recaptcha' : 'register-recaptcha';
        const container = document.getElementById(containerId);
        
        if (container) {
            const widgetId = container.getAttribute('data-widget-id');
            if (widgetId) {
                grecaptcha.reset(parseInt(widgetId));
            }
        }
    }
}

// Validate CAPTCHA
function validateCaptcha(formType = 'login') {
    const siteKey = document.querySelector('[data-sitekey]')?.getAttribute('data-sitekey');
    
    // Skip validation in development mode
    if (!siteKey || siteKey === '') {
        return true;
    }
    
    const response = getCaptchaResponse(formType);
    return response !== null && response !== '';
}

// Initialize CAPTCHA when page loads
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initCaptcha();
    }, 500);
});
