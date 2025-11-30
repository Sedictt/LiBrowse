const express = require('express');
const request = require('supertest');
const mockDb = require('./mocks/statefulDb');

// Mock dependencies
jest.mock('../config/database', () => mockDb);
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_secret'),
  compare: jest.fn().mockResolvedValue(true)
}));
jest.mock('../services/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue({ ok: true })
}));
// Mock axios for CAPTCHA
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ data: { success: true } })
}));

// Mock auth middleware
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token.startsWith('token_')) {
        const userId = parseInt(token.split('_')[1]);
        const user = mockDb.users.find(u => u.id === userId);
        if (user) {
          req.user = user;
          return next();
        }
      }
    }
    return res.sendStatus(403);
  },
  optionalAuth: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token.startsWith('token_')) {
        const userId = parseInt(token.split('_')[1]);
        const user = mockDb.users.find(u => u.id === userId);
        if (user) {
          req.user = user;
        }
      }
    }
    next();
  }
}));

// Import app components
const authRouter = require('../routes/auth');
const booksRouter = require('../routes/books');
const txRouter = require('../routes/transactions');

const makeApp = () => {
  const app = express();
  app.use(express.json());

  app.use('/api/auth', authRouter);
  app.use('/api/books', booksRouter);
  app.use('/api/transactions', txRouter);
  return app;
};

describe('Credits System Integration', () => {
  let app;

  beforeEach(() => {
    mockDb.reset();
    jest.clearAllMocks();
    app = makeApp();
  });

  // Helper to create a user and return "token"
  const registerUser = async (name) => {
    const email = `${name}@plv.edu.ph`;
    const student_no = `21-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

    // Ensure unique student_no
    const existing = mockDb.users.find(u => u.student_no === student_no);
    if (existing) {
      // Simple retry with different number
      return registerUser(name + 'x');
    }

    const res = await request(app).post('/api/auth/register').send({
      email, student_no,
      fname: name, lname: 'Test', password: 'pass', course: 'BSIT'
    });

    if (res.status !== 201) {
      console.log('Register failed:', res.status, res.body);
    }

    const user = mockDb.users.find(u => u.email === email);
    if (!user) {
      console.log('MockDB Users:', mockDb.users);
      throw new Error(`User not found after register: ${email}`);
    }

    // Manually verify user for borrowing tests (requires verification)
    user.is_verified = 1;
    user.verification_status = 'verified';

    return { token: `token_${user.id}`, id: user.id };
  };

  test('new users start with 100 credits', async () => {
    const { token, id } = await registerUser('newuser');
    const user = mockDb.users.find(u => u.id === id);
    expect(user.credits).toBe(100);
  });

  test('borrow flow updates status', async () => {
    const lender = await registerUser('lender');
    const borrower = await registerUser('borrower');

    // Create Book
    const bookRes = await request(app)
      .post('/api/books')
      .set('Authorization', `Bearer ${lender.token}`)
      .send({ title: 'Test Book', author: 'Auth', course_code: 'IT101', condition: 'good', minimum_credits: 50 });

    expect(bookRes.statusCode).toBe(201); // Books controller returns 201 on success
    // Note: The mockDb insert logic for books might need to ensure owner_id is set correctly.
    // The controller likely pulls req.user.id and passes it to insert.
    // Our mockDb.executeQuery for 'insert into books' expects params.

    // Let's verify the book was created with correct owner
    const book = mockDb.books[mockDb.books.length - 1];
    expect(book).toBeDefined();
    expect(book.owner_id).toBe(lender.id);

    // Borrow Request
    const txRes = await request(app)
      .post('/api/transactions/request')
      .set('Authorization', `Bearer ${borrower.token}`)
      .send({
        book_id: book.id,
        borrow_duration: '1w',
        borrow_start_date: '2023-01-01',
        borrower_contact: '09123456789',
        request_message: 'I need this for my class project please.',
        pickup_method: 'meetup',
        pickup_location: 'Library'
      });

    if (txRes.statusCode !== 201) {
      console.log('Borrow request failed:', txRes.body);
    }
    expect(txRes.statusCode).toBe(201);
    const txId = txRes.body.transaction_id;

    // Approve
    const approveRes = await request(app)
      .put(`/api/transactions/${txId}/approve`)
      .set('Authorization', `Bearer ${lender.token}`)
      .send({});

    if (approveRes.statusCode !== 200) {
      console.log('Approve failed:', approveRes.body);
    }
    expect(approveRes.statusCode).toBe(200);
    expect(mockDb.transactions.find(t => t.id === txId).status).toBe('approved');
  });
});