# Testing Guide - Registration with OCR ID Verification

## Quick Start Testing

### 1. Database Setup
```bash
# Run the updated schema
mysql -u root -p plv_book_exchange < database/schema.sql
```

### 2. Start the Server
```bash
npm start
# or
node server.js
```

### 3. Test Registration Flow

#### Step 1: Register a New User
1. Open http://localhost:3000 (or your server port)
2. Click "Register" button
3. Fill in the registration form:
   - **First Name:** Juan
   - **Last Name:** Dela Cruz
   - **Email:** juan.delacruz@plv.edu.ph
   - **Student ID:** 21-1234
   - **Program:** BS Information Technology
   - **Password:** Test123!@#
   - **Confirm Password:** Test123!@#
4. Click "Register"

**Expected Result:** 
- Success message: "Registration successful! Please verify your account."
- Verification choice dialog appears

#### Step 2: Choose Verification Method
1. Click "Upload Student ID" button

**Expected Result:**
- Document upload modal appears

#### Step 3: Upload Student ID
1. Select front ID image (clear photo of PLV student ID)
2. Optionally select back ID image
3. Click "Upload & Verify"

**Expected Result:**
- Processing indicator shows
- One of two outcomes:
  - **Auto-approved:** "✓ Verification successful! Your account is now verified."
  - **Pending review:** "Documents uploaded! Admin review in progress."

## Test Cases

### Test Case 1: Successful Auto-Verification
**Prerequisites:**
- Clear, well-lit photo of PLV Student ID
- Student ID number matches registration (21-1234)
- Name on ID matches email format (Juan Dela Cruz)

**Steps:**
1. Register with email: juan.delacruz@plv.edu.ph
2. Upload clear ID photo
3. Wait for processing

**Expected:**
- Confidence score >= 70%
- Auto-approved = true
- User status = 'verified'
- Success message displayed

### Test Case 2: Pending Review (Low Confidence)
**Prerequisites:**
- Blurry or poor quality ID photo
- OR name/ID doesn't match exactly

**Steps:**
1. Register normally
2. Upload poor quality ID photo
3. Wait for processing

**Expected:**
- Confidence score < 70%
- Auto-approved = false
- User status = 'pending_review'
- Pending review message displayed

### Test Case 3: Registration Validation
**Test PLV Email Validation:**
```
❌ test@gmail.com → Should fail
❌ test@yahoo.com → Should fail
✅ test@plv.edu.ph → Should pass
```

**Test Student ID Format:**
```
❌ 211234 → Should fail
❌ 21-12345 → Should fail
❌ 2-1234 → Should fail
✅ 21-1234 → Should pass
✅ 20-5678 → Should pass
```

**Test Password Strength:**
```
❌ test123 → Too weak (no uppercase, no special)
❌ Test123 → Too weak (no special char)
❌ Test! → Too short
✅ Test123! → Should pass
✅ SecurePass123! → Should pass
```

### Test Case 4: Duplicate Registration
**Steps:**
1. Register user with email: test@plv.edu.ph
2. Try to register again with same email
3. Try to register with same student ID

**Expected:**
- Error message: "User already exists and is verified"
- OR if not verified: "Registration updated! Please choose your verification method."

### Test Case 5: File Upload Validation
**Test File Types:**
```
✅ image.jpg → Should accept
✅ image.png → Should accept
✅ document.pdf → Should accept
❌ document.docx → Should reject
❌ video.mp4 → Should reject
```

**Test File Sizes:**
```
✅ 1MB file → Should accept
✅ 4.9MB file → Should accept
❌ 6MB file → Should reject
```

## API Testing with Postman/cURL

### 1. Register User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@plv.edu.ph",
    "student_no": "21-1234",
    "fname": "Test",
    "lname": "User",
    "password": "Test123!",
    "course": "BSIT",
    "year": 1
  }'
```

**Expected Response:**
```json
{
  "message": "Registration successful! Please choose your verification method.",
  "userId": 1,
  "email": "test@plv.edu.ph",
  "requiresVerification": true
}
```

### 2. Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@plv.edu.ph",
    "password": "Test123!"
  }'
```

**Expected Response:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "test@plv.edu.ph",
    "student_no": "21-1234",
    "fname": "Test",
    "lname": "User"
  }
}
```

### 3. Upload Documents
```bash
curl -X POST http://localhost:3000/api/verification/upload-documents \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "frontId=@/path/to/front-id.jpg" \
  -F "backId=@/path/to/back-id.jpg"
