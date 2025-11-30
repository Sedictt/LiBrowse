const users = [];
const books = [];
const transactions = [];

// Central query processor
const processQuery = async (query, params) => {
    const q = query.toLowerCase().trim();
    // console.log('MockDB Query:', q, params);

    // --- SELECTS ---

    // Users
    if (q.startsWith('select') && q.includes('from users')) {
        if (q.includes('email =')) {
            const user = users.find(u => u.email === params[0]);
            return user ? [user] : [];
        }
        if (q.includes('id =')) {
            const user = users.find(u => u.id === params[0]);
            return user ? [user] : [];
        }
        return [];
    }

    // Books
    if (q.startsWith('select') && q.includes('from books')) {
        if (q.includes('id =')) {
            const book = books.find(b => b.id === params[0]);
            return book ? [book] : [];
        }
        return [];
    }

    // Transactions
    if (q.startsWith('select') && q.includes('from transactions')) {
        if (q.includes('count(*)')) {
            return [{ count: 0 }];
        }
        // Handle approval query with joins
        if (q.includes('join books b') && q.includes('join users u')) {
            // "where t.id = ? and t.lender_id = ?"
            // Params: [txId, lenderId]
            const txId = parseInt(params[0]);
            const lenderId = parseInt(params[1]);

            const tx = transactions.find(t => t.id === txId && t.lender_id === lenderId);
            if (tx) {
                // Mock joined fields
                const book = books.find(b => b.id === tx.book_id) || {};
                const borrower = users.find(u => u.id === tx.borrower_id) || {};
                return [{
                    ...tx,
                    book_title: book.title || 'Mock Book',
                    book_author: book.author || 'Mock Author',
                    borrower_name: `${borrower.fname} ${borrower.lname}`
                }];
            }
            return [];
        }

        if (q.includes('id =')) {
            const tx = transactions.find(t => t.id === params[0]);
            return tx ? [tx] : [];
        }
        return [];
    }

    // --- INSERTS ---

    if (q.startsWith('insert into users')) {
        const newUser = {
            id: users.length + 1,
            email: params[0],
            student_no: params[1],
            fname: params[2],
            lname: params[3],
            pass_hash: params[4],
            course: params[5],
            year: params[6],
            is_verified: 0,
            email_verified: 0,
            verification_status: 'unverified',
            credits: 100
        };
        users.push(newUser);
        return { insertId: newUser.id };
    }

    if (q.startsWith('insert into books')) {
        // Params: title, author, isbn, course_code, subject, edition, publisher, publication_year, condition_rating, description, owner_id, minimum_credits, cover_image
        const newBook = {
            id: books.length + 1,
            title: params[0],
            author: params[1],
            isbn: params[2],
            course_code: params[3],
            subject: params[4],
            edition: params[5],
            publisher: params[6],
            publication_year: params[7],
            condition_rating: params[8],
            description: params[9],
            owner_id: params[10],
            minimum_credits: params[11],
            cover_image: params[12],
            is_available: true,
            created_at: new Date()
        };
        books.push(newBook);
        return { insertId: newBook.id };
    }

    if (q.startsWith('insert into transactions')) {
        // Params: book_id, borrower_id, lender_id, ...
        const newTx = {
            id: transactions.length + 1,
            book_id: params[0],
            borrower_id: params[1],
            lender_id: params[2],
            status: 'pending',
            request_message: params[3]
        };
        transactions.push(newTx);
        return { insertId: newTx.id };
    }

    // --- UPDATES ---

    if (q.startsWith('update transactions')) {
        // Extract ID (usually last param)
        const txId = params[params.length - 1];
        const tx = transactions.find(t => t.id === parseInt(txId));
        if (tx) {
            if (q.includes("status = 'approved'")) tx.status = 'approved';
            if (q.includes("status = 'borrowed'")) tx.status = 'borrowed';
            if (q.includes("status = 'returned'")) tx.status = 'returned';
        }
        return { affectedRows: 1 };
    }

    if (q.startsWith('update books')) {
        return { affectedRows: 1 };
    }

    return { insertId: 0, affectedRows: 0 };
};

const mockDb = {
    // Standard helpers
    getOne: jest.fn(async (query, params) => {
        const rows = await processQuery(query, params);
        return rows.length > 0 ? rows[0] : null;
    }),
    executeQuery: jest.fn(async (query, params) => {
        return processQuery(query, params);
    }),

    // Pool interface (returns [rows, fields])
    pool: {
        query: jest.fn(async (query, params) => {
            const rows = await processQuery(query, params);
            // If it's an INSERT/UPDATE result, it's not an array of rows, but an object
            if (rows.insertId !== undefined || rows.affectedRows !== undefined) {
                return [rows, undefined];
            }
            return [rows, undefined];
        }),
        execute: jest.fn(async (query, params) => {
            const rows = await processQuery(query, params);
            if (rows.insertId !== undefined || rows.affectedRows !== undefined) {
                return [rows, undefined];
            }
            return [rows, undefined];
        })
    },

    // Connection interface
    getConnection: jest.fn(async () => {
        return {
            execute: jest.fn(async (query, params) => {
                const rows = await processQuery(query, params);
                if (rows.insertId !== undefined || rows.affectedRows !== undefined) {
                    return [rows, undefined];
                }
                return [rows, undefined];
            }),
            release: jest.fn()
        };
    }),

    reset: () => {
        users.length = 0;
        books.length = 0;
        transactions.length = 0;
    },

    users,
    books,
    transactions
};

module.exports = mockDb;
