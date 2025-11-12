// Book Management System for LiBrowse
// Handles book posting, editing, deletion, and management

class BookManagement {
    constructor() {
        this.currentEditingBook = null;
        this.imagePreview = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Add book button
        const addBookBtn = document.getElementById('add-book-btn');
        if (addBookBtn) {
            addBookBtn.addEventListener('click', async () => {
                // Check if user is verified before allowing book addition
                if (await this.isUserVerified()) {
                    this.showAddBookModal();
                } else {
                    this.showVerificationRequiredModal();
                }
            });
        }


        // Profile tab - My Books
        const booksTab = document.querySelector('[data-tab="books"]');
        if (booksTab) {
            console.log('✅ Books tab found, attaching listener');
            booksTab.addEventListener('click', () => {
                console.log('🔘 Books tab clicked');
                this.loadMyBooks();
            });
        } else {
            console.warn('⚠️ Books tab not found in DOM');
        }

        // Also listen for tab changes via custom event or hash
        document.addEventListener('profile-tab-changed', (e) => {
            if (e.detail && e.detail.tab === 'books') {
                console.log('📢 Profile tab changed to books via event');
                this.loadMyBooks();
            }
        });

        // Ensure image preview works for both static and dynamic modals
        document.addEventListener('change', (e) => {
            const t = e.target;
            if (!t) return;
            if (t.id === 'book-image' || t.id === 'book-image-input') {
                this.handleImagePreview(e);
            }
        });
    }

    // Check if current user is verified (fetches fresh data from server)
    async isUserVerified() {
        if (!authManager || !authManager.currentUser) {
            console.log('❌ No authManager or currentUser');
            return false;
        }

        // Fetch fresh verification status from server
        try {
            const response = await fetch('/api/users/profile', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('🔍 Profile API Response:', data);

                if (data.user) {
                    // Update authManager with fresh data
                    authManager.currentUser = data.user;
                    localStorage.setItem('user', JSON.stringify(data.user));

                    const verificationStatus = data.user.verification_status ||
                        data.user.verificationstatus;

                    console.log('✅ Verification status from profile:', verificationStatus);
                    return verificationStatus === 'verified';
                }
            } else {
                console.log('❌ Profile API failed:', response.status);
            }
        } catch (err) {
            console.warn('Could not fetch fresh user data, using cached:', err);
        }

        // Fallback to cached data if fetch fails
        const verificationStatus = authManager.currentUser.verification_status ||
            authManager.currentUser.verificationstatus;

        console.log('📦 Using cached verification status:', verificationStatus);
        return verificationStatus === 'verified';
    }



