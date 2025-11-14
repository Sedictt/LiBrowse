// LiBrowse - Authentication Middleware
const jwt = require('jsonwebtoken');
const { promisify } = require('util');

// Verify JWT token middleware
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        // Verify token
        const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        } else if (error.name === 'JsonWebTokenError') {
            return res.status(403).json({ error: 'Invalid token' });
        }
        return res.status(500).json({ error: 'Token verification failed' });
    }
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
            req.user = decoded;
        }
        next();
    } catch (error) {
        // Continue without authentication
        next();
    }
};

// Check if user owns the resource
const checkOwnership = (resourceIdField = 'id') => {
    return (req, res, next) => {
        const resourceId = req.params[resourceIdField];
        const userId = req.user.id;

        // This middleware should be used after authenticateToken
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // For now, we'll let the route handler check ownership
        // This can be enhanced to check database directly
        next();
    };
};

// Validate PLV email domain
const PLV_EMAIL_DOMAIN = '@plv.edu.ph';

const validatePLVEmail = (req, res, next) => {
    const { email } = req.body;
    
    if (!email || !String(email).toLowerCase().endsWith(PLV_EMAIL_DOMAIN)) {
        return res.status(400).json({ 
            error: `Please use your PLV email address (${PLV_EMAIL_DOMAIN})` 
        });
    }
    
    next();
};

// Rate limiting for authentication endpoints
const authRateLimit = (maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
    const attempts = new Map();

    return (req, res, next) => {
        const key = req.ip + req.path;
        const now = Date.now();
        
        // Clean old entries
        for (const [k, v] of attempts.entries()) {
            if (now - v.timestamp > windowMs) {
                attempts.delete(k);
            }
        }

        const userAttempts = attempts.get(key);
        
        if (userAttempts && userAttempts.count >= maxAttempts) {
            return res.status(429).json({ 
                error: 'Too many attempts. Please try again later.' 
            });
        }

        // Track this attempt
        if (userAttempts) {
            userAttempts.count++;
        } else {
            attempts.set(key, { count: 1, timestamp: now });
        }

        next();
    };
};

// Generate JWT token
const generateToken = (payload, expiresIn = '7d') => {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

// Generate OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Validate password strength
const validatePassword = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const errors = [];

    if (password.length < minLength) {
        errors.push(`Password must be at least ${minLength} characters long`);
    }
    if (!hasUpperCase) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (!hasLowerCase) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (!hasNumbers) {
        errors.push('Password must contain at least one number');
    }
    if (!hasSpecialChar) {
        errors.push('Password must contain at least one special character');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

// Middleware to validate password
const checkPasswordStrength = (req, res, next) => {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ error: 'Password is required' });
    }

    const validation = validatePassword(password);
    
    if (!validation.isValid) {
        return res.status(400).json({ 
            error: 'Password does not meet requirements',
            details: validation.errors
        });
    }

    next();
};

// Sanitize user data for response
const sanitizeUser = (user) => {
    const sanitized = { ...user };
    delete sanitized.password;
    delete sanitized.password_hash;
    delete sanitized.otp;
    delete sanitized.otp_expires;
    delete sanitized.verification_token;
    delete sanitized.verification_expires;
    return sanitized;
};

module.exports = {
    authenticateToken,
    optionalAuth,
    checkOwnership,
    validatePLVEmail,
    authRateLimit,
    generateToken,
    generateOTP,
    validatePassword,
    checkPasswordStrength,
    sanitizeUser
};
