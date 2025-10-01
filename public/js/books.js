// PLV BookSwap - Books Management
class BooksManager {
    constructor() {
        this.currentBooks = [];
        this.currentPage = 1;
        this.booksPerPage = 12;
        this.currentFilters = {};
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadBooks();
    }

    setupEventListeners() {
        // Add book button
        const addBookBtn = document.getElementById('add-book-btn');
        if (addBookBtn) {
            addBookBtn.addEventListener('click', () => {
                if (authManager.requireAuth()) {
                    this.openAddBookModal();
                }
            });
        }

        // Add book form
        const addBookForm = document.getElementById('add-book-form');
        if (addBookForm) {
            addBookForm.addEventListener('submit', this.handleAddBook.bind(this));
        }

        // Smart credit requirement suggestions based on condition
        const conditionSelect = document.getElementById('book-condition');
        const creditSelect = document.getElementById('book-min-credit');
        if (conditionSelect && creditSelect) {
            conditionSelect.addEventListener('change', (e) => {
                this.suggestCreditRequirement(e.target.value, creditSelect);
            });
        }

        // Edit book form smart suggestions
        const editConditionSelect = document.getElementById('edit-book-condition');
        const editCreditSelect = document.getElementById('edit-book-min-credit');
        if (editConditionSelect && editCreditSelect) {
            editConditionSelect.addEventListener('change', (e) => {
                this.suggestCreditRequirement(e.target.value, editCreditSelect);
            });
        }

        // Edit book form
        const editBookForm = document.getElementById('edit-book-form');
        if (editBookForm) {
            editBookForm.addEventListener('submit', this.handleEditBook.bind(this));
        }

        // Book details modal buttons
        const bookDetailsBorrowBtn = document.getElementById('book-details-borrow-btn');
        if (bookDetailsBorrowBtn) {
            bookDetailsBorrowBtn.addEventListener('click', () => {
                const bookId = bookDetailsBorrowBtn.dataset.bookId;
                if (bookId) {
                    this.closeBookDetailsModal();
                    this.openBorrowModal(parseInt(bookId));
                }
            });
        }

        const bookDetailsEditBtn = document.getElementById('book-details-edit-btn');
        if (bookDetailsEditBtn) {
            bookDetailsEditBtn.addEventListener('click', () => {
                const bookId = bookDetailsEditBtn.dataset.bookId;
                if (bookId) {
                    this.closeBookDetailsModal();
                    this.editBook(parseInt(bookId));
                }
            });
        }

        // Search functionality
        const searchInput = document.getElementById('book-search');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.handleSearch(e.target.value);
                }, 500);
            });
        }

        // Filter functionality
        const filters = ['program-filter', 'condition-filter', 'availability-filter'];
        filters.forEach(filterId => {
            const filter = document.getElementById(filterId);
            if (filter) {
                filter.addEventListener('change', this.handleFilterChange.bind(this));
            }
        });

        // Load more books
        const loadMoreBtn = document.getElementById('load-more-books');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', this.loadMoreBooks.bind(this));
        }

        // Book image preview
        const bookImageInput = document.getElementById('book-image');
        if (bookImageInput) {
            bookImageInput.addEventListener('change', this.handleImagePreview.bind(this));
        }

        // Browse books button (hero section)
        const browseBooksBtn = document.getElementById('browse-books-btn');
        if (browseBooksBtn) {
            browseBooksBtn.addEventListener('click', () => {
                this.navigateToSection('books');
            });
        }
    }

    async loadBooks(reset = true) {
        try {
            if (reset) {
                this.currentPage = 1;
                this.currentBooks = [];
            }

            const filters = {
                ...this.currentFilters,
                page: this.currentPage,
                limit: this.booksPerPage
            };

            // Default to showing only available books unless explicitly filtering otherwise
            if (!filters.availability) {
                filters.availability = 'available';
            }

            const response = await api.getBooks(filters);
            
            if (reset) {
                this.currentBooks = response.books || [];
            } else {
                this.currentBooks = [...this.currentBooks, ...(response.books || [])];
            }

            this.renderBooks();
            this.updateLoadMoreButton(response.hasMore);
        } catch (error) {
            console.error('Failed to load books:', error);
            this.showToast('Failed to load books', 'error');
        }
    }

    async handleSearch(query) {
        try {
            if (query.trim()) {
                const searchFilters = { ...this.currentFilters };
                // Default to showing only available books unless explicitly filtering otherwise
                if (!searchFilters.availability) {
                    searchFilters.availability = 'available';
                }
                const response = await api.searchBooks(query, searchFilters);
                this.currentBooks = response.books || [];
            } else {
                await this.loadBooks();
                return;
            }
            
            this.renderBooks();
        } catch (error) {
            console.error('Search failed:', error);
            this.showToast('Search failed', 'error');
        }
    }

    handleFilterChange() {
        const programFilter = document.getElementById('program-filter');
        const conditionFilter = document.getElementById('condition-filter');
        const availabilityFilter = document.getElementById('availability-filter');

        this.currentFilters = {};

        if (programFilter && programFilter.value) {
            this.currentFilters.program = programFilter.value;
        }
        if (conditionFilter && conditionFilter.value) {
            this.currentFilters.condition = conditionFilter.value;
        }
        if (availabilityFilter && availabilityFilter.value) {
            this.currentFilters.availability = availabilityFilter.value;
        }

        this.loadBooks(true);
    }

    async loadMoreBooks() {
        this.currentPage++;
        await this.loadBooks(false);
    }

    renderBooks() {
        const booksGrid = document.getElementById('books-grid');
        if (!booksGrid) return;

        if (this.currentBooks.length === 0) {
            booksGrid.innerHTML = `
                <div class="no-books">
                    <i class="fas fa-book-open"></i>
                    <h3>No books found</h3>
                    <p>Try adjusting your search or filters</p>
                </div>
            `;
            return;
        }

        booksGrid.innerHTML = this.currentBooks.map(book => this.createBookCard(book)).join('');
    }

    createBookCard(book) {
        const isOwner = authManager.currentUser && authManager.currentUser.id === book.owner_id;
        const isAvailable = book.is_available && book.status !== 'borrowed';
        const userCredits = authManager.currentUser ? authManager.currentUser.credits || 100 : 0;
        const requiredCredits = book.minimum_credits || 100;
        const hasEnoughCredits = userCredits >= requiredCredits;
        const canBorrow = authManager.currentUser && !isOwner && isAvailable && hasEnoughCredits;
        
        // Determine card class based on credit eligibility
        const cardClass = authManager.currentUser && !isOwner && !hasEnoughCredits ? 'insufficient-credits' : '';

        return `
            <div class="book-card ${cardClass}" data-book-id="${book.id}">
                <div class="book-image">
                    ${book.cover_image ? 
                        `<img src="${book.cover_image}" alt="${book.title}">` : 
                        '<i class="fas fa-book"></i>'
                    }
                </div>
                <div class="book-info">
                    <h3 class="book-title">${book.title}</h3>
                    <p class="book-author">by ${book.author}</p>
                    <div class="book-meta">
                        <span class="book-program">${book.subject}</span>
                        <span class="book-condition">${this.formatCondition(book.condition_rating)}</span>
                    </div>
                    
                    <!-- Credit Requirement Display -->
                    <div class="credit-requirement">
                        <i class="fas fa-coins"></i>
                        <span>Requires <span class="credit-amount">${requiredCredits}</span> credits</span>
                    </div>
                    
                    <div class="book-details">
                        <p><strong>Course:</strong> ${book.course_code || 'N/A'}</p>
                        <p><strong>Edition:</strong> ${book.edition || 'N/A'}</p>
                        <p><strong>Owner:</strong> ${book.owner_name || 'Unknown'}</p>
                        <p><strong>Status:</strong> ${this.formatStatus(book.is_available)}</p>
                    </div>
                    
                    <div class="book-actions">
                        <button class="btn btn-outline btn-sm" onclick="booksManager.openBookDetailsModal(${book.id})">
                            <i class="fas fa-eye"></i>
                            View Details
                        </button>
                        ${isOwner ? `
                            <button class="btn btn-outline btn-sm" onclick="booksManager.editBook(${book.id})">
                                <i class="fas fa-edit"></i>
                                Edit
                            </button>
                        ` : canBorrow ? `
                            <button class="btn btn-primary btn-sm" onclick="booksManager.openBorrowModal(${book.id})" ${!hasEnoughCredits ? 'disabled' : ''}>
                                <i class="fas fa-handshake"></i>
                                ${!hasEnoughCredits ? 'Insufficient Credits' : 'Borrow'}
                            </button>
                        ` : !isAvailable ? `
                            <button class="btn btn-secondary btn-sm" disabled>
                                <i class="fas fa-clock"></i>
                                Not Available
                            </button>
                        ` : ''}
                    </div>
                    </div>
                </div>
            </div>
        `;
    }

    formatCondition(condition) {
        const conditions = {
            'excellent': 'Excellent',
            'good': 'Good',
            'fair': 'Fair'
        };
        return conditions[condition] || condition;
    }

    formatStatus(isAvailable) {
        return isAvailable ? 'Available' : 'Not Available';
    }

    openAddBookModal() {
        const modal = document.getElementById('add-book-modal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    // Suggest credit requirements based on book condition
    suggestCreditRequirement(condition, creditSelect) {
        const suggestions = {
            'excellent': '120',  // Excellent condition books
            'good': '100',       // Standard good condition
            'fair': '80'         // Fair condition books
        };

        const suggestedValue = suggestions[condition];
        if (suggestedValue && creditSelect) {
            creditSelect.value = suggestedValue;
            
            // Add visual feedback
            creditSelect.style.borderColor = 'var(--success)';
            setTimeout(() => {
                creditSelect.style.borderColor = '';
            }, 2000);
        }
    }

    closeAddBookModal() {
        const modal = document.getElementById('add-book-modal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            
            // Reset form
            const form = document.getElementById('add-book-form');
            if (form) form.reset();
            
            // Clear image preview
            const preview = document.getElementById('book-image-preview');
            if (preview) preview.innerHTML = '';
        }
    }

    async handleAddBook(e) {
        e.preventDefault();
        
        if (!authManager.requireAuth()) return;

        const formData = new FormData(e.target);
        const bookData = {
            title: formData.get('title'),
            author: formData.get('author'),
            isbn: formData.get('isbn'),
            edition: formData.get('edition'),
            program: formData.get('program'),
            course_code: formData.get('course_code'),
            condition: formData.get('condition'),
            min_credit: parseInt(formData.get('min_credit')) || 0,
            description: formData.get('description')
        };

        try {
            this.showLoading(e.target);
            
            // Add book
            const response = await api.addBook(bookData);
            
            // Upload image if provided
            const imageFile = formData.get('image');
            if (imageFile && imageFile.size > 0) {
                await api.uploadBookImage(response.book.id, imageFile);
            }

            this.closeAddBookModal();
            this.loadBooks(true);
            this.showToast('Book added successfully!', 'success');
        } catch (error) {
            console.error('Failed to add book:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading(e.target);
        }
    }

    handleImagePreview(e) {
        const file = e.target.files[0];
        const preview = document.getElementById('book-image-preview');
        
        if (!preview) return;

        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 200px; max-height: 200px; object-fit: cover; border-radius: 8px;">`;
            };
            reader.readAsDataURL(file);
        } else {
            preview.innerHTML = '';
        }
    }

    async requestBook(bookId) {
        if (!authManager.requireAuth()) return;

        try {
            await api.createTransaction(bookId);
            this.showToast('Book request sent successfully!', 'success');
            this.loadBooks(true); // Refresh to update status
        } catch (error) {
            console.error('Failed to request book:', error);
            this.showToast(error.message, 'error');
        }
    }

    async deleteBook(bookId) {
        if (!authManager.requireAuth()) return;

        if (!confirm('Are you sure you want to delete this book?')) return;

        try {
            await api.deleteBook(bookId);
            this.loadBooks(true);
            this.showToast('Book deleted successfully!', 'success');
        } catch (error) {
            console.error('Failed to delete book:', error);
            this.showToast(error.message, 'error');
        }
    }

    editBook(bookId) {
        // TODO: Implement edit functionality
        this.showToast('Edit functionality coming soon!', 'info');
    }

    viewBookDetails(bookId) {
        // TODO: Implement book details modal
        this.showToast('Book details modal coming soon!', 'info');
    }

    updateLoadMoreButton(hasMore) {
        const loadMoreBtn = document.getElementById('load-more-books');
        if (loadMoreBtn) {
            if (hasMore) {
                loadMoreBtn.style.display = 'block';
            } else {
                loadMoreBtn.style.display = 'none';
            }
        }
    }

    navigateToSection(sectionName) {
        // Hide all sections
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });

        // Show target section
        const targetSection = document.getElementById(`${sectionName}-section`);
        if (targetSection) {
            targetSection.classList.add('active');
        }

        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        const navLink = document.querySelector(`[data-section="${sectionName}"]`);
        if (navLink) {
            navLink.classList.add('active');
        }

        // Update URL hash
        window.location.hash = sectionName;
    }

    showLoading(form) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            
            // Determine if this is add or edit form
            if (form.id === 'edit-book-form') {
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating Book...';
            } else {
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding Book...';
            }
        }
    }

    hideLoading(form) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            
            // Determine if this is add or edit form
            if (form.id === 'edit-book-form') {
                submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Book';
            } else {
                submitBtn.innerHTML = '<i class="fas fa-plus"></i> Add Book';
            }
        }
    }

    // Open borrow modal for a specific book
    openBorrowModal(bookId) {
        if (!authManager.requireAuth()) return;

        const book = this.currentBooks.find(b => b.id === bookId);
        if (!book) {
            this.showToast('Book not found', 'error');
            return;
        }

        // Check if user has enough credits
        const userCredits = authManager.currentUser.credits || 100;
        const requiredCredits = book.minimum_credits || 100;

        if (userCredits < requiredCredits) {
            this.showToast(`You need ${requiredCredits} credits to borrow this book. You have ${userCredits} credits.`, 'error');
            return;
        }

        // Populate modal with book information
        this.populateBorrowModal(book);
        
        // Open modal
        const modal = document.getElementById('borrow-modal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Set minimum return date (tomorrow)
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const returnDateInput = document.getElementById('expected-return-date');
            if (returnDateInput) {
                returnDateInput.min = tomorrow.toISOString().split('T')[0];
                
                // Set default return date (2 weeks from now)
                const twoWeeks = new Date();
                twoWeeks.setDate(twoWeeks.getDate() + 14);
                returnDateInput.value = twoWeeks.toISOString().split('T')[0];
            }
        }
    }

    populateBorrowModal(book) {
        // Set book ID
        const bookIdInput = document.getElementById('borrow-book-id');
        if (bookIdInput) bookIdInput.value = book.id;

        // Set book info header
        const bookInfoHeader = document.getElementById('borrow-book-info');
        if (bookInfoHeader) {
            bookInfoHeader.innerHTML = `
                <img src="${book.cover_image || './images/book-placeholder.svg'}" alt="${book.title}">
                <div class="book-info-details">
                    <h4>${book.title}</h4>
                    <p>by ${book.author}</p>
                    <p><strong>Course:</strong> ${book.course_code} - ${book.subject}</p>
                    <p><strong>Owner:</strong> ${book.owner_name}</p>
                </div>
            `;
        }

        // Set credit information
        const userCredits = authManager.currentUser.credits || 100;
        const requiredCredits = book.minimum_credits || 100;
        
        const requiredCreditsSpan = document.getElementById('required-credits');
        const userCreditsSpan = document.getElementById('user-credits-modal');
        const creditStatus = document.getElementById('credit-status');
        
        if (requiredCreditsSpan) requiredCreditsSpan.textContent = requiredCredits;
        if (userCreditsSpan) userCreditsSpan.textContent = userCredits;
        
        if (creditStatus) {
            if (userCredits >= requiredCredits) {
                creditStatus.className = 'credit-status-message sufficient';
                creditStatus.textContent = '✓ You have sufficient credits to borrow this book';
            } else {
                creditStatus.className = 'credit-status-message insufficient';
                creditStatus.textContent = `✗ You need ${requiredCredits - userCredits} more credits to borrow this book`;
            }
        }

        // Setup form submission
        const borrowForm = document.getElementById('borrow-form');
        if (borrowForm) {
            borrowForm.onsubmit = this.handleBorrowRequest.bind(this);
        }
    }

    async handleBorrowRequest(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const borrowData = {
            book_id: parseInt(formData.get('book_id')),
            request_message: formData.get('request_message'),
            borrower_contact: formData.get('borrower_contact'),
            borrower_address: formData.get('borrower_address'),
            pickup_method: formData.get('pickup_method'),
            pickup_location: formData.get('pickup_location'),
            preferred_pickup_time: formData.get('preferred_pickup_time'),
            borrow_duration: formData.get('borrow_duration'),
            expected_return_date: formData.get('expected_return_date')
        };

        try {
            this.showLoading(e.target);
            
            console.log('Sending borrow request:', borrowData);
            const response = await api.post('/transactions/request', borrowData);
            console.log('Borrow request response:', response);
            
            // Close modal
            const modal = document.getElementById('borrow-modal');
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
            
            // Reset form
            e.target.reset();
            
            // Show success message
            this.showToast(`Borrow request sent to ${response.lender_name}!`, 'success');
            
            // Reload books to update availability
            await this.loadBooks(true);
            
        } catch (error) {
            console.error('Borrow request failed:', error);
            console.error('Error details:', error.response?.data);
            
            let errorMessage = 'Failed to send borrow request';
            if (error.response?.data?.error) {
                errorMessage = error.response.data.error;
            } else if (error.response?.data?.details) {
                errorMessage = error.response.data.details.map(d => d.msg).join(', ');
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            this.showToast(errorMessage, 'error');
        } finally {
            this.hideLoading(e.target);
        }
    }

    // Edit book functionality
    editBook(bookId) {
        if (!authManager.requireAuth()) return;

        const book = this.currentBooks.find(b => b.id === bookId);
        if (!book) {
            this.showToast('Book not found', 'error');
            return;
        }

        // Check if user owns the book
        if (book.owner_id !== authManager.currentUser.id) {
            this.showToast('You can only edit your own books', 'error');
            return;
        }

        this.populateEditModal(book);
        this.openEditBookModal();
    }

    openEditBookModal() {
        const modal = document.getElementById('edit-book-modal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    closeEditBookModal() {
        const modal = document.getElementById('edit-book-modal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            
            // Reset form
            const form = document.getElementById('edit-book-form');
            if (form) form.reset();
            
            // Clear current image preview
            const currentImageDiv = document.getElementById('current-book-image');
            if (currentImageDiv) currentImageDiv.innerHTML = '';
        }
    }

    populateEditModal(book) {
        // Populate form fields
        document.getElementById('edit-book-id').value = book.id;
        document.getElementById('edit-book-title').value = book.title || '';
        document.getElementById('edit-book-author').value = book.author || '';
        document.getElementById('edit-book-isbn').value = book.isbn || '';
        document.getElementById('edit-book-edition').value = book.edition || '';
        document.getElementById('edit-book-course-code').value = book.course_code || '';
        document.getElementById('edit-book-subject').value = book.subject || '';
        document.getElementById('edit-book-condition').value = book.condition_rating || '';
        document.getElementById('edit-book-min-credit').value = book.minimum_credits || 100;
        document.getElementById('edit-book-description').value = book.description || '';

        // Show current image if exists
        const currentImageDiv = document.getElementById('current-book-image');
        if (currentImageDiv) {
            if (book.cover_image) {
                currentImageDiv.innerHTML = `
                    <div class="image-label">Current Book Image:</div>
                    <img src="${book.cover_image}" alt="${book.title}">
                `;
            } else {
                currentImageDiv.innerHTML = `
                    <div class="image-label">No current image</div>
                `;
            }
        }
    }

    async handleEditBook(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const bookId = formData.get('book_id');
        
        const bookData = {
            title: formData.get('title'),
            author: formData.get('author'),
            isbn: formData.get('isbn'),
            edition: formData.get('edition'),
            course_code: formData.get('course_code'),
            subject: formData.get('subject'),
            condition: formData.get('condition'),
            minimum_credits: parseInt(formData.get('minimum_credits')),
            description: formData.get('description')
        };

        try {
            this.showLoading(e.target);
            
            // Update book details
            const response = await api.put(`/books/${bookId}`, bookData);
            
            // Handle image upload if provided
            const imageFile = formData.get('image');
            if (imageFile && imageFile.size > 0) {
                const imageFormData = new FormData();
                imageFormData.append('image', imageFile);
                await api.post(`/books/${bookId}/image`, imageFormData);
            }
            
            // Close modal
            this.closeEditBookModal();
            
            // Show success message
            this.showToast('Book updated successfully!', 'success');
            
            // Reload books to show updated data
            await this.loadBooks(false);
            
        } catch (error) {
            console.error('Edit book failed:', error);
            this.showToast(error.message || 'Failed to update book', 'error');
        } finally {
            this.hideLoading(e.target);
        }
    }

    // Book details modal functionality
    openBookDetailsModal(bookId) {
        const book = this.currentBooks.find(b => b.id === bookId);
        if (!book) {
            this.showToast('Book not found', 'error');
            return;
        }

        this.populateBookDetailsModal(book);
        
        const modal = document.getElementById('book-details-modal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    closeBookDetailsModal() {
        const modal = document.getElementById('book-details-modal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    populateBookDetailsModal(book) {
        // Basic book information
        document.getElementById('book-details-title').textContent = book.title || 'Unknown Title';
        document.getElementById('book-details-author').textContent = `by ${book.author || 'Unknown Author'}`;
        document.getElementById('book-details-course').textContent = book.course_code || 'N/A';
        document.getElementById('book-details-subject').textContent = book.subject || 'N/A';
        document.getElementById('book-details-edition').textContent = book.edition || 'N/A';
        document.getElementById('book-details-publisher').textContent = book.publisher || 'N/A';
        document.getElementById('book-details-year').textContent = book.publication_year || 'N/A';
        document.getElementById('book-details-isbn').textContent = book.isbn || 'N/A';
        document.getElementById('book-details-description').textContent = book.description || 'No description available.';

        // Book image
        const bookImage = document.getElementById('book-details-image');
        if (book.cover_image) {
            bookImage.src = book.cover_image;
            bookImage.alt = book.title;
        } else {
            bookImage.src = './images/book-placeholder.svg';
            bookImage.alt = 'Book cover not available';
        }

        // Condition and availability
        const conditionElement = document.getElementById('book-details-condition');
        conditionElement.textContent = this.formatCondition(book.condition_rating);
        conditionElement.className = `meta-tag condition ${book.condition_rating}`;

        const availabilityElement = document.getElementById('book-details-availability');
        if (book.is_available) {
            availabilityElement.textContent = 'Available';
            availabilityElement.className = 'meta-tag availability available';
        } else {
            availabilityElement.textContent = 'Not Available';
            availabilityElement.className = 'meta-tag availability unavailable';
        }

        // Credit requirements
        const creditsElement = document.getElementById('book-details-credits');
        creditsElement.textContent = `${book.minimum_credits || 100} Credits`;

        // Credit status for current user
        const creditStatusElement = document.getElementById('book-details-credit-status');
        if (authManager.currentUser) {
            const userCredits = authManager.currentUser.credits || 0;
            const requiredCredits = book.minimum_credits || 100;
            
            if (userCredits >= requiredCredits) {
                creditStatusElement.textContent = '✓ You have sufficient credits to borrow this book';
                creditStatusElement.className = 'credit-status sufficient';
            } else {
                creditStatusElement.textContent = `✗ You need ${requiredCredits - userCredits} more credits to borrow this book`;
                creditStatusElement.className = 'credit-status insufficient';
            }
        } else {
            creditStatusElement.textContent = 'Login to check your credit eligibility';
            creditStatusElement.className = 'credit-status';
        }

        // Owner information
        document.getElementById('book-details-owner').textContent = book.owner_name || 'Unknown Owner';
        document.getElementById('book-details-owner-program').textContent = book.owner_program || 'Program not specified';
        document.getElementById('book-details-owner-books').textContent = book.owner_book_count || '0';
        document.getElementById('book-details-owner-rating').textContent = book.owner_rating || '5.0';

        // Action buttons
        const borrowBtn = document.getElementById('book-details-borrow-btn');
        const editBtn = document.getElementById('book-details-edit-btn');
        
        // Set book ID for buttons
        borrowBtn.dataset.bookId = book.id;
        editBtn.dataset.bookId = book.id;

        // Show/hide buttons based on ownership and availability
        const isOwner = authManager.currentUser && authManager.currentUser.id === book.owner_id;
        const canBorrow = !isOwner && book.is_available && authManager.currentUser;
        
        if (isOwner) {
            borrowBtn.style.display = 'none';
            editBtn.style.display = 'block';
        } else if (canBorrow) {
            borrowBtn.style.display = 'block';
            editBtn.style.display = 'none';
            
            // Disable borrow button if insufficient credits
            const userCredits = authManager.currentUser.credits || 0;
            const requiredCredits = book.minimum_credits || 100;
            
            if (userCredits < requiredCredits) {
                borrowBtn.disabled = true;
                borrowBtn.innerHTML = '<i class="fas fa-lock"></i> Insufficient Credits';
                borrowBtn.className = 'btn btn-outline btn-full';
            } else {
                borrowBtn.disabled = false;
                borrowBtn.innerHTML = '<i class="fas fa-handshake"></i> Request to Borrow';
                borrowBtn.className = 'btn btn-primary btn-full';
            }
        } else {
            borrowBtn.style.display = 'none';
            editBtn.style.display = 'none';
        }
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

    showToast(message, type = 'info') {
        // Use the same toast system as auth manager
        if (authManager && authManager.showToast) {
            authManager.showToast(message, type);
        }
    }
}

// Initialize books manager
const booksManager = new BooksManager();

// Global access
window.booksManager = booksManager;