    // Show verification required modal (reuse from booksManager or create new)
    showVerificationRequiredModal() {
        // Check if modal already exists
        let modal = document.getElementById('verification-required-modal');

        // Create modal if it doesn't exist
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'verification-required-modal';
            modal.className = 'modal';
            modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>
                        <i class="fas fa-shield-alt" style="color: var(--warning);"></i>
                        Account Verification Required
                    </h2>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 16px;">
                        To add books to LiBrowse, you need to verify your account first.
                    </p>
                    <p style="margin-bottom: 16px;">
                        <strong>Why verify?</strong>
                    </p>
                    <ul style="margin-left: 20px; margin-bottom: 16px;">
                        <li>Ensures account security</li>
                        <li>Builds trust in the community</li>
                        <li>Unlocks book listing features</li>
                    </ul>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="document.getElementById('verification-required-modal').classList.remove('active'); document.body.style.overflow = '';">
                        Cancel
                    </button>
                    <button class="btn btn-primary" id="go-to-verification-btn-bookmanagement">
                        <i class="fas fa-check-circle"></i>
                        Verify Account
                    </button>
                </div>
            </div>
        `;
            document.body.appendChild(modal);

            // Add click handler for verify button
            const verifyBtn = modal.querySelector('#go-to-verification-btn-bookmanagement');
            verifyBtn.addEventListener('click', () => {
                // Close all open modals
                document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
                document.body.style.overflow = '';

                // Navigate to profile verification tab
                if (window.app) {
                    window.app.navigateToSection('profile');
                }

                // Switch to verification tab after a small delay
                setTimeout(() => {
                    const verificationTab = document.querySelector('[data-tab="verification"]');
                    if (verificationTab) {
                        verificationTab.click();
                    }
                }, 100);
            });

            // Close modal on background click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        }

        // Show modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }


    showAddBookModal() {
        // Remove any existing add-book-modal first
        const existingModal = document.getElementById('add-book-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = this.createBookFormModal();
        document.body.appendChild(modal);
        modal.classList.add('active');
    }

    createBookFormModal(book = null) {
        const isEdit = book !== null;
        const modalId = isEdit ? 'edit-book-modal' : 'add-book-modal';

        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content book-form-modal">
                <div class="modal-header">
                    <h3>${isEdit ? 'Edit Book' : 'Add New Book'}</h3>
                    <button class="modal-close" onclick="bookManagement.closeModal('${modalId}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="${isEdit ? 'edit-book-form' : 'add-book-form'}" class="book-form" novalidate>
                        <!-- Image Upload Section -->
                        <div class="form-section">
                            <h4>Book Cover Image</h4>
                            <div class="image-upload-container">
                                <div class="image-preview" id="book-image-preview">
                                    ${book?.image_url ? `<img src="${book.image_url}" alt="Book cover">` : `
                                    <div class="image-placeholder">
                                        <i class="fas fa-book fa-3x"></i>
                                        <p>Click to upload book cover</p>
                                        <small>Max size: 5MB (JPG, PNG, GIF, WebP)</small>
                                    </div>`}
                                </div>
                                <input type="file" id="book-image-input" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" style="display: none;">
                                <div class="upload-button-group">
                                    <button type="button" class="btn btn-outline" id="upload-image-btn" onclick="document.getElementById('book-image-input').click()">
                                        <i class="fas fa-upload"></i>
                                        ${book?.image_url ? 'Change Image' : 'Upload Image'}
                                    </button>
                                    ${book?.image_url ? `<button type="button" class="btn btn-ghost" onclick="bookManagement.removeImage()">
                                        <i class="fas fa-trash"></i>
                                        Remove Image
                                    </button>` : ''}
                                </div>
                                <div id="selected-file-name" style="margin-top: 8px; font-size: 0.85rem; color: rgba(255,255,255,0.6); text-align: center;"></div>
                            </div>
                        </div>

                        <!-- Basic Information -->
                        <div class="form-section">
                            <h4>Basic Information</h4>
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="book-title">Title <span class="required">*</span></label>
                                    <input type="text" id="book-title" name="title" value="${book?.title || ''}" required placeholder="Enter book title">
                                    <small class="error-message" id="title-error"></small>
                                </div>
                                <div class="form-group">
                                    <label for="book-author">Author <span class="required">*</span></label>
                                    <input type="text" id="book-author" name="author" value="${book?.author || ''}" required placeholder="Enter author name">
                                    <small class="error-message" id="author-error"></small>
                                </div>
                            </div>

                            <div class="form-row">
                                <div class="form-group">
                                    <label for="book-isbn">ISBN</label>
                                    <input type="text" id="book-isbn" name="isbn" value="${book?.isbn || ''}" placeholder="Enter ISBN (optional)">
                                </div>
                                <div class="form-group">
                                    <label for="book-edition">Edition</label>
                                    <input type="text" id="book-edition" name="edition" value="${book?.edition || ''}" placeholder="e.g., 3rd Edition">
                                </div>
                            </div>

                            <div class="form-row">
                                <div class="form-group">
                                    <label for="book-publisher">Publisher</label>
                                    <input type="text" id="book-publisher" name="publisher" value="${book?.publisher || ''}" placeholder="Enter publisher name">
                                </div>
                                <div class="form-group">
                                    <label for="book-year">Publication Year</label>
                                    <input type="number" id="book-year" name="publication_year" value="${book?.publication_year || ''}" min="1900" max="${new Date().getFullYear()}" placeholder="e.g., 2023">
                                </div>
                            </div>
                        </div>

                        <!-- Course Information -->
                        <div class="form-section">
                            <h4>Course Information</h4>
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="book-course-code">Course Code <span class="required">*</span></label>
                                    <input type="text" id="book-course-code" name="course_code" value="${book?.course_code || ''}" required placeholder="e.g., CS101">
                                    <small class="error-message" id="course-code-error"></small>
                                </div>
                                <div class="form-group">
                                    <label for="book-subject">Subject/Category</label>
                                    <select id="book-subject" name="subject">
                                        <option value="General" ${!book?.subject || book?.subject === 'General' ? 'selected' : ''}>General</option>
                                        <option value="Computer Science" ${book?.subject === 'Computer Science' ? 'selected' : ''}>Computer Science</option>
                                        <option value="Mathematics" ${book?.subject === 'Mathematics' ? 'selected' : ''}>Mathematics</option>
                                        <option value="Science" ${book?.subject === 'Science' ? 'selected' : ''}>Science</option>
                                        <option value="Engineering" ${book?.subject === 'Engineering' ? 'selected' : ''}>Engineering</option>
                                        <option value="Business" ${book?.subject === 'Business' ? 'selected' : ''}>Business</option>
                                        <option value="Education" ${book?.subject === 'Education' ? 'selected' : ''}>Education</option>
                                        <option value="Literature" ${book?.subject === 'Literature' ? 'selected' : ''}>Literature</option>
                                        <option value="Social Sciences" ${book?.subject === 'Social Sciences' ? 'selected' : ''}>Social Sciences</option>
                                        <option value="Other" ${book?.subject === 'Other' ? 'selected' : ''}>Other</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- Condition & Credits -->
                        <div class="form-section">
                            <h4>Condition & Credits</h4>
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="book-condition">Condition <span class="required">*</span></label>
                                    <select id="book-condition" name="condition" required>
                                        <option value="excellent" ${book?.condition_rating === 'excellent' ? 'selected' : ''}>Excellent - Like new, no marks</option>
                                        <option value="good" ${book?.condition_rating === 'good' ? 'selected' : ''}>Good - Minor wear, readable</option>
                                        <option value="fair" ${book?.condition_rating === 'fair' ? 'selected' : ''}>Fair - Visible wear, all pages intact</option>
                                        <option value="poor" ${book?.condition_rating === 'poor' ? 'selected' : ''}>Poor - Heavy wear, may have damage</option>
                                    </select>
                                    <small class="error-message" id="condition-error"></small>
                                </div>
                                <div class="form-group">
                                    <label for="book-credits">Minimum Credits Required <span class="required">*</span></label>
                                    <input type="number" id="book-credits" name="minimum_credits" value="${book?.minimum_credits || 100}" min="50" max="500" required>
                                    <small class="form-hint">Credits required to borrow (50-500)</small>
                                    <small class="error-message" id="credits-error"></small>
                                </div>
                            </div>
                        </div>

                        <!-- Description -->
                        <div class="form-section">
                            <h4>Description</h4>
                            <div class="form-group">
                                <label for="book-description">Book Description</label>
                                <textarea id="book-description" name="description" rows="4" placeholder="Add any additional details about the book, its contents, or special notes...">${book?.description || ''}</textarea>
                            </div>
                        </div>

                        <!-- Form Actions -->
                        <div class="form-actions">
                            <button type="button" class="btn btn-outline" onclick="bookManagement.closeModal('${modalId}')">
                                Cancel
                            </button>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-${isEdit ? 'save' : 'plus'}"></i>
                                ${isEdit ? 'Update Book' : 'Add Book'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Setup form submission
        const form = modal.querySelector('form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (isEdit) {
                this.updateBook(book.id);
            } else {
                this.addBook();
            }
        });

        // Setup image preview
        const imageInput = modal.querySelector('#book-image-input');
        imageInput.addEventListener('change', (e) => this.handleImagePreview(e));

        // Make preview clickable
        const imagePreview = modal.querySelector('#book-image-preview');
        imagePreview.addEventListener('click', () => imageInput.click());

        return modal;
    }

    handleImagePreview(event) {
        const file = event.target.files[0];
        if (!file) return;

        console.log('📸 Image selected:', file.name, file.type, file.size);

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            showToast('Image size must be less than 5MB', 'error');
            event.target.value = '';
            return;
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            showToast('Only JPG, PNG, GIF, and WebP images are allowed', 'error');
            event.target.value = '';
            return;
        }

        // Find preview element next to the input (prefer class-based to avoid duplicate IDs)
        let preview;
        const containerEl = event.target.closest('.image-upload-container');
        if (containerEl) {
            preview = containerEl.querySelector('.image-preview, .file-preview');
        }

        // Fallback to modal scope
        if (!preview) {
            const modalEl = event.target.closest('.modal');
            if (modalEl) {
                preview = modalEl.querySelector('#book-image-preview');
            }
        }

        // Final fallback (in case of duplicate IDs elsewhere)
        if (!preview) {
            preview = document.getElementById('book-image-preview');
        }

        if (!preview) {
            console.error('❌ Preview element not found!');
            showToast('Preview element not found', 'error');
            return;
        }

        console.log('✅ Preview element found:', preview);

        // If using .file-preview pattern from global styles, make it visible
        if (preview.classList && preview.classList.contains('file-preview')) {
            preview.classList.add('active');
        }
        // Force visibility in case other CSS keeps it hidden
        preview.style.removeProperty('display');
        preview.style.display = 'block';
        preview.style.visibility = 'visible';
        console.log('👁️ Preview classes:', preview.className);

        // Show loading state
        preview.innerHTML = `
            <div class="image-placeholder" style="opacity: 0.7;">
                <i class="fas fa-spinner fa-spin fa-2x"></i>
                <p>Loading preview...</p>
            </div>
        `;

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            console.log('✅ FileReader loaded successfully');

            // Create image element to ensure it loads
            const img = new Image();
            img.onload = () => {
                console.log('✅ Image element loaded successfully');
                console.log('📐 Image dimensions:', img.width, 'x', img.height);

                // Update preview with image
                preview.innerHTML = `
                    <img src="${e.target.result}" alt="Book cover preview">
                    <div class="image-preview-overlay">
                        <i class="fas fa-check-circle" style="color: #10B981; font-size: 24px;"></i>
                    </div>
                `;
                this.imagePreview = file;

                // Detailed debugging
                console.log('📸 Preview HTML updated');
                console.log('📸 Preview element:', preview);
                console.log('📸 Preview innerHTML:', preview.innerHTML);

                const imgElement = preview.querySelector('img');
                console.log('📸 Image element found:', imgElement);
                if (imgElement) {
                    console.log('📸 Image src length:', imgElement.src.length);
                    console.log('📸 Image computed style:', window.getComputedStyle(imgElement).display);
                    console.log('📸 Image dimensions:', imgElement.offsetWidth, 'x', imgElement.offsetHeight);
                }

                console.log('📸 Preview computed style:', window.getComputedStyle(preview).display);
                console.log('📸 Preview dimensions:', preview.offsetWidth, 'x', preview.offsetHeight);
            };

            img.onerror = () => {
                console.error('❌ Failed to load image element');
                showToast('Failed to load image preview', 'error');
                preview.innerHTML = `
                    <div class="image-placeholder">
                        <i class="fas fa-exclamation-triangle fa-2x"></i>
                        <p>Failed to load image</p>
                        <small>Please try another file</small>
                    </div>
                `;
            };

            img.src = e.target.result;

            // Update file name display - try multiple methods
            let fileNameDisplay = document.getElementById('selected-file-name');
            if (!fileNameDisplay) {
                const activeModal = document.querySelector('.modal.active');
                if (activeModal) {
                    fileNameDisplay = activeModal.querySelector('#selected-file-name');
                }
            }

            if (fileNameDisplay) {
                const fileSize = (file.size / 1024).toFixed(1);
                fileNameDisplay.innerHTML = `<i class="fas fa-check-circle" style="color: #10B981;"></i> ${file.name} (${fileSize} KB)`;
                fileNameDisplay.style.color = '#10B981';
                console.log('✅ File name display updated');
            } else {
                console.warn('⚠️ File name display element not found');
            }

            // Show success feedback
            const fileSize = (file.size / 1024).toFixed(1);
            showToast(`✓ Image selected: ${file.name} (${fileSize} KB)`, 'success');
        };

        reader.onerror = () => {
            showToast('Failed to load image preview', 'error');
            preview.innerHTML = `
                <div class="image-placeholder">
                    <i class="fas fa-book fa-3x"></i>
                    <p>Click to upload book cover</p>
                    <small>Max size: 5MB (JPG, PNG, GIF, WebP)</small>
                </div>
            `;
        };

        reader.readAsDataURL(file);
    }

    removeImage() {
        const activeModal = document.querySelector('.modal.active');
        const preview = activeModal ? activeModal.querySelector('#book-image-preview') : document.getElementById('book-image-preview');
        if (!preview) return;
        preview.innerHTML = `
            <div class="image-placeholder">
                <i class="fas fa-book fa-3x"></i>
                <p>Click to upload book cover</p>
                <small>Max size: 5MB (JPG, PNG, GIF, WebP)</small>
            </div>
        `;
        const imageInput = activeModal ? activeModal.querySelector('#book-image') : document.getElementById('book-image');

        if (imageInput) imageInput.value = '';
        this.imagePreview = null;

        // Clear file name display
        const fileNameDisplay = activeModal ? activeModal.querySelector('#selected-file-name') : document.getElementById('selected-file-name');
        if (fileNameDisplay) {
            fileNameDisplay.innerHTML = '';
        }
        // Hide the file-preview container if that pattern is used
        if (preview.classList && preview.classList.contains('file-preview')) {
            preview.classList.remove('active');
        }

        showToast('Image removed', 'info');
    }

    clearFormErrors() {
        const activeModal = document.querySelector('.modal.active');
        const ids = ['title-error', 'author-error', 'course-code-error', 'condition-error', 'credits-error'];
        ids.forEach(id => {
            const el = activeModal ? activeModal.querySelector('#' + id) : document.getElementById(id);
            if (el) el.textContent = '';
        });
    }

    displayValidationErrors(details) {
        if (!Array.isArray(details)) return;
        const activeModal = document.querySelector('.modal.active');
        const map = {
            title: { errorId: 'title-error', fieldSel: '#book-title' },
            author: { errorId: 'author-error', fieldSel: '#book-author' },
            course_code: { errorId: 'course-code-error', fieldSel: '#book-course-code' },
            condition: { errorId: 'condition-error', fieldSel: '#book-condition' },
            minimum_credits: { errorId: 'credits-error', fieldSel: '#book-credits' }
        };
        let firstField = null;
        details.forEach(err => {
            const cfg = map[err.param];
            if (!cfg) return;
            const errEl = activeModal ? activeModal.querySelector('#' + cfg.errorId) : document.getElementById(cfg.errorId);
            if (errEl) errEl.textContent = err.msg;
            if (!firstField) {
                const field = activeModal ? activeModal.querySelector(cfg.fieldSel) : document.querySelector(cfg.fieldSel);
                if (field) firstField = field;
            }
        });
        if (firstField && typeof firstField.focus === 'function') {
            firstField.focus();
        }
    }

    async addBook() {
        const activeModal = document.querySelector('.modal.active');
        const submitBtn = activeModal ? activeModal.querySelector('#add-book-form button[type="submit"]') : document.querySelector('#add-book-form button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';

        try {
            // Show loading state
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
            }

            const form = activeModal ? activeModal.querySelector('#add-book-form') : document.getElementById('add-book-form');
            this.clearFormErrors();

            // Build FormData manually
            const formData = new FormData();

            const titleInput = activeModal ? activeModal.querySelector('#book-title') : document.getElementById('book-title');
            console.log('Submitting book. Title field value:', titleInput ? titleInput.value : '(not found)');

            // ADD FIELDS FIRST, THEN TRIM
            const authorInput = activeModal ? activeModal.querySelector('#book-author') : document.getElementById('book-author');
            const courseInput = activeModal ? activeModal.querySelector('#book-course-code') : document.getElementById('book-course-code');
            const conditionSelect = activeModal ? activeModal.querySelector('#book-condition') : document.getElementById('book-condition');
            const creditsInput = activeModal ? activeModal.querySelector('#book-minimum-credits') : document.getElementById('book-minimum-credits');

            // Add and trim fields
            if (titleInput) formData.set('title', titleInput.value.trim());
            if (authorInput) formData.set('author', authorInput.value.trim());
            if (courseInput) formData.set('course_code', courseInput.value.trim());
            if (conditionSelect) formData.set('condition', (conditionSelect.value || '').trim());

            // Handle minimum credits with validation
            let mc = parseInt(creditsInput ? creditsInput.value : '100', 10);
            if (Number.isNaN(mc)) mc = 100;
            if (mc < 50) mc = 50;
            if (mc > 500) mc = 500;
            formData.set('minimum_credits', String(mc));

            // Debug outgoing FormData (excluding image)
            try {
                const preview = [];
                for (const [k, v] of formData.entries()) {
                    if (k === 'image') continue;
                    preview.push([k, typeof v === 'string' ? v : '[File]']);
                }
                console.log('FormData preview:', preview);
            } catch (e) { /* ignore */ }

            // Ensure user is authenticated
            const token = localStorage.getItem('token');
            if (!token) {
                showToast('Please login to add a book', 'error');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
                return;
            }

            // Add image if selected
            // Add image validation
            const imageInput = activeModal ? activeModal.querySelector('#book-image') : document.getElementById('book-image');


            // Validate image size BEFORE uploading
            if (imageInput && imageInput.files[0]) {
                const file = imageInput.files[0];
                const maxSize = 8 * 1024 * 1024; // 8MB

                // Check file size
                if (file.size > maxSize) {
                    const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
                    showToast(`❌ Image too large! Please use an image under 8MB (current: ${fileSizeMB}MB)`, 'error');
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalBtnText;
                    }
                    return;
                }

                // Check file type - ONLY JPEG and PNG
                const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
                if (!allowedTypes.includes(file.type)) {
                    showToast('❌ Invalid file type! Please upload a JPEG or PNG image only.', 'error');
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalBtnText;
                    }
                    return;
                }

                formData.append('image', file);
                showToast('Uploading book with cover image...', 'info');
            } else {
                showToast('Uploading book...', 'info');
            }


            const response = await fetch('/api/books', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                if (data && Array.isArray(data.details)) {
                    this.displayValidationErrors(data.details);
                }
                const firstDetailMsg = Array.isArray(data?.details) && data.details.length ? data.details[0].msg : null;
                throw new Error(firstDetailMsg || data.error || 'Failed to add book');
            }

            console.log('✅ Book added successfully, closing modal and refreshing lists...');

            // Reset form
            if (form && typeof form.reset === 'function') {
                form.reset();
            }

            // Show success message BEFORE closing modal so user sees it
            showToast('✓ Book added successfully!', 'success');

            // Close modal with slight delay to ensure toast is visible
            setTimeout(() => {
                this.closeModal('add-book-modal');
            }, 100);

            // Refresh books list if on books section
            if (window.location.hash === '#books') {
                console.log('Refreshing books section...');
                if (typeof booksManager !== 'undefined' && booksManager.loadBooks) {
                    booksManager.loadBooks();
                }
            }

            // Refresh my books if on profile
            console.log('Refreshing my books...');
            this.loadMyBooks();

        } catch (error) {
            console.error('Add book error:', error);
            showToast(error.message || 'Failed to add book', 'error');

            // Restore button state
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        }
    }


    async updateBook(bookId) {
        const activeModal = document.querySelector('.modal.active');
        const submitBtn = activeModal ? activeModal.querySelector('#edit-book-form button[type="submit"]') : document.querySelector('#edit-book-form button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';

        try {
            // Show loading state
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
            }

            const form = activeModal ? activeModal.querySelector('#edit-book-form') : document.getElementById('edit-book-form');
            this.clearFormErrors();

            // Get form data as JSON (not FormData since we're not uploading image here)
            const titleInput = activeModal ? activeModal.querySelector('#book-title') : document.getElementById('book-title');
            const authorInput = activeModal ? activeModal.querySelector('#book-author') : document.getElementById('book-author');
            const isbnInput = activeModal ? activeModal.querySelector('#book-isbn') : document.getElementById('book-isbn');
            const editionInput = activeModal ? activeModal.querySelector('#book-edition') : document.getElementById('book-edition');
            const courseInput = activeModal ? activeModal.querySelector('#book-course-code') : document.getElementById('book-course-code');
            const subjectSelect = activeModal ? activeModal.querySelector('#book-subject') : document.getElementById('book-subject');
            const conditionSelect = activeModal ? activeModal.querySelector('#book-condition') : document.getElementById('book-condition');
            const creditsInput = activeModal ? activeModal.querySelector('#book-credits') : document.getElementById('book-credits');
            const descriptionInput = activeModal ? activeModal.querySelector('#book-description') : document.getElementById('book-description');
            const publisherInput = activeModal ? activeModal.querySelector('#book-publisher') : document.getElementById('book-publisher');
            const yearInput = activeModal ? activeModal.querySelector('#book-year') : document.getElementById('book-year');

            const bookData = {
                title: titleInput ? titleInput.value.trim() : '',
                author: authorInput ? authorInput.value.trim() : '',
                isbn: isbnInput ? isbnInput.value.trim() : '',
                edition: editionInput ? editionInput.value.trim() : '',
                course_code: courseInput ? courseInput.value.trim() : '',
                subject: subjectSelect ? subjectSelect.value : 'General',
                condition: conditionSelect ? conditionSelect.value : 'good',
                minimum_credits: creditsInput ? parseInt(creditsInput.value, 10) : 100,
                description: descriptionInput ? descriptionInput.value.trim() : '',
                publisher: publisherInput ? publisherInput.value.trim() : '',
                publication_year: yearInput ? yearInput.value : null
            };

            // Clamp minimum_credits
            if (isNaN(bookData.minimum_credits)) bookData.minimum_credits = 100;
            if (bookData.minimum_credits < 50) bookData.minimum_credits = 50;
            if (bookData.minimum_credits > 500) bookData.minimum_credits = 500;

            console.log('Updating book:', bookId, bookData);

            const token = localStorage.getItem('token');
            if (!token) {
                showToast('Please login to update book', 'error');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
                return;
            }

            const response = await fetch(`/api/books/${bookId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bookData)
            });

            const data = await response.json();

            if (!response.ok) {
                if (data && Array.isArray(data.details)) {
                    this.displayValidationErrors(data.details);
                }
                const firstDetailMsg = Array.isArray(data?.details) && data.details.length ? data.details[0].msg : null;
                throw new Error(firstDetailMsg || data.error || 'Failed to update book');
            }

            console.log('✅ Book updated successfully');

            // Handle image upload separately if changed
            const imageInput = activeModal ? activeModal.querySelector('#book-image') : document.getElementById('book-image');

            if (imageInput && imageInput.files && imageInput.files[0]) {
                console.log('Uploading new image...');
                await this.uploadBookImage(bookId, imageInput.files[0]);
            }

            // Show success message
            showToast('✓ Book updated successfully!', 'success');

            // Close modal with slight delay
            setTimeout(() => {
                this.closeModal('edit-book-modal');
            }, 100);

            // Refresh books list
            if (window.location.hash === '#books') {
                if (typeof booksManager !== 'undefined' && booksManager.loadBooks) {
                    booksManager.loadBooks();
                }
            }

            // Refresh my books
            this.loadMyBooks();

        } catch (error) {
            console.error('Update book error:', error);
            showToast(error.message || 'Failed to update book', 'error');

            // Restore button state
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        }
    }

    async uploadBookImage(bookId, imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);

        const response = await fetch(`/api/books/${bookId}/image`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to upload image');
        }
    }

    async loadMyBooks() {
        console.log('📚 Loading my books...');
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                console.warn('No token found, user not logged in');
                showToast('Please login to view your books', 'error');
                return;
            }

            const response = await fetch('/api/books/my-books', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log('Response status:', response.status);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Failed to load books:', errorData);
                throw new Error(errorData.error || 'Failed to load books');
            }

            const data = await response.json();
            console.log('Books loaded:', data.books ? data.books.length : 0, 'books');
            this.renderMyBooks(data.books || []);

        } catch (error) {
            console.error('Load my books error:', error);
            showToast(error.message || 'Failed to load your books', 'error');
        }
    }

    renderMyBooks(books) {
        console.log('📖 Rendering my books:', books);
        const container = document.getElementById('books-content');
        if (!container) {
            console.error('❌ books-content container not found!');
            return;
        }
        console.log('✅ Container found:', container);

        if (books.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book fa-3x"></i>
                    <h3>No Books Yet</h3>
                    <p>Start by adding your first book to share with others!</p>
                    <button class="btn btn-primary" onclick="bookManagement.showAddBookModal()">
                        <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img">
                            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
                        </svg>
                        Add Your First Book
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="my-books-header">
                <h3>My Books (${books.length})</h3>
                <button class="btn btn-primary" onclick="bookManagement.showAddBookModal()">
                    <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img">
                        <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
                    </svg>
                    Add Book
                </button>
            </div>
            <div class="my-books-grid">
                ${books.map(book => this.createMyBookCard(book)).join('')}
            </div>
        `;
    }

    createMyBookCard(book) {
        const imageUrl = book.image_url || this.getPlaceholderImage(book.title);
        const statusClass = book.is_available ? 'available' : 'unavailable';
        const statusText = book.is_available ? 'Available' : 'Unavailable';

        return `
            <div class="my-book-card" data-book-id="${book.id}">
                <div class="book-card-image">
                    <img src="${imageUrl}" alt="${this.escapeHtml(book.title)}" onerror="this.src='${this.getPlaceholderImage(book.title)}'">
                    <div class="book-card-overlay">
                        <button class="btn-icon" onclick="bookManagement.editBook(${book.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon" onclick="bookManagement.deleteBook(${book.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="book-card-content">
                    <h4 class="book-card-title">${this.escapeHtml(book.title)}</h4>
                    <p class="book-card-author">${this.escapeHtml(book.author)}</p>
                    <div class="book-card-meta">
                        <span class="book-card-course">${this.escapeHtml(book.course_code)}</span>
                        <span class="book-card-condition ${book.condition_rating}">${this.formatCondition(book.condition_rating)}</span>
                    </div>
                    <div class="book-card-footer">
                        <div class="book-card-credits">
                            <i class="fas fa-coins"></i>
                            <span>${book.minimum_credits} credits</span>
                        </div>
                        <div class="book-card-status">
                            <label class="toggle-switch" title="Toggle availability">
                                <input type="checkbox" ${book.is_available ? 'checked' : ''} 
                                    onchange="bookManagement.toggleAvailability(${book.id}, this.checked)">
                                <span class="toggle-slider"></span>
                            </label>
                            <span class="status-text ${statusClass}">${statusText}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async editBook(bookId) {
        try {
            // Remove any existing edit-book-modal first
            const existingModal = document.getElementById('edit-book-modal');
            if (existingModal) {
                existingModal.remove();
            }

            const response = await fetch(`/api/books/${bookId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load book details');
            }

            const data = await response.json();
            const modal = this.createBookFormModal(data.book);
            document.body.appendChild(modal);
            modal.classList.add('active');

        } catch (error) {
            console.error('Edit book error:', error);
            showToast('Failed to load book details', 'error');
        }
    }

    async deleteBook(bookId) {
        if (!confirm('Are you sure you want to delete this book? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`/api/books/${bookId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to delete book');
            }

            showToast('Book deleted successfully', 'success');
            this.loadMyBooks();

        } catch (error) {
            console.error('Delete book error:', error);
            showToast(error.message || 'Failed to delete book', 'error');
        }
    }

    async toggleAvailability(bookId, isAvailable) {
        try {
            const response = await fetch(`/api/books/${bookId}/availability`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ is_available: isAvailable })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update availability');
            }

            showToast(`Book marked as ${isAvailable ? 'available' : 'unavailable'}`, 'success');

        } catch (error) {
            console.error('Toggle availability error:', error);
            showToast(error.message || 'Failed to update availability', 'error');
            // Revert toggle on error
            this.loadMyBooks();
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }
        this.imagePreview = null;
    }

    formatCondition(condition) {
        const conditions = {
            'excellent': 'Excellent',
            'good': 'Good',
            'fair': 'Fair',
            'poor': 'Poor'
        };
        return conditions[condition] || condition;
    }

    getPlaceholderImage(title) {
        const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#fa709a'];
        const color = colors[title.length % colors.length];
        const initial = title.charAt(0).toUpperCase();
        return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='${encodeURIComponent(color)}'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial, sans-serif' font-size='80' fill='white'%3E${initial}%3C/text%3E%3C/svg%3E`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize book management
const bookManagement = new BookManagement();
