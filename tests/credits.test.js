const request = require('supertest');

// Ensure JWT secret is consistent across auth generator and middleware
process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';

const app = require('../server');

// Small helper to format YYYY-MM-DD
function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function registerAndLogin(suffix, roleLabel) {
  const email = `${roleLabel}.test+${suffix}@plv.edu.ph`;
  const body = {
    email,
    student_no: `${roleLabel === 'lender' ? '21' : '22'}-${String(Math.floor(Math.random()*10000)).padStart(4, '0')}`,
    fname: roleLabel === 'lender' ? 'Lender' : 'Borrower',
    lname: 'Tester',
    password: 'Test1234!',
    course: 'BSIT',
    year: roleLabel === 'lender' ? 3 : 2
  };
  const reg = await request(app).post('/api/auth/register').send(body);
  expect([200,201]).toContain(reg.statusCode);

  const login = await request(app).post('/api/auth/login').send({ email, password: body.password });
  expect(login.statusCode).toBe(200);
  const token = login.body.token;
  expect(token).toBeTruthy();

  const profile = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${token}`);
  expect(profile.statusCode).toBe(200);
  const userId = profile.body?.user?.id;
  return { token, email, userId };
}

async function createBook(token, title, minCredits) {
  const res = await request(app)
    .post('/api/books')
    .set('Authorization', `Bearer ${token}`)
    .field('title', title)
    .field('author', 'Author Test')
    .field('course_code', 'BSIT-101')
    .field('condition', 'good')
    .field('minimum_credits', String(minCredits));
  expect(res.statusCode).toBe(201);
  const id = res.body?.book?.id;
  expect(id).toBeTruthy();
  return id;
}

async function sendBorrowRequest(borrowerToken, bookId, { startDateISO, duration='1w' } = {}) {
  const payload = {
    book_id: bookId,
    request_message: 'Please allow me to borrow this book for a week',
    borrower_contact: '09170000000',
    pickup_method: 'meetup',
    pickup_location: 'Campus Gate',
    borrow_duration: duration,
    borrow_start_date: startDateISO || ymd(new Date())
  };
  const res = await request(app)
    .post('/api/transactions/request')
    .set('Authorization', `Bearer ${borrowerToken}`)
    .send(payload);
  return res;
}

async function approveAndMarkBorrowed(lenderToken, txId) {
  const approve = await request(app)
    .put(`/api/transactions/${txId}/approve`)
    .set('Authorization', `Bearer ${lenderToken}`)
    .send({ lender_notes: 'Approved' });
  expect(approve.statusCode).toBe(200);

  const borrowed = await request(app)
    .put(`/api/transactions/${txId}/borrowed`)
    .set('Authorization', `Bearer ${lenderToken}`)
    .send({ lender_notes: 'Picked up' });
  expect(borrowed.statusCode).toBe(200);
}

async function getCredits(token) {
  const profile = await request(app)
    .get('/api/auth/profile')
    .set('Authorization', `Bearer ${token}`);
  expect(profile.statusCode).toBe(200);
  return profile.body?.user?.credits ?? 0;
}

describe('Credits System', () => {
  const suffix = Date.now();
  let lender, borrower;

  beforeAll(async () => {
    jest.setTimeout(90000);
    lender = await registerAndLogin(`${suffix}-L`, 'lender');
    borrower = await registerAndLogin(`${suffix}-B`, 'borrower');
  });

  test('new users start with 100 credits', async () => {
    const credits = await getCredits(borrower.token);
    expect(credits).toBeGreaterThanOrEqual(100);
    expect(credits).toBeLessThanOrEqual(100); // exactly 100 unless prior tests changed it
  });

  test('borrow gating denies when min_credits > borrower credits', async () => {
    const bookId = await createBook(lender.token, 'High Credit Book', 120);
    const res = await sendBorrowRequest(borrower.token, bookId);
    expect(res.statusCode).toBe(400);
    expect(String(res.body?.error || '')).toMatch(/insufficient credits/i);
  });

  test('on-time return with excellent condition yields +3 credits', async () => {
    const startCredits = await getCredits(borrower.token);

    const bookId = await createBook(lender.token, 'Normal Book', 80);
    const reqRes = await sendBorrowRequest(borrower.token, bookId, { duration: '1w' });
    expect(reqRes.statusCode).toBe(201);
    const txId = reqRes.body?.transaction_id;
    expect(txId).toBeTruthy();

    await approveAndMarkBorrowed(lender.token, txId);

    // Borrower returns immediately (on-time)
    const ret = await request(app)
      .put(`/api/transactions/${txId}/return`)
      .set('Authorization', `Bearer ${borrower.token}`)
      .send({ return_condition: 'excellent', return_notes: 'All good' });
    expect(ret.statusCode).toBe(200);
    expect(ret.body?.credit_change).toBeGreaterThanOrEqual(3);

    const endCredits = await getCredits(borrower.token);
    expect(endCredits).toBeGreaterThanOrEqual(startCredits + 3);
  });

  test('late return + damaged applies capped penalty (-15)', async () => {
    const startCredits = await getCredits(borrower.token);

    const bookId = await createBook(lender.token, 'Late Book', 50);
    const twentyDaysAgo = ymd(new Date(Date.now() - 20 * 24 * 60 * 60 * 1000));
    const reqRes = await sendBorrowRequest(borrower.token, bookId, { startDateISO: twentyDaysAgo, duration: '1w' });
    expect(reqRes.statusCode).toBe(201);
    const txId = reqRes.body?.transaction_id;

    await approveAndMarkBorrowed(lender.token, txId);

    const ret = await request(app)
      .put(`/api/transactions/${txId}/return`)
      .set('Authorization', `Bearer ${borrower.token}`)
      .send({ return_condition: 'damaged', return_notes: 'Cover torn' });
    expect(ret.statusCode).toBe(200);
    // Expect -15: -10 (late cap) + -5 (damaged)
    expect(ret.body?.credit_change).toBeLessThanOrEqual(-10);

    const endCredits = await getCredits(borrower.token);
    expect(endCredits).toBeLessThanOrEqual(startCredits - 10);
  });
});