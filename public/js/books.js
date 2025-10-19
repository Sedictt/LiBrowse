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
    }

    async loadBooks(filters = {}, reset = true) {
        if (this.isLoading) return;
        
        try {
            this.isLoading = true;
            this.filters = { ...this.filters, ...filters };
            
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
                    ${book.minimum_credits ? `
                        <div class="credit-requirement">
                            <i class="fas fa-coins"></i>
                            <span class="credit-amount">${book.minimum_credits}</span>
                            <span>credits required</span>
                        </div>
                    ` : ''}
                    <div class="book-actions">
                        <button class="btn btn-primary btn-sm" onclick="booksManager.requestBook(${book.id})" ${!book.is_available ? 'disabled' : ''}>
                            <i class="fas fa-hand-paper"></i>
                            ${book.is_available ? 'Request' : 'Unavailable'}
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
            await api.post('/transactions', { book_id: bookId });
            showToast('Request sent successfully!', 'success');
        } catch (error) {
            console.error('Failed to request book:', error);
            showToast(error.message || 'Failed to send request', 'error');
        }
    }

    async viewBook(bookId) {
        console.log('=== VIEW BOOK CALLED ===');
        console.log('Book ID:', bookId);
        console.log('Current books array:', this.books);
        console.log('booksManager instance:', this);
        
        try {
            // First try to find the book in the current books array
            let book = this.books.find(b => b.id == bookId);
            console.log('Found book in array:', book);
            
            if (!book) {
                console.log('Book not found in array, fetching from API...');
                // If not found, fetch from API
                const response = await api.getBook(bookId);
                console.log('API response for book:', response);
                
                // The API returns { book: bookData }, so we need to extract the book object
                book = response.book || response;
                console.log('Extracted book data:', book);
            } else {
                console.log('Using book from current array:', book);
            }
            
            console.log('About to show modal with book:', book);
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
        conditionElement.textContent = condition.text;
        conditionElement.className = condition.class;

        document.getElementById('modal-book-credits').textContent = `${book.minimum_credits || book.min_credit || 0} credits`;

        // Owner information
        document.getElementById('modal-book-owner').textContent = book.owner_name || 'Unknown';
        document.getElementById('modal-book-owner-program').textContent = book.owner_program || book.program || 'Not specified';

        // Image
        const imageUrl = book.image_url || book.cover_image || book.cover || getPlaceholderImage(book.title);
        const imageElement = document.getElementById('modal-book-image');
        imageElement.src = imageUrl;

        // Status badge
        const isAvailable = book.is_available === 1 || book.is_available === true;
        const status = isAvailable ? 'available' : 'borrowed';
        const statusText = isAvailable ? 'Available' : 'Borrowed';
        const statusElement = document.getElementById('modal-book-status');
        statusElement.textContent = statusText;
        statusElement.className = `book-status-badge ${status}`;

        // Description (if available)
        const descriptionSection = document.getElementById('modal-book-description-section');
        const descriptionElement = document.getElementById('modal-book-description');
        if (book.description && book.description.trim()) {
            descriptionElement.textContent = book.description;
            descriptionSection.style.display = 'block';
        } else {
            descriptionSection.style.display = 'none';
        }

        // Request button state
        const requestButton = document.getElementById('modal-request-book');
        if (isAvailable) {
            requestButton.disabled = false;
            requestButton.innerHTML = '<i class="fas fa-hand-paper"></i> Request Book';
        } else {
            requestButton.disabled = true;
            requestButton.innerHTML = '<i class="fas fa-ban"></i> Not Available';
        }
    }

    async requestBookFromModal() {
        if (!this.currentModalBook) return;
        
        if (!authManager.requireAuth()) return;

        try {
            await api.post('/transactions', { book_id: this.currentModalBook.id });
            showToast('Request sent successfully!', 'success');
            
            // Close modal
            this.closeBookModal();
        } catch (error) {
            console.error('Failed to request book:', error);
            showToast(error.message || 'Failed to send request', 'error');
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
        const filterSelects = ['program-filter', 'condition-filter', 'availability-filter'];
        filterSelects.forEach(filterId => {
            const filter = document.getElementById(filterId);
            if (filter) {
                filter.addEventListener('change', () => {
                    this.applyFilters();
                });
            }
        });

        // Load more functionality
        const loadMoreBtn = document.getElementById('load-more-books');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                this.loadMoreBooks();
            });
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
        
        if (programFilter?.value) filters.program = programFilter.value;
        if (conditionFilter?.value) filters.condition = conditionFilter.value;
        if (availabilityFilter?.value) filters.availability = availabilityFilter.value;
        
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
}

// Global test function for debugging
window.testBookModal = async function() {
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
window.testModalSimple = function() {
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
