// Books management for LiBrowse

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
        const status = book.is_available ? 'available' : 'borrowed';
        const statusText = book.is_available ? 'Available' : 'Borrowed';
        
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
        try {
            const book = await api.getBook(bookId);
            this.showBookModal(book);
        } catch (error) {
            console.error('Failed to load book details:', error);
            showToast('Failed to load book details', 'error');
        }
    }

    showBookModal(book) {
        // Implementation for showing book details modal
        console.log('Show book details:', book);
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
    }
}

// Create global books manager instance
const booksManager = new BooksManager();

// Initialize books page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    booksManager.setupEventListeners();
});
