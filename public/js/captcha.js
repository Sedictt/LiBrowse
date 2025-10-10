// CAPTCHA handling for LiBrowse (frontend only)
// In development mode, disable real CAPTCHA and show a fallback message.

document.addEventListener('DOMContentLoaded', () => {
  // Show fallback message and hide reCAPTCHA widgets if present
  document.querySelectorAll('.captcha-fallback').forEach(el => {
    el.style.display = 'block';
  });

  document.querySelectorAll('.g-recaptcha').forEach(el => {
    el.style.display = 'none';
  });

  console.log('CAPTCHA disabled - Development mode');
});

// Expose minimal helpers for callers
window.captcha = {
  validateCaptcha: () => true,
  resetCaptcha: () => {}
};
