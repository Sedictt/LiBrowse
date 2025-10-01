// CAPTCHA Verification Middleware
const axios = require('axios');

class CaptchaService {
    constructor() {
        this.siteKey = process.env.RECAPTCHA_SITE_KEY;
        this.secretKey = process.env.RECAPTCHA_SECRET_KEY;
        this.verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
    }

    // Verify reCAPTCHA token (supports both v2 and v3)
    async verify(token, remoteip = null, expectedAction = null) {
        try {
            if (!token) {
                return {
                    success: false,
                    error: 'No CAPTCHA token provided'
                };
            }

            if (!this.secretKey) {
                console.log('⚠️  CAPTCHA not configured - allowing request in development');
                return {
                    success: true,
                    development: true
                };
            }

            const params = new URLSearchParams();
            params.append('secret', this.secretKey);
            params.append('response', token);
            if (remoteip) {
                params.append('remoteip', remoteip);
            }

            const response = await axios.post(this.verifyUrl, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000 // 10 second timeout
            });

            const result = response.data;

            if (result.success) {
                console.log('✅ reCAPTCHA v2 verification successful');
                return {
                    success: true,
                    version: 'v2'
                };
            } else {
                console.log('❌ CAPTCHA verification failed:', result['error-codes']);
                return {
                    success: false,
                    error: 'CAPTCHA verification failed',
                    errorCodes: result['error-codes'] || []
                };
            }

        } catch (error) {
            console.error('CAPTCHA verification error:', error.message);
            
            // In development, allow requests if CAPTCHA service is down
            if (process.env.NODE_ENV === 'development') {
                console.log('⚠️  CAPTCHA service error - allowing request in development');
                return {
                    success: true,
                    development: true,
                    error: error.message
                };
            }

            return {
                success: false,
                error: 'CAPTCHA service unavailable'
            };
        }
    }

    // Express middleware for CAPTCHA verification
    middleware(options = {}) {
        const {
            skipInDevelopment = true,
            customErrorMessage = 'Please complete the CAPTCHA verification',
            expectedAction = null
        } = options;

        return async (req, res, next) => {
            try {
                // Skip CAPTCHA in development if configured
                if (skipInDevelopment && process.env.NODE_ENV === 'development' && !this.secretKey) {
                    console.log('🔓 Skipping CAPTCHA in development mode');
                    return next();
                }

                // Get CAPTCHA token from request
                const captchaToken = req.body['g-recaptcha-response'] || req.body.captcha || req.headers['x-captcha-token'];
                
                if (!captchaToken) {
                    return res.status(400).json({
                        success: false,
                        message: customErrorMessage,
                        error: 'missing_captcha'
                    });
                }

                // Verify CAPTCHA with expected action
                const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
                const verification = await this.verify(captchaToken, clientIP, expectedAction);

                if (!verification.success) {
                    return res.status(400).json({
                        success: false,
                        message: customErrorMessage,
                        error: 'invalid_captcha',
                        details: verification.error,
                        score: verification.score
                    });
                }

                // Add verification result to request for logging
                req.captchaVerification = verification;
                console.log(`✅ CAPTCHA v2 verified successfully`);
                next();

            } catch (error) {
                console.error('CAPTCHA middleware error:', error);
                
                // In development, allow requests if middleware fails
                if (skipInDevelopment && process.env.NODE_ENV === 'development') {
                    console.log('⚠️  CAPTCHA middleware error - allowing request in development');
                    return next();
                }

                return res.status(500).json({
                    success: false,
                    message: 'CAPTCHA verification service unavailable',
                    error: 'service_error'
                });
            }
        };
    }

    // Get site key for frontend
    getSiteKey() {
        return this.siteKey;
    }

    // Check if CAPTCHA is configured
    isConfigured() {
        return !!(this.siteKey && this.secretKey);
    }
}

// Create singleton instance
const captchaService = new CaptchaService();

module.exports = {
    captchaService,
    verifyCaptcha: captchaService.middleware.bind(captchaService)
};
