const express = require('express');
const request = require('supertest');

// Mock auth to inject a user
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => { req.user = { id: 123 }; next(); }
}));

// Create controllable mocks for database
const mockDb = {
  transaction: async (callback) => {
    const conn = { execute: jest.fn().mockResolvedValue([{}]) };
    return callback(conn);
  },
  getOne: jest.fn(),
  executeQuery: jest.fn()
};

jest.mock('../config/database', () => mockDb);

const dailyCheckinRouter = require('../routes/dailyCheckin');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/daily-checkin', dailyCheckinRouter);
  return app;
};

describe('Daily Check-in API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('claim returns 403 when feature disabled', async () => {
    // First getOne call returns disabled setting
    mockDb.getOne.mockResolvedValueOnce({ setting_val: 'false' });

    const app = makeApp();
    const res = await request(app)
      .post('/api/daily-checkin/claim')
      .set('Authorization', 'Bearer test')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/disabled/i);
  });

  test('duplicate claim same day returns 400 and does not update credits', async () => {
    // enabled
    mockDb.getOne.mockResolvedValueOnce({ setting_val: 'true' }); // enabled
    mockDb.getOne.mockResolvedValueOnce({ setting_val: '+08:00' }); // timezone offset
    mockDb.getOne.mockResolvedValueOnce({ id: 99 }); // already claimed today

    const app = makeApp();
    const res = await request(app)
      .post('/api/daily-checkin/claim')
      .set('Authorization', 'Bearer test')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already claimed/i);
  });
});
