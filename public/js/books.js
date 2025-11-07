// Books management for LiBrowse

// Debounce utility function
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

class BooksManager {
    constructor() {
        this.books = [];
        this.currentPage = 1;
        this.booksPerPage = 12;
        this.filters = {};
        this.totalBooks = 0;
        this.hasMore = false;
        this.isLoading = false;
        // Lazy-loaded server config for loans/closures
        this.libraryConfig = null;
    }

    async loadBooks(filters = {}, reset = true) {
        if (this.isLoading) return;

        try {
            this.isLoading = true;
            this.filters = { ...this.filters, ...filters };

            // Refresh user profile to get up-to-date credits before rendering gating UI
            if (typeof authManager !== 'undefined' && authManager?.isAuthenticated) {
                try {
                    const prof = await api.getProfile();
                    if (prof?.user) authManager.currentUser = prof.user;
                } catch (_) { /* non-blocking */ }
            }

            if (reset) {
                this.currentPage = 1;
                this.books = [];
            }

            const queryParams = {
                page: this.currentPage,
                limit: this.booksPerPage,
                ...this.filters
            };

            const response = await api.getBooks(queryParams);

            if (reset) {
                this.books = response.books || [];
            } else {
                this.books = [...this.books, ...(response.books || [])];
            }

            this.totalBooks = response.pagination?.total || 0;
            this.hasMore = response.pagination?.hasMore || false;

            this.renderBooks();
            this.updateLoadMoreButton();

        } catch (error) {
            console.error('Failed to load books:', error);
            showToast('Failed to load books', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    async loadMoreBooks() {
        if (!this.hasMore || this.isLoading) return;

        this.currentPage++;
        await this.loadBooks({}, false);
    }

    async searchBooks(query) {
        if (!query.trim()) {
            await this.loadBooks({ query: '' });
            return;
        }

        try {
            const response = await api.get(`/books/search?query=${encodeURIComponent(query)}&page=1&limit=${this.booksPerPage}`);
            this.books = response.books || [];
            this.totalBooks = response.pagination?.total || 0;
            this.hasMore = response.pagination?.hasMore || false;
            this.currentPage = 1;

            this.renderBooks();
            this.updateLoadMoreButton();
        } catch (error) {
            console.error('Search failed:', error);
            showToast('Search failed', 'error');
        }
    }

    renderBooks() {
        const container = document.getElementById('books-grid');
        if (!container) return;

        if (this.books.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book"></i>
                    <h3>No books found</h3>
                    <p>Try adjusting your filters or add the first book!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.books.map(book => this.createBookCard(book)).join('');
    }

    createBookCard(book) {
        const condition = formatCondition(book.condition_rating || book.condition);
        const imageUrl = book.image_url || book.image || getPlaceholderImage(book.title);
        const isAvailable = book.is_available === 1 || book.is_available === true;
        const status = isAvailable ? 'available' : 'borrowed';
        const statusText = isAvailable ? 'Available' : 'Borrowed';

        // Check if user has enough credits (only if authenticated)
        const currentUser = authManager?.getCurrentUser();
        const userCredits = currentUser?.credits ?? 0;
        const requiredCredits = book.minimum_credits || book.min_credit || 0;
        const isAuthenticated = authManager?.isAuthenticated ?? false;
        const hasEnoughCredits = !isAuthenticated || userCredits >= requiredCredits;
        const canRequest = isAvailable && hasEnoughCredits;

        return `
            <div class="book-card" data-book-id="${book.id}">
                <div class="book-image">
                    <img src="${imageUrl}" alt="${escapeHtml(book.title)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="book-image-fallback" style="display: none; width: 100%; height: 100%; background: var(--bg-secondary); align-items: center; justify-content: center; font-size: 3rem; color: var(--text-muted);">
                        <i class="fas fa-book"></i>
                    </div>
                    <span class="book-status ${status}">${statusText}</span>
                </div>
                <div class="book-info">
                    <h3 class="book-title">${escapeHtml(book.title)}</h3>
                    <p class="book-author">${escapeHtml(book.author || 'Unknown Author')}</p>
                    <div class="book-meta">
                        <span class="book-program">${escapeHtml(book.course_code || '')}</span>
                        <span class="book-condition ${condition.class}">${condition.text}</span>
                    </div>
                    <div class="book-owner">
                        <i class="fas fa-user"></i>
                        <span>${escapeHtml(book.owner_name || 'Unknown')}</span>
                    </div>
                    ${book.minimum_credits || book.min_credit ? `
                        <div class="credit-requirement ${!hasEnoughCredits && isAuthenticated ? 'insufficient' : ''}">
                            <i class="fas fa-coins"></i>
                            <span class="credit-amount">${book.minimum_credits || book.min_credit}</span>
                            <span>credits required</span>
                            ${!hasEnoughCredits && isAuthenticated ? `
                                <small style="color: var(--danger); display: block; margin-top: 4px;">
                                    <i class="fas fa-exclamation-triangle"></i>
                                    Need ${requiredCredits - userCredits} more
                                </small>
                            ` : ''}
                        </div>
                    ` : ''}
                    <div class="book-actions">
                        <button class="btn btn-primary btn-sm" onclick="booksManager.requestBook(${book.id})" ${!canRequest ? 'disabled' : ''}>
                            <i class="fas fa-hand-paper"></i>
                            ${!isAvailable ? 'Unavailable' : !hasEnoughCredits && isAuthenticated ? 'Not Enough Credits' : 'Request'}
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="booksManager.viewBook(${book.id})">
                            <i class="fas fa-eye"></i>
                            View
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    async requestBook(bookId) {
        if (!authManager.requireAuth()) return;
        try {
            let book = this.books.find(b => b.id == bookId);
            if (!book) {
                const resp = await api.getBook(bookId);
                book = resp.book || resp;
            }
            await this.openBorrowRequestModal(book);
        } catch (error) {
            console.error('Failed to open request form:', error);
            showToast('Failed to open request form', 'error');
        }
    }

    async viewBook(bookId) {
        console.log('VIEW BOOK CALLED');

        try {
            // Find book in current array or fetch from API
            let book = this.books.find(b => b.id == bookId);

            if (!book) {
                const response = await api.getBook(bookId);
                book = response.book || response;
            }

            // 🎯 Track the view in backend and refresh Recently Viewed
            if (authManager && authManager.isAuthenticated) {
                try {
                    await api.trackBookView(bookId);
                    console.log('✅ Book view tracked:', bookId);
                    // Immediately refresh Recently Viewed list
                    await this.loadRecentlyViewed();
                } catch (error) {
                    console.warn('Failed to track book view:', error);
                    // Don't block modal if tracking fails
                }
            }

            // Show the modal
            this.showBookModal(book);

        } catch (error) {
            console.error('Failed to load book details:', error);
            showToast('Failed to load book details', 'error');
        }
    }


    showBookModal(book) {
        console.log('=== SHOW BOOK MODAL ===');
        console.log('Book received:', book);

        // Store current book for modal actions
        this.currentModalBook = book;

        // Update modal content
        console.log('About to populate modal...');
        this.populateBookModal(book);
        console.log('Modal populated');

        // Show modal
        const modal = document.getElementById('book-details-modal');
        console.log('Modal element:', modal);
        console.log('Modal classes before:', modal?.className);

        // Ensure loading overlay doesn't cover the modal
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            loadingScreen.style.display = 'none';
        }

        if (modal) {
            // Force visibility with inline styles to override any CSS issues
            modal.style.display = 'flex';
            modal.style.visibility = 'visible';
            modal.style.opacity = '1';
            modal.style.zIndex = '9999';
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';

            console.log('Modal classes after:', modal.className);
            console.log('Modal computed styles:', {
                display: getComputedStyle(modal).display,
                visibility: getComputedStyle(modal).visibility,
                opacity: getComputedStyle(modal).opacity,
                zIndex: getComputedStyle(modal).zIndex
            });
            console.log('Modal shown successfully');
        } else {
            console.error('Modal element not found!');
        }
    }

    populateBookModal(book) {
        console.log('=== POPULATING MODAL ===');
        console.log('Book data received:', book);
        console.log('Book title:', book.title);
        console.log('Book author:', book.author);

        // Check if modal elements exist
        const titleElement = document.getElementById('modal-book-title');
        const titleTextElement = document.getElementById('modal-book-title-text');

        console.log('Title element found:', !!titleElement);
        console.log('Title text element found:', !!titleTextElement);

        if (!titleElement) {
            console.error('modal-book-title element not found!');
            return;
        }
        if (!titleTextElement) {
            console.error('modal-book-title-text element not found!');
            return;
        }

        // Test with simple values first
        console.log('Setting title to:', book.title);
        titleElement.textContent = book.title || 'TEST TITLE';
        titleTextElement.textContent = book.title || 'TEST TITLE';
        console.log('Title set successfully');
        document.getElementById('modal-book-author').textContent = book.author || book.writer || 'Unknown Author';
        document.getElementById('modal-book-isbn').textContent = book.isbn || 'Not specified';
        document.getElementById('modal-book-publisher').textContent = book.publisher || 'Not specified';
        document.getElementById('modal-book-year').textContent = book.publication_year || book.year_pub || 'Not specified';
        document.getElementById('modal-book-edition').textContent = book.edition || 'Not specified';

        // Course information
        document.getElementById('modal-book-course-code').textContent = book.course_code || book.code || 'Not specified';
        document.getElementById('modal-book-subject').textContent = book.subject || book.subj || 'Not specified';

        // Condition and requirements
        const condition = formatCondition(book.condition_rating || book.condition);
        const conditionElement = document.getElementById('modal-book-condition');
        if (conditionElement) {
            conditionElement.textContent = condition.text;
            conditionElement.className = condition.class;
        }

        // Credits and owner info
        const creditsEl = document.getElementById('modal-book-credits');
        if (creditsEl) {
            creditsEl.textContent = `${book.minimum_credits || book.min_credit || 0} credits`;
        }
        const ownerEl = document.getElementById('modal-book-owner');
        if (ownerEl) {
            ownerEl.textContent = book.owner_name || 'Unknown';
        }
        const ownerProgEl = document.getElementById('modal-book-owner-program');
        if (ownerProgEl) {
            ownerProgEl.textContent = book.owner_program || book.program || 'Not specified';
        }

        // Image (reset any fallback visibility and set best-available source)
        const imageUrl = book.image_url || book.image || book.cover_image || book.cover || getPlaceholderImage(book.title);
        const imageElement = document.getElementById('modal-book-image');
        if (imageElement) {
            imageElement.style.display = '';
            const fallbackEl = imageElement.nextElementSibling;
            if (fallbackEl && fallbackEl.classList && fallbackEl.classList.contains('book-image-fallback')) {
                fallbackEl.style.display = 'none';
            }
            imageElement.alt = book.title ? `Cover of ${book.title}` : 'Book cover';
            imageElement.src = imageUrl;
        }

        // Status badge
        const isAvailable = book.is_available === 1 || book.is_available === true;
        const status = isAvailable ? 'available' : 'borrowed';
        const statusText = isAvailable ? 'Available' : 'Borrowed';
        const statusElement = document.getElementById('modal-book-status');
        if (statusElement) {
            statusElement.textContent = statusText;
            statusElement.className = `book-status-badge ${status}`;
        }

        // Description (if available)
        const descriptionSection = document.getElementById('modal-book-description-section');
        const descriptionElement = document.getElementById('modal-book-description');
        if (book.description && book.description.trim()) {
            descriptionElement.textContent = book.description;
            descriptionSection.style.display = 'block';
        } else {
            descriptionSection.style.display = 'none';
        }

        // Request button state - check both availability and credits
        const requestButton = document.getElementById('modal-request-book');
        if (requestButton) {
            const currentUser = authManager?.getCurrentUser();
            const userCredits = currentUser?.credits ?? 0;
            const requiredCredits = book.minimum_credits || book.min_credit || 0;
            const isUserAuthenticated = authManager?.isAuthenticated ?? false;
            const hasEnoughCredits = !isUserAuthenticated || userCredits >= requiredCredits;

            if (!isAvailable) {
                requestButton.disabled = true;
                requestButton.innerHTML = '<i class="fas fa-ban"></i> Not Available';
            } else if (!hasEnoughCredits && isUserAuthenticated) {
                requestButton.disabled = true;
                requestButton.innerHTML = `<i class="fas fa-coins"></i> Insufficient Credits (Need ${requiredCredits - userCredits} more)`;
            } else {
                requestButton.disabled = false;
                requestButton.innerHTML = '<i class="fas fa-hand-paper"></i> Request Book';
            }
        }
    }

    async requestBookFromModal() {
        if (!authManager.requireAuth()) return;
        if (!this.currentModalBook) return;
        await this.openBorrowRequestModal(this.currentModalBook);
    }


    // Open borrow request modal and prefill
    async openBorrowRequestModal(book) {
        // Refresh profile to ensure we have the latest credits
        if (typeof authManager !== 'undefined' && authManager?.isAuthenticated) {
            try {
                const prof = await api.getProfile();
                if (prof?.user) authManager.currentUser = prof.user;
            } catch (_) { /* non-blocking */ }
        }

        // Check if user has enough credits before opening modal
        const currentUser = authManager.getCurrentUser();
        const userCredits = currentUser?.credits ?? 0;
        const requiredCredits = book.minimum_credits || book.min_credit || 0;

        if (userCredits < requiredCredits) {
            const deficit = requiredCredits - userCredits;
            showToast(
                `Insufficient credits! You have ${userCredits} but need ${requiredCredits}. You need ${deficit} more to request this book.`,
                'error',
                5000
            );
            return;
        }

        const modal = document.getElementById('borrow-request-modal');
        if (!modal) {
            showToast('Borrow request form not found', 'error');
            return;
        }
        this.requestBookCtx = book;
        const q = (sel) => modal.querySelector(sel);
        const setVal = (id, val) => { const el = q(`#${id}`); if (el) el.value = val || ''; };
        const setErr = (id, msg) => { const el = q(`#err-${id}`); if (el) el.textContent = msg || ''; };

        const bookIdInput = q('#request-book-id');
        if (bookIdInput) bookIdInput.value = book.id;
        setVal('pickup-method', 'meet');
        setVal('pickup-location', 'PLV Library');
        setVal('borrow-duration', '');
        setVal('preferred-pickup-time', '');
        setVal('request-contact', '');
        setVal('request-address', '');
        setVal('request-message', '');
        setVal('expected-return-date', '—');

        
        const startInput = q('#borrow-start-date');
        if (startInput) {
            const today = new Date();
            const todayStr = this.toYYYYMMDD(today);
            startInput.value = todayStr;
            startInput.min = todayStr;
            startInput.onchange = () => this.updateExpectedReturnDate(modal);
            if (window.flatpickr) {
                try {
                    if (this._fpBorrowStart) { this._fpBorrowStart.destroy(); }
                    this._fpBorrowStart = flatpickr(startInput, {
                        dateFormat: 'Y-m-d',
                        altInput: true,
                        altFormat: 'M j, Y',
                        defaultDate: todayStr,
                        minDate: 'today',
                        disableMobile: true,
                        onChange: () => this.updateExpectedReturnDate(modal)
                    });
                } catch (_) { /* noop */ }
            }
        }
        const durSelect = q('#borrow-duration');
        if (durSelect) {
            durSelect.onchange = () => this.updateExpectedReturnDate(modal);
        }
        
        const pickupInput = q('#preferred-pickup-time');
        if (pickupInput && window.flatpickr) {
            try {
                if (this._fpPickup) { this._fpPickup.destroy(); }
                this._fpPickup = flatpickr(pickupInput, {
                    enableTime: true,
                    altInput: true,
                    altFormat: 'M j, Y h:i K',
                    dateFormat: 'Y-m-d\\TH:i',
                    
                    minuteIncrement: 15,
                    disableMobile: true
                });
            } catch (_) { /* noop */ }
        }

        // Clear inline errors
        ['pickup-method','pickup-location','borrow-start-date','borrow-duration','preferred-pickup-time','request-contact','request-message']
            .forEach(k => setErr(k, ''));

        // Preload config (closures, limits) then recalc
        this.loadLibraryConfigOnce().finally(() => this.updateExpectedReturnDate(modal));

        this.closeBookModal();

        // Show modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // Helper: format a Date to YYYY-MM-DD (local)
    toYYYYMMDD(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Helper: format a Date to 'Mon D, YYYY' (display-friendly)
    formatDisplayDate(date) {
        try {
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        } catch (_) {
            // Fallback to ISO if formatting fails
            return this.toYYYYMMDD(date);
        }
    }

    // Helper: map duration value to days
    getDurationDays(val) {
        const map = { '1w': 7, '2w': 14, '3w': 21, '1m': 30, '1-week': 7, '2-weeks': 14, '3-weeks': 21, '1-month': 30 };
        return map[val] || 0;
    }

    async loadLibraryConfigOnce() {
        if (this.libraryConfig) return;
        try {
            const res = await fetch('/api/config/library');
            this.libraryConfig = await res.json();
        } catch (e) {
            // Fallback defaults
            this.libraryConfig = { loans: { closuresEnabled: false, weeklyClosedDays: [], holidays: [], allowPastStartDateDays: 0 } };
        }
    }

    // Recalculate and display Expected Return Date
    updateExpectedReturnDate(modal) {
        const q = (sel) => modal.querySelector(sel);
        const startStr = q('#borrow-start-date')?.value;
        const durationVal = q('#borrow-duration')?.value;
        const erdInput = q('#expected-return-date');
        const erdLive = q('#erd-live');
        const closureNote = q('#erd-closure-note');

        const showDash = () => {
            if (erdInput) erdInput.value = '—';
            if (closureNote) closureNote.style.display = 'none';
            if (erdLive) erdLive.textContent = 'Expected return date not available';
        };

        if (!startStr || !durationVal) {
            showDash();
            return;
        }

        const days = this.getDurationDays(durationVal);
        if (!days) { showDash(); return; }

        // Compute due date = start + days (start date not counted)
        const [yy, mm, dd] = startStr.split('-').map(Number);
        const base = new Date(yy, mm - 1, dd, 12); // noon avoids DST edge cases
        const due = new Date(base);
        due.setDate(due.getDate() + days);

        // Optional closure adjustment
        let adjusted = false;
        const cfg = this.libraryConfig?.loans || {};
        if (cfg.closuresEnabled) {
            const weeklyClosed = cfg.weeklyClosedDays || [];
            const holidays = cfg.holidays || [];
            const isClosed = (dt) => weeklyClosed.includes(dt.getDay()) || holidays.includes(this.toYYYYMMDD(dt));
            while (isClosed(due)) { due.setDate(due.getDate() + 1); adjusted = true; }
        }

        const isoDate = this.toYYYYMMDD(due);
        const displayDate = this.formatDisplayDate(due);
        if (erdInput) {
            erdInput.value = displayDate;
            erdInput.setAttribute('data-value', isoDate);
        }
        if (closureNote) closureNote.style.display = adjusted ? '' : 'none';
        if (erdLive) erdLive.textContent = adjusted
            ? `Expected return date updated to ${displayDate}. Adjusted for closure.`
            : `Expected return date updated to ${displayDate}.`;

        // Enforce Preferred Pickup Time <= Expected Return Date
        try {
            const pickupInput = q('#preferred-pickup-time');
            if (pickupInput && this._fpPickup) {
                const maxDate = isoDate ? new Date(`${isoDate}T23:59:59`) : null;
                this._fpPickup.set('maxDate', maxDate);
            }
        } catch (_) { /* noop */ }
    }

    // Submit handler for borrow request form
    async handleBorrowRequestSubmit(e) {
        e.preventDefault();
        if (!authManager.requireAuth()) return;

        const modal = document.getElementById('borrow-request-modal');
        if (!modal) return;
        const q = (sel) => modal.querySelector(sel);

        const bookId = Number(q('#request-book-id')?.value);
        const pickup_method = q('#pickup-method')?.value;
        const pickup_location = (q('#pickup-location')?.value || '').trim();
        const borrow_start_date = q('#borrow-start-date')?.value;
        const borrow_duration = q('#borrow-duration')?.value || '';
        const raw_pickup_time = q('#preferred-pickup-time')?.value;
        const preferred_pickup_time = raw_pickup_time ? raw_pickup_time : null;
        const borrower_contact = (q('#request-contact')?.value || '').trim();
        const addr = (q('#request-address')?.value || '').trim();
        const borrower_address = addr ? addr : null;
        const request_message = (q('#request-message')?.value || '').trim();

        // Basic inline validation (scoped to the modal)
        let hasError = false;
        const setErr = (k, m) => { const el = q(`#err-${k}`); if (el) el.textContent = m || ''; if (m) hasError = true; };
        setErr('pickup-method', !pickup_method ? 'Required' : '');
        setErr('pickup-location', !pickup_location ? 'Required' : '');
        setErr('request-contact', !borrower_contact ? 'Required' : '');
        setErr('request-message', request_message.length < 10 ? 'Minimum 10 characters' : '');
        setErr('borrow-duration', !borrow_duration ? 'Select a duration' : '');

        // Start date validation: cannot be in the past (configurable)
        const allowPast = this.libraryConfig?.loans?.allowPastStartDateDays ?? 0;
        const minDate = new Date();
        minDate.setDate(minDate.getDate() - (Number(allowPast) || 0));
        const minStr = this.toYYYYMMDD(minDate);
        if (!borrow_start_date) {
            setErr('borrow-start-date', 'Required');
        } else if (borrow_start_date < minStr) {
            setErr('borrow-start-date', 'Start date cannot be in the past');
        }

        // Preferred pickup must be <= expected return date if both provided
        try {
            const expectedIso = q('#expected-return-date')?.getAttribute('data-value');
            if (expectedIso && raw_pickup_time) {
                const pick = new Date(raw_pickup_time);
                const max = new Date(`${expectedIso}T23:59:59`);
                if (pick > max) {
                    setErr('preferred-pickup-time', 'Must be on or before the expected return date');
                }
            }
        } catch (_) { /* noop */ }

        if (hasError) return;

        // Final pre-check: ensure user meets credit requirement before sending
        try {
            const currentUser = authManager.getCurrentUser();
            const userCredits = currentUser?.credits ?? 0;
            const requiredCredits = (this.requestBookCtx?.minimum_credits || this.requestBookCtx?.min_credit || 0);
            if (userCredits < requiredCredits) {
                const deficit = requiredCredits - userCredits;
                showToast(
                    `Insufficient credits! You have ${userCredits} but need ${requiredCredits}. You need ${deficit} more to request this book.`,
                    'error',
                    5000
                );
                return;
            }
        } catch (_) { /* noop */ }

        const submitBtn = q('#borrow-request-submit');
        const prevHtml = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        }

        try {
            const payload = {
                book_id: bookId,
                request_message,
                borrower_contact,
                pickup_method,
                pickup_location,
                borrower_address,
                borrow_duration,
                borrow_start_date,
                preferred_pickup_time: preferred_pickup_time ? new Date(preferred_pickup_time).toISOString() : null
            };

            await api.createBorrowRequest(payload);
            showToast('Request sent successfully!', 'success');

            // Update UI: mark book unavailable/requested
            if (this.books && this.books.length) {
                const idx = this.books.findIndex(b => b.id == bookId);
                if (idx >= 0) {
                    this.books[idx].is_available = 0;
                    this.renderBooks();
                }
            }

            // Close modals
            if (modal) { modal.classList.remove('active'); }
            const detailsModal = document.getElementById('book-details-modal');
            if (detailsModal) { detailsModal.classList.remove('active'); }
        } catch (err) {
            console.error('Borrow request failed:', err);

            // Handle validation errors with field-specific messages
            if (err?.status === 400 && err?.body?.details && Array.isArray(err.body.details)) {
                err.body.details.forEach(d => {
                    const key = d.field || d.path || d.param;
                    const el = key ? q(`#err-${key}`) : null;
                    if (el) el.textContent = d.message || d.msg || 'Invalid value';
                });
                showToast(err.message || 'Please correct the highlighted fields', 'error');
            }
            // Handle credit-related errors with detailed information
            else if (err?.status === 400 && err?.body) {
                const errorBody = err.body;

                // Check if it's a credit-related error
                if (errorBody.required_credits !== undefined && errorBody.current_credits !== undefined) {
                    const deficit = errorBody.required_credits - errorBody.current_credits;
                    showToast(
                        `Insufficient credits! You have ${errorBody.current_credits} credits but need ${errorBody.required_credits} credits. You need ${deficit} more credits.`,
                        'error',
                        5000
                    );
                } else {
                    // Generic 400 error
                    showToast(err.message || errorBody.error || 'Validation error', 'error');
                }
            }
            else if (err?.status === 403) {
                showToast('Insufficient credits or request limit reached', 'error');
            }
            else {
                showToast(err.message || 'Failed to send request', 'error');
            }
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = prevHtml; }
        }
    }

    closeBookModal() {
        const modal = document.getElementById('book-details-modal');
        if (modal) {
            modal.classList.remove('active');
            // Clear inline styles that were set when opening
            modal.style.display = '';
            modal.style.visibility = '';
            modal.style.opacity = '';
            modal.style.zIndex = '';
            document.body.style.overflow = '';
        }
        this.currentModalBook = null;
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('book-search');
        if (searchInput) {
            const debouncedSearch = debounce((query) => {
                this.searchBooks(query);
            }, 500);

            searchInput.addEventListener('input', (e) => {
                debouncedSearch(e.target.value);
            });
        }

        // Filter functionality
        const filterSelects = ['program-filter', 'condition-filter', 'availability-filter', 'sort-filter']; // ADD sort-filter
        filterSelects.forEach(filterId => {
            const filter = document.getElementById(filterId);
            if (filter) {
                filter.addEventListener('change', () => this.applyFilters());
            }
        });

        // Load more functionality
        const loadMoreBtn = document.getElementById('load-more-books');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                this.loadMoreBooks();
            });
        }


        // Borrow request form submit
        const borrowForm = document.getElementById('borrow-request-form');
        if (borrowForm) {
            borrowForm.addEventListener('submit', (e) => this.handleBorrowRequestSubmit(e));
        }

        // Collapsible sections in modal
        this.setupCollapsibleSections();
    }

    setupCollapsibleSections() {
        // Use event delegation for collapsible sections
        document.addEventListener('click', (e) => {
            const header = e.target.closest('.section-header');
            if (header && header.hasAttribute('data-toggle')) {
                const section = header.closest('.book-details-section');
                if (section) {
                    section.classList.toggle('collapsed');
                }
            }
        });
    }

    applyFilters() {
        const filters = {};

        const programFilter = document.getElementById('program-filter');
        const conditionFilter = document.getElementById('condition-filter');
        const availabilityFilter = document.getElementById('availability-filter');
        const sortFilter = document.getElementById('sort-filter'); // ADD THIS

        if (programFilter?.value) filters.program = programFilter.value;
        if (conditionFilter?.value) filters.condition = conditionFilter.value;
        if (availabilityFilter?.value) filters.availability = availabilityFilter.value;
        if (sortFilter?.value) filters.sort = sortFilter.value; // ADD THIS

        // Show loading state
        const booksGrid = document.getElementById('books-grid');
        if (booksGrid) {
            booksGrid.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Loading books...</div>';
        }

        this.loadBooks(filters);
    }


    updateLoadMoreButton() {
        const loadMoreBtn = document.getElementById('load-more-books');
        if (!loadMoreBtn) return;

        if (this.hasMore && this.books.length > 0) {
            loadMoreBtn.style.display = 'block';
            loadMoreBtn.disabled = this.isLoading;
            loadMoreBtn.innerHTML = this.isLoading
                ? '<i class="fas fa-spinner fa-spin"></i> Loading...'
                : '<i class="fas fa-chevron-down"></i> Load More Books';
        } else {
            loadMoreBtn.style.display = 'none';
        }
    }

    async searchBooks(query) {
        if (!query.trim()) {
            this.loadBooks();
            return;
        }

        try {
            this.isLoading = true;
            this.updateLoadMoreButton();

            const response = await api.get(`/books/search?q=${encodeURIComponent(query)}`);
            this.books = response.books || [];
            this.totalBooks = response.pagination?.total || 0;
            this.hasMore = response.pagination?.hasMore || false;

            this.renderBooks();
            this.updateLoadMoreButton();
        } catch (error) {
            console.error('Search failed:', error);
            showToast('Search failed', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    async loadMoreBooks() {
        if (this.isLoading || !this.hasMore) return;

        try {
            this.isLoading = true;
            this.updateLoadMoreButton();

            const currentPage = Math.floor(this.books.length / 12) + 1;
            const response = await api.get(`/books?page=${currentPage}&limit=12`);

            this.books = [...this.books, ...(response.books || [])];
            this.totalBooks = response.pagination?.total || 0;
            this.hasMore = response.pagination?.hasMore || false;

            this.renderBooks();
            this.updateLoadMoreButton();
        } catch (error) {
            console.error('Failed to load more books:', error);
            showToast('Failed to load more books', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    // Test function to manually populate modal with real book data
    async testModalWithRealData() {
        try {
            const response = await api.getBook(28); // Use book ID 28
            console.log('Testing modal with real API data:', response);
            const book = response.book || response;
            this.showBookModal(book);
        } catch (error) {
            console.error('Test modal failed:', error);
        }
    }

    // ========================================
    // ADD TO BooksManager CLASS
    // ========================================

    // Track book view when opening detail modal
    async viewBookDetails(bookId) {
        try {
            // Track the view
            if (authManager.isAuthenticated) {
                await api.trackBookView(bookId);
                // Refresh recently viewed list
                await this.loadRecentlyViewed();
            }

            // Load book details
            const response = await api.getBook(bookId);
            const book = response.book;

            // Load similar books for recommendations
            const similarResponse = await api.getSimilarBooks(bookId);
            const similarBooks = similarResponse.recommendations || [];

            // Show detail modal with book info
            this.showBookDetailModal(book, similarBooks);
        } catch (error) {
            console.error('Failed to load book details:', error);
            showToast('Failed to load book details', 'error');
        }
    }

    async loadRecentlyViewed() {
        if (!authManager || !authManager.isAuthenticated) return;

        try {
            const response = await api.getRecentlyViewed(10);
            this.recentlyViewed = response.books || [];
            this.renderRecentlyViewed();
        } catch (error) {
            console.error('Failed to load recently viewed:', error);
        }
    }

    renderRecentlyViewed() {
        const container = document.getElementById('recently-viewed-books');
        const section = document.getElementById('recently-viewed-section');
        if (!container) return;

        const items = Array.isArray(this.recentlyViewed) ? this.recentlyViewed : [];
        if (items.length === 0) {
            container.innerHTML = '<p class="empty-state">No recently viewed books</p>';
            if (section) section.style.display = 'none';
            return;
        }

        // Ensure section is visible when we have items
        if (section) section.style.display = '';

        container.innerHTML = items.map(book => `
    <div class="book-card-mini" data-book-id="${book.id}">
      <div class="book-mini-image">
        <img src="${book.image_url || book.cover_image || '/images/default-book.png'}" 
             alt="${escapeHtml(book.title)}" 
             onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
        <i class="fas fa-book fallback-icon" style="display: none;"></i>
      </div>
      <div class="book-mini-info">
        <h5>${escapeHtml(book.title)}</h5>
        <p>${escapeHtml(book.author || 'Unknown Author')}</p>
        <small>${this.formatTimeAgo(book.viewed_at)}</small>
      </div>
    </div>
  `).join('');

        // Add click handlers
        container.querySelectorAll('.book-card-mini').forEach(card => {
            card.addEventListener('click', () => {
                const bookId = card.dataset.bookId;
                this.viewBookDetails(bookId);
            });
        });
    }

    showBookDetailModal(book, similarBooks = []) {
        // Your existing book detail modal code here
        // Add a section at the bottom for similar books:

        const modalContent = `
    <!-- Your existing book detail HTML -->

    ${similarBooks.length > 0 ? `
      <div class="similar-books-section">
        <h3>Similar Books You Might Like</h3>
        <div class="similar-books-grid">
          ${similarBooks.map(b => this.createBookCard(b)).join('')}
        </div>
      </div>
    ` : ''}
  `;

        // Show the modal (your existing code)
    }

    formatTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    }

}

// Global test function for debugging
window.testBookModal = async function () {
    console.log('Testing book modal...');
    try {
        const response = await fetch('/api/books/28');
        const data = await response.json();
        console.log('API response:', data);

        const book = data.book;
        console.log('Book data:', book);

        // Test modal population directly
        if (window.booksManager) {
            window.booksManager.showBookModal(book);
        } else {
            console.error('booksManager not found!');
        }
    } catch (error) {
        console.error('Test failed:', error);
    }
};

// Simple test to populate modal with hardcoded data
window.testModalSimple = function () {
    try {
        console.log('=== TEST MODAL SIMPLE START ===');
        console.log('Testing modal with simple data...');

        // First check if modal exists at all
        const testModal = document.getElementById('book-details-modal');
        console.log('Modal element found:', testModal);
        console.log('Modal exists:', !!testModal);

        if (testModal) {
            console.log('Modal HTML length:', testModal.outerHTML?.length);
            console.log('Modal HTML preview:', testModal.outerHTML?.substring(0, 200) + '...');
        } else {
            console.log('Modal element NOT found in DOM');
        }
    } catch (error) {
        console.error('Error in testModalSimple:', error);
    }

    // Test if modal elements exist
    const titleElement = document.getElementById('modal-book-title');
    const titleTextElement = document.getElementById('modal-book-title-text');
    const authorElement = document.getElementById('modal-book-author');

    console.log('Title element:', titleElement);
    console.log('Title text element:', titleTextElement);
    console.log('Author element:', authorElement);

    if (titleElement) {
        titleElement.textContent = 'TEST BOOK TITLE';
        console.log('Set title to TEST BOOK TITLE');
    }

    if (titleTextElement) {
        titleTextElement.textContent = 'TEST BOOK TITLE';
        console.log('Set title text to TEST BOOK TITLE');
    }

    if (authorElement) {
        authorElement.textContent = 'TEST AUTHOR';
        console.log('Set author to TEST AUTHOR');
    }

    // Show modal
    const showModal = document.getElementById('book-details-modal');
    if (showModal) {
        // Force visibility with inline styles
        showModal.style.display = 'flex';
        showModal.style.visibility = 'visible';
        showModal.style.opacity = '1';
        showModal.style.zIndex = '9999';
        showModal.classList.add('active');
        document.body.style.overflow = 'hidden';

        console.log('Modal forced visible with inline styles');
        console.log('Modal computed styles:', {
            display: getComputedStyle(showModal).display,
            visibility: getComputedStyle(showModal).visibility,
            opacity: getComputedStyle(showModal).opacity,
            zIndex: getComputedStyle(showModal).zIndex
        });
    } else {
        console.error('Modal element not found!');
        console.log('Creating a simple test modal...');

        // Create a simple test modal
        const newTestModal = document.createElement('div');
        newTestModal.id = 'test-modal';
        newTestModal.innerHTML = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center;">
                <div style="background: white; padding: 20px; border-radius: 8px; max-width: 500px; width: 90%;">
                    <h3>Test Modal</h3>
                    <p>This is a test modal to verify modal functionality works.</p>
                    <button onclick="document.getElementById('test-modal').remove()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(newTestModal);
        console.log('Test modal created and added to DOM');
    }
};

// Create global books manager instance
const booksManager = new BooksManager();
window.booksManager = booksManager;

// Initialize books page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    booksManager.setupEventListeners();
});