```

**Expected Response (Auto-Approved):**
```json
{
  "success": true,
  "message": "Documents verified successfully! Your account is now verified.",
  "verificationId": 1,
  "combinedConfidence": 85.5,
  "autoApproved": true,
  "requiresReview": false,
  "status": "verified",
  "failureReasons": [],
  "confidenceDetails": {
    "ocrQuality": 90,
    "studentIdMatch": true,
    "nameMatch": true,
    "universityMatch": true
  }
}
```

**Expected Response (Pending Review):**
```json
{
  "success": true,
  "message": "Verification pending: Student ID not found in document. Please ensure your ID number is clearly visible.",
  "verificationId": 1,
  "combinedConfidence": 45.2,
  "autoApproved": false,
  "requiresReview": true,
  "status": "pending_review",
  "failureReasons": [
    "Student ID not found in document. Please ensure your ID number is clearly visible."
  ]
}
```

## Database Verification

### Check User Registration
```sql
SELECT id, email, student_no, fname, lname, is_verified, verification_status, verification_method
FROM users
WHERE email = 'test@plv.edu.ph';
```

### Check Verification Documents
```sql
SELECT 
    id, 
    user_id, 
    status, 
    auto_approved, 
    combined_confidence,
    front_confidence,
    back_confidence,
    created_at
FROM verification_documents
WHERE user_id = 1;
```

### Check OCR Results
```sql
SELECT 
    id,
    front_ocr_text,
    front_extracted_info,
    status
FROM verification_documents
WHERE user_id = 1;
```

## Common Issues & Solutions

### Issue 1: "File not found" Error
**Cause:** Upload directory doesn't exist
**Solution:** 
```bash
mkdir -p uploads/verification
```

### Issue 2: OCR Processing Fails
**Cause:** Tesseract.js not properly initialized
**Solution:** 
- Check console for Tesseract download progress
- Ensure internet connection for first-time setup
- Clear node_modules and reinstall: `npm install`

### Issue 3: Auto-Login Fails After Registration
**Cause:** User not verified yet, login requires verification
**Solution:** 
- This is expected behavior
- User must complete verification first
- Or temporarily set `is_verified` check to allow unverified login

### Issue 4: Low OCR Confidence
**Cause:** Poor image quality
**Solution:**
- Use clear, well-lit photos
- Ensure ID is flat and not at an angle
- Use higher resolution images
- Try uploading both front and back

### Issue 5: Name Mismatch
**Cause:** Name format in email doesn't match ID
**Solution:**
- Use PLV email format: firstname.lastname@plv.edu.ph
- Ensure name on ID matches registration
- Check for middle names or suffixes

## Performance Testing

### Expected Processing Times
- Image preprocessing: 500-1500ms per method
- OCR processing: 2000-5000ms per image
- Total processing (6 methods): 15-30 seconds

### Optimization Tips
1. Reduce preprocessing methods if too slow
2. Use only best-performing methods
3. Implement caching for repeated uploads
4. Consider async processing with job queue

## Security Testing

### Test Authentication
```bash
# Try upload without token
curl -X POST http://localhost:3000/api/verification/upload-documents \
  -F "frontId=@/path/to/id.jpg"
# Expected: 401 Unauthorized
```

### Test File Type Bypass
```bash
# Try uploading executable
curl -X POST http://localhost:3000/api/verification/upload-documents \
  -H "Authorization: Bearer TOKEN" \
  -F "frontId=@malicious.exe"
# Expected: 400 Bad Request - File type not allowed
```

### Test SQL Injection
```bash
# Try SQL injection in registration
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@plv.edu.ph",
    "student_no": "21-1234'\'' OR 1=1--",
    "fname": "Test",
    "lname": "User",
    "password": "Test123!",
    "course": "BSIT"
  }'
# Expected: Should be safely escaped
```

## Success Criteria

✅ **Registration:**
- User can register with valid PLV email
- Password requirements enforced
- Student ID format validated
- Duplicate prevention works

✅ **Document Upload:**
- Files upload successfully
- OCR processes documents
- Confidence scores calculated
- Results stored in database

✅ **Auto-Verification:**
- High-quality IDs auto-approved
- Low-quality IDs pending review
- Appropriate messages displayed

✅ **Security:**
- Authentication required for uploads
- File type validation works
- File size limits enforced
- SQL injection prevented

## Troubleshooting Commands

```bash
# Check server logs
tail -f logs/server.log

# Check MySQL errors
tail -f /var/log/mysql/error.log

# Test database connection
mysql -u root -p -e "USE plv_book_exchange; SHOW TABLES;"

# Check uploaded files
ls -lh uploads/verification/

# Monitor OCR processing
# Watch console output for OCR debug messages
```

---

## Daily Check-in Testing

The daily check-in API includes unit tests that mock authentication and database calls to validate core behaviors without requiring a live MySQL instance.

- Disabled feature guard returns HTTP 403.
- Duplicate same-day claim returns HTTP 400 without changing credits.

Run only the daily check-in tests:

```
powershell
npm test -- -t "Daily Check-in API"
```

Configure daily check-in settings in the `settings` table:

```
powershell
node .\add-checkin-settings.js
```

Defaults configured by the script:
- `daily_checkin_enabled`: `true`
- `daily_checkin_reward_day_1_6`: `5`
- `daily_checkin_reward_day_7`: `20`
```

## Next Steps After Testing

1. ✅ Verify all test cases pass
2. ✅ Check database records are correct
3. ✅ Confirm OCR accuracy is acceptable
4. ✅ Test with real PLV Student IDs
5. ✅ Gather user feedback
6. 🔄 Implement improvements based on results
7. 🔄 Add admin review dashboard
8. 🔄 Implement email OTP verification
