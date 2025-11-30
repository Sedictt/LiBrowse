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
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ data: { success: true } })
}));
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
  optionalAuth: (req, res, next) => next()
}));

const authRouter = require('../routes/auth');
const verificationRouter = require('../routes/verification');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token.startsWith('token_')) {
        const userId = parseInt(token.split('_')[1]);
        const user = mockDb.users.find(u => u.id === userId);
        if (user) req.user = user;
      }
    }
    next();
  });

  app.use('/api/auth', authRouter);
  app.use('/api/verification', verificationRouter);
  return app;
};

describe('Verification System', () => {
  let app;

  beforeEach(() => {
    mockDb.reset();
    jest.clearAllMocks();
    app = makeApp();
  });

  const registerUser = async (name) => {
    const email = `${name}@plv.edu.ph`;
    const student_no = `21-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const res = await request(app).post('/api/auth/register').send({
      email, student_no,
      fname: name, lname: 'Test', password: 'pass', course: 'BSIT'
    });

    const user = mockDb.users.find(u => u.email === email);
    if (!user) throw new Error(`User not found in mockDb after register. Email: ${email}`);
    return { token: `token_${user.id}`, id: user.id };
  };

  test('GET /api/verification/rewards returns settings', async () => {
    const res = await request(app).get('/api/verification/rewards');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('level1');
    expect(res.body).toHaveProperty('level2');
  });

  test('GET /api/verification/status returns unverified initially', async () => {
    const { token } = await registerUser('verifytest');
    const res = await request(app)
      .get('/api/verification/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.verified).toBe(false);
  });
});
