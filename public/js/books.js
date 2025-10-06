// Books management for LiBrowse

class BooksManager {
    constructor() {
        this.books = [];
        this.currentPage = 1;
        this.booksPerPage = 12;
        this.filters = {};
    }

    async loadBooks(filters = {}) {
        try {
            this.filters = filters;
            const response = await api.getBooks(filters);
            this.books = response.books || [];
            this.renderBooks();
        } catch (error) {
            console.error('Failed to load books:', error);
            showToast('Failed to load books', 'error');
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
        const condition = formatCondition(book.condition);
        const imageUrl = book.image || getPlaceholderImage(book.title);
        
        return `
            <div class="book-card" data-book-id="${book.id}">
                <div class="book-image">
                    <img src="${imageUrl}" alt="${escapeHtml(book.title)}" onerror="this.src='${getPlaceholderImage(book.title)}'">
                    <span class="book-status ${book.status}">${book.status}</span>
                </div>
                <div class="book-info">
                    <h3 class="book-title">${escapeHtml(book.title)}</h3>
                    <p class="book-author">${escapeHtml(book.author || 'Unknown Author')}</p>
                    <div class="book-meta">
                        <span class="book-program">${escapeHtml(book.program || '')}</span>
                        <span class="book-condition ${condition.class}">${condition.text}</span>
                    </div>
                    <div class="book-owner">
                        <i class="fas fa-user"></i>
                        <span>${escapeHtml(book.owner_name || 'Unknown')}</span>
                    </div>
                    <div class="book-actions">
                        <button class="btn btn-primary btn-sm" onclick="booksManager.requestBook(${book.id})">
                            <i class="fas fa-hand-paper"></i>
                            Request
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
}

// Create global books manager instance
const booksManager = new BooksManager();
