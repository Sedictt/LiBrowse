const request = require('supertest');

// Ensure JWT secret is consistent across auth generator and middleware
process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';

const app = require('../server');

/**
 * Helper to register and login a new user
 */
async function registerAndLogin(suffix) {
  const email = `verify.test+${suffix}@plv.edu.ph`;
  const body = {
    email,
    student_no: `21-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
    fname: 'Verify',
    lname: 'Tester',
    password: 'Test1234!',
    course: 'BSIT',
    year: 2
  };

  const reg = await request(app).post('/api/auth/register').send(body);
  expect([200, 201]).toContain(reg.statusCode);

  const login = await request(app).post('/api/auth/login').send({ email, password: body.password });
  expect(login.statusCode).toBe(200);
  const token = login.body.token;
  expect(token).toBeTruthy();

  const profile = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${token}`);
  expect(profile.statusCode).toBe(200);
  const userId = profile.body?.user?.id;
  
  return { token, email, userId, user: profile.body?.user };
}

/**
 * Helper to get user credits
 */
async function getCredits(token) {
  const profile = await request(app)
    .get('/api/auth/profile')
    .set('Authorization', `Bearer ${token}`);
  expect(profile.statusCode).toBe(200);
  return profile.body?.user?.credits ?? 0;
}

/**
 * Helper to get verification reward settings
 */
async function getRewardSettings() {
  const res = await request(app).get('/api/verification/rewards');
  expect(res.statusCode).toBe(200);
  return res.body;
}

describe('Verification Rewards System', () => {
  jest.setTimeout(90000);

  describe('GET /api/verification/rewards', () => {
    test('returns verification reward settings', async () => {
      const rewards = await getRewardSettings();
      
      expect(rewards).toHaveProperty('level1');
      expect(rewards).toHaveProperty('level2');
      expect(rewards).toHaveProperty('enabled');
      expect(rewards).toHaveProperty('totalPossible');
      
      expect(rewards.level1).toHaveProperty('name', 'Verified');
      expect(rewards.level1).toHaveProperty('credits');
      expect(typeof rewards.level1.credits).toBe('number');
      
      expect(rewards.level2).toHaveProperty('name', 'Fully Verified');
      expect(rewards.level2).toHaveProperty('credits');
      expect(typeof rewards.level2.credits).toBe('number');
      
      expect(rewards.totalPossible).toBe(rewards.level1.credits + rewards.level2.credits);
    });

    test('returns default reward values (15 + 15 = 30)', async () => {
      const rewards = await getRewardSettings();
      
      // Default values
      expect(rewards.level1.credits).toBe(15);
      expect(rewards.level2.credits).toBe(15);
      expect(rewards.totalPossible).toBe(30);
    });
  });

  describe('Email Verification Rewards', () => {
    test('new users start unverified with 100 credits', async () => {
      const suffix = Date.now();
      const { user } = await registerAndLogin(suffix);
      
      expect(user.credits).toBe(100);
      expect(user.is_verified).toBeFalsy();
      expect(user.email_verified).toBeFalsy();
    });

    // Note: Full email verification flow requires email OTP which is complex to test
    // These tests would need mocking or a test-specific bypass
  });

  describe('Verification Status Endpoint', () => {
    test('GET /api/verification/status returns verification state', async () => {
      const suffix = Date.now();
      const { token } = await registerAndLogin(suffix);
      
      const res = await request(app)
        .get('/api/verification/status')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('verified');
      expect(res.body.verified).toBe(false); // New user should not be verified
    });
  });

  describe('Reward Level Descriptions', () => {
    test('level 1 reward description explains Verified status', async () => {
      const rewards = await getRewardSettings();
      expect(rewards.level1.description).toContain('email');
      expect(rewards.level1.description.toLowerCase()).toContain('or');
      expect(rewards.level1.description).toContain('document');
    });

    test('level 2 reward description explains Fully Verified status', async () => {
      const rewards = await getRewardSettings();
      expect(rewards.level2.description.toLowerCase()).toContain('both');
      expect(rewards.level2.description).toContain('email');
      expect(rewards.level2.description).toContain('document');
    });
  });
});

describe('Verification Reward Logic', () => {
  // These tests verify the expected behavior of the reward system
  // Note: Full integration tests would require database setup for OTP verification
  
  test('reward system is designed for two-tier verification', async () => {
    const rewards = await getRewardSettings();
    
    // Should have two distinct levels
    expect(rewards.level1.name).not.toBe(rewards.level2.name);
    
    // Level 1 should be "Verified" (either method)
    expect(rewards.level1.name).toBe('Verified');
    
    // Level 2 should be "Fully Verified" (both methods)
    expect(rewards.level2.name).toBe('Fully Verified');
    
    // Both levels should have positive credit rewards
    expect(rewards.level1.credits).toBeGreaterThan(0);
    expect(rewards.level2.credits).toBeGreaterThan(0);
  });

  test('total possible rewards equals sum of both levels', async () => {
    const rewards = await getRewardSettings();
    expect(rewards.totalPossible).toBe(rewards.level1.credits + rewards.level2.credits);
  });
});
