// Utility functions for LiBrowse

// Show toast notification
function showToast(message, type = 'info', duration = 3000) {
    // Ensure container exists
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    // Support both styling schemes: `.toast.error` and `.toast-error`
    toast.className = `toast ${type} toast-${type}`;
    // Ensure clicks work even if container disables pointer events
    toast.style.pointerEvents = 'auto';

    const icon = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    }[type] || 'fa-info-circle';

    toast.innerHTML = `
        <div class="toast-content">
            <div class="toast-icon"><i class="fas ${icon}"></i></div>
            <div class="toast-message">${escapeHtml(String(message))}</div>
            <button class="toast-close" aria-label="Close notification"><i class="fas fa-times"></i></button>
        </div>
    `;

    container.appendChild(toast);

    // Ensure container is visible (some CSS variants hide it by default)
    container.classList.add('show');

    // Trigger show animation on next frame
    requestAnimationFrame(() => toast.classList.add('show'));

    const removeToast = () => {
        toast.classList.add('hide');
        setTimeout(() => {
            toast.remove();
            // Hide container if no more toasts
            if (!container.querySelector('.toast')) {
                container.classList.remove('show');
            }
        }, 300);
    };

    // Close button
    toast.querySelector('.toast-close').addEventListener('click', removeToast);

    // Auto remove with pause/resume on hover to avoid stuck toasts
    let remaining = Math.max(0, duration | 0);
    let timerId;
    let startTime;
    const startTimer = () => {
        startTime = Date.now();
        timerId = setTimeout(removeToast, remaining);
    };
    const pauseTimer = () => {
        clearTimeout(timerId);
        remaining -= Date.now() - startTime;
        if (remaining < 0) remaining = 0;
    };
    const resumeTimer = () => {
        clearTimeout(timerId);
        if (remaining === 0) {
            removeToast();
        } else {
            startTimer();
        }
    };
    startTimer();

    toast.addEventListener('mouseenter', pauseTimer);
    toast.addEventListener('mouseleave', resumeTimer);
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

// Format time
function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Validate email
function isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

// Validate PLV email
function isValidPLVEmail(email) {
    return email.endsWith('@plv.edu.ph');
}

// Validate password strength
function validatePassword(password) {
    const requirements = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    
    return {
        isValid: Object.values(requirements).every(v => v),
        requirements
    };
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Truncate text
function truncateText(text, maxLength = 100) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Generate placeholder image URL
function getPlaceholderImage(text = 'Book', size = 200) {
    // Use a more reliable placeholder service
    const hash = text.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);
    const seed = Math.abs(hash) % 1000;
    return `https://picsum.photos/seed/${seed}/${size}/${size}`;
}

// Format book condition
function formatCondition(condition) {
    const conditions = {
        excellent: { text: 'Excellent', class: 'condition-excellent' },
        good: { text: 'Good', class: 'condition-good' },
        fair: { text: 'Fair', class: 'condition-fair' },
        poor: { text: 'Poor', class: 'condition-poor' },
        // Handle old database values
        new: { text: 'New', class: 'condition-excellent' },
        used_good: { text: 'Good', class: 'condition-good' },
        used_fair: { text: 'Fair', class: 'condition-fair' },
        damaged: { text: 'Poor', class: 'condition-poor' }
    };
    return conditions[condition] || { text: condition || 'Unknown', class: '' };
}

// Copy to clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
        return true;
    } catch (error) {
        console.error('Failed to copy:', error);
        showToast('Failed to copy', 'error');
        return false;
    }
}

// File size formatter
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Generate random ID
function generateId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
