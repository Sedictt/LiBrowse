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
            addBookBtn.addEventListener('click', () => this.showAddBookModal());
        }

        // Profile tab - My Books
        const booksTab = document.querySelector('[data-tab="books"]');
        if (booksTab) {
            booksTab.addEventListener('click', () => this.loadMyBooks());
        }
    }

    showAddBookModal() {
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
                    <form id="${isEdit ? 'edit-book-form' : 'add-book-form'}" class="book-form">
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
                                <button type="button" class="btn btn-outline" onclick="document.getElementById('book-image-input').click()">
                                    <i class="fas fa-upload"></i>
                                    ${book?.image_url ? 'Change Image' : 'Upload Image'}
                                </button>
                                ${book?.image_url ? `<button type="button" class="btn btn-ghost" onclick="bookManagement.removeImage()">
                                    <i class="fas fa-trash"></i>
                                    Remove Image
                                </button>` : ''}
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

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('book-image-preview');
            preview.innerHTML = `<img src="${e.target.result}" alt="Book cover preview">`;
            this.imagePreview = file;
        };
        reader.readAsDataURL(file);
    }

    removeImage() {
        const preview = document.getElementById('book-image-preview');
        preview.innerHTML = `
            <div class="image-placeholder">
                <i class="fas fa-book fa-3x"></i>
                <p>Click to upload book cover</p>
                <small>Max size: 5MB (JPG, PNG, GIF, WebP)</small>
            </div>
        `;
        document.getElementById('book-image-input').value = '';
        this.imagePreview = null;
    }

    async addBook() {
        try {
            const form = document.getElementById('add-book-form');
            const formData = new FormData(form);

            // Add image if selected
            const imageInput = document.getElementById('book-image-input');
            if (imageInput.files[0]) {
                formData.append('image', imageInput.files[0]);
            }

            const response = await fetch('/api/books', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to add book');
            }

            showToast('Book added successfully!', 'success');
            this.closeModal('add-book-modal');
            
            // Refresh books list if on books section
            if (window.location.hash === '#books') {
                booksManager.loadBooks();
            }
            
            // Refresh my books if on profile
            this.loadMyBooks();

        } catch (error) {
            console.error('Add book error:', error);
            showToast(error.message || 'Failed to add book', 'error');
        }
    }

    async updateBook(bookId) {
        try {
            const form = document.getElementById('edit-book-form');
            const formData = new FormData(form);

            // Convert FormData to JSON for PUT request
            const bookData = {};
            formData.forEach((value, key) => {
                bookData[key] = value;
            });

            const response = await fetch(`/api/books/${bookId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bookData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update book');
            }

            // Handle image upload separately if changed
            const imageInput = document.getElementById('book-image-input');
            if (imageInput.files[0]) {
                await this.uploadBookImage(bookId, imageInput.files[0]);
            }

            showToast('Book updated successfully!', 'success');
            this.closeModal('edit-book-modal');
            this.loadMyBooks();

        } catch (error) {
            console.error('Update book error:', error);
            showToast(error.message || 'Failed to update book', 'error');
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
        try {
            const response = await fetch('/api/books/my-books', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load books');
            }

            const data = await response.json();
            this.renderMyBooks(data.books);

        } catch (error) {
            console.error('Load my books error:', error);
            showToast('Failed to load your books', 'error');
        }
    }

    renderMyBooks(books) {
        const container = document.getElementById('books-content');
        if (!container) return;

        if (books.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book fa-3x"></i>
                    <h3>No Books Yet</h3>
                    <p>Start by adding your first book to share with others!</p>
                    <button class="btn btn-primary" onclick="bookManagement.showAddBookModal()">
                        <i class="fas fa-plus"></i>
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
                    <i class="fas fa-plus"></i>
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
