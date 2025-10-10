const request = require("supertest");
const app = require("../server");         // ✅ correct (assuming server.js is at root)


describe("Auth Module", () => {
  test("should register a new user", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "sab", password: "1234" });

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toMatch(/success/i);
  });

  test("should not register an existing user", async () => {
    await request(app)
      .post("/auth/register")
      .send({ username: "sab", password: "1234" });

    const res = await request(app)
      .post("/auth/register")
      .send({ username: "sab", password: "1234" });

    expect(res.statusCode).toBe(400);
  });

  test("should login with correct credentials", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ username: "sab", password: "1234" });

    expect(res.statusCode).toBe(200);
  });
});
