const express = require('express');
const request = require('supertest');

// 1. Mock dependencies BEFORE importing routes
const mockDb = {
  getOne: jest.fn(),
  executeQuery: jest.fn()
};

jest.mock('../config/database', () => mockDb);

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_secret'),
  compare: jest.fn().mockResolvedValue(true) // Always match password
}));

jest.mock('../services/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue({ ok: true })
}));

// Mock axios for CAPTCHA
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ data: { success: true } })
}));

// 2. Import router
const authRouter = require('../routes/auth');

// 3. Helper to create app
const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter); // Mount at /auth to match test paths
  return app;
};

describe("Auth Module", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
  });

  describe("POST /auth/register", () => {
    test("should register a new user", async () => {
      // Mock: User does not exist
      mockDb.getOne.mockResolvedValueOnce(null);
      // Mock: Insert successful
      mockDb.executeQuery.mockResolvedValueOnce({ insertId: 1 });

      const res = await request(app)
        .post("/auth/register")
        .send({
          email: "new.student@plv.edu.ph",
          student_no: "21-0001",
          fname: "New",
          lname: "Student",
          password: "password123",
          course: "BSIT"
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.message).toMatch(/success/i);
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO users/),
        expect.any(Array)
      );
    });

    test("should not register an existing verified user", async () => {
      // Mock: User exists and is verified
      mockDb.getOne.mockResolvedValueOnce({ id: 1, is_verified: true });

      const res = await request(app)
        .post("/auth/register")
        .send({
          email: "existing@plv.edu.ph",
          student_no: "21-0002",
          fname: "Existing",
          lname: "User",
          password: "password123",
          course: "BSIT"
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/already exists/i);
    });

    test("should fail with invalid email domain", async () => {
      const res = await request(app)
        .post("/auth/register")
        .send({
          email: "test@gmail.com", // Invalid domain
          student_no: "21-0003",
          fname: "Test",
          lname: "User",
          password: "password123",
          course: "BSIT"
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/PLV email/i);
    });
  });

  describe("POST /auth/login", () => {
    test("should login with correct credentials", async () => {
      // Mock: User found
      const mockUser = {
        id: 1,
        email: "student@plv.edu.ph",
        pass_hash: "hashed_secret",
        is_verified: 1
      };
      mockDb.getOne.mockResolvedValueOnce(mockUser);
      // Mock: Update token success
      mockDb.executeQuery.mockResolvedValueOnce({});

      const res = await request(app)
        .post("/auth/login")
        .send({ email: "student@plv.edu.ph", password: "password123" });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("token");
      expect(res.body.user.email).toBe("student@plv.edu.ph");
    });

    test("should fail login if user not found", async () => {
      // Mock: User not found
      mockDb.getOne.mockResolvedValueOnce(null);

      const res = await request(app)
        .post("/auth/login")
        .send({ email: "unknown@plv.edu.ph", password: "password123" });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/Invalid email/i);
    });
  });
});
