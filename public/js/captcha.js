// CAPTCHA handling for LiBrowse
// Dynamically enables Google reCAPTCHA v2 (checkbox) when a site key is configured on the server.
(function () {
  const STATE = {
    enabled: false,
    siteKey: '',
    widgets: {}, // { login: widgetId, register: widgetId }
  };

  function setFallbackVisible(visible) {
    document.querySelectorAll('.captcha-fallback').forEach(el => {
      el.style.display = visible ? 'block' : 'none';
    });
    document.querySelectorAll('.g-recaptcha').forEach(el => {
      el.style.display = visible ? 'none' : 'block';
    });
  }

  function loadRecaptchaScript(cb) {
    if (window.grecaptcha) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://www.google.com/recaptcha/api.js?onload=__onRecaptchaApiLoad&render=explicit';
    s.async = true;
    s.defer = true;
    window.__onRecaptchaApiLoad = cb;
    document.head.appendChild(s);
  }

  function renderWidgets() {
    if (!window.grecaptcha || !STATE.siteKey) return;
    const mapping = { login: 'login-recaptcha', register: 'register-recaptcha' };
    Object.entries(mapping).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el && STATE.widgets[key] == null) {
        try {
          const wid = window.grecaptcha.render(el, { sitekey: STATE.siteKey });
          STATE.widgets[key] = wid;
        } catch (e) {
          console.warn('Failed to render reCAPTCHA for', key, e);
        }
      }
    });
  }

  async function init() {
    try {
      const res = await fetch('/api/config/recaptcha');
      const data = await res.json();
      STATE.enabled = !!data.enabled && !!data.siteKey;
      STATE.siteKey = data.siteKey || '';

      if (!STATE.enabled) {
        setFallbackVisible(true);
        console.log('CAPTCHA disabled - Development mode');
        return;
      }

      setFallbackVisible(false);
      loadRecaptchaScript(() => {
        renderWidgets();
      });
    } catch (e) {
      console.warn('Failed to load reCAPTCHA config, using fallback:', e);
      setFallbackVisible(true);
      STATE.enabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  window.captcha = {
    get enabled() { return STATE.enabled; },
    getResponse(formType) {
      if (!STATE.enabled) return 'dev-mode-skip';
      const wid = STATE.widgets[formType];
      if (wid == null || !window.grecaptcha) return '';
      return window.grecaptcha.getResponse(wid);
    },
    reset(formType) {
      if (!STATE.enabled) return;
      const wid = STATE.widgets[formType];
      if (wid != null && window.grecaptcha) window.grecaptcha.reset(wid);
    },
    validate(formType) {
      const token = this.getResponse(formType);
      return !!token;
    }
  };
})();
