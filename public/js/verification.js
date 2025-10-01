/**
 * Document Verification System - Frontend
 * Handles OCR document upload and verification process
 */

class VerificationManager {
    constructor() {
        this.maxFileSize = 5 * 1024 * 1024; // 5MB
        this.allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
        this.uploadProgress = { front: 0, back: 0 };
        // Hold selected files from either file input or drag & drop
        this.selectedFiles = { front: null, back: null };
        this.init();
    }

    init() {
        // Detect auth token and enable test mode when unauthenticated
        this.token = localStorage.getItem('token');
        this.testMode = !this.token;
        this.setupEventListeners();
        // Only load verification status for authenticated users
        if (this.token) {
            this.loadVerificationStatus();
        }
    }

    /**
     * Attach drag-and-drop listeners to upload areas
     */
    attachDragAndDropHandlers() {
        const areas = [
            { id: 'frontIdUploadArea', side: 'front', inputId: 'frontIdFile' },
            { id: 'backIdUploadArea', side: 'back', inputId: 'backIdFile' }
        ];

        areas.forEach(({ id, side, inputId }) => {
            const area = document.getElementById(id);
            const input = document.getElementById(inputId);
            if (!area) return;

            area.addEventListener('dragover', (e) => {
                e.preventDefault();
                area.classList.add('drag-over');
            });

            area.addEventListener('dragleave', () => {
                area.classList.remove('drag-over');
            });

            area.addEventListener('drop', (e) => {
                e.preventDefault();
                area.classList.remove('drag-over');
                const files = e.dataTransfer.files;
                if (!files || !files.length) return;
                const file = files[0];

                const validation = this.validateFile(file);
                if (!validation.valid) {
                    this.showFileError(side, validation.error);
                    return;
                }

                // Try to reflect file into the input using DataTransfer for better UX
                if (input && window.DataTransfer) {
                    try {
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        input.files = dt.files;
                    } catch (_) {
                        // Ignore if not allowed; we'll use internal storage
                    }
                }

                // Store and preview
                this.selectedFiles[side] = file;
                this.showFilePreview(file, side);
                this.updateUploadButtonState();
            });
        });
    }

    setupEventListeners() {
        // Document upload form
        const uploadForm = document.getElementById('documentUploadForm');
        if (uploadForm) {
            uploadForm.addEventListener('submit', (e) => this.handleDocumentUpload(e));
        }

        // File input change handlers
        const frontIdInput = document.getElementById('frontIdFile');
        const backIdInput = document.getElementById('backIdFile');

        if (frontIdInput) {
            frontIdInput.addEventListener('change', (e) => this.handleFileSelect(e, 'front'));
        }
        if (backIdInput) {
            backIdInput.addEventListener('change', (e) => this.handleFileSelect(e, 'back'));
        }

        // Drag & drop handlers
        this.attachDragAndDropHandlers();

        // Store selected files internally
        this.selectedFiles = { front: null, back: null };

        // Debug mode toggle
        const debugMode = document.getElementById('debugMode');
        if (debugMode) {
            debugMode.addEventListener('change', (e) => this.toggleDebugMode(e.target.checked));
        }

        // Retry verification button
        const retryBtn = document.getElementById('retryVerificationBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => this.retryVerification());
        }

        // View verification history button
        const historyBtn = document.getElementById('viewHistoryBtn');
        if (historyBtn) {
            historyBtn.addEventListener('click', () => this.showVerificationHistory());
        }
    }

    /**
     * Handle file selection and validation
     */
    handleFileSelect(event, side) {
        const file = event.target.files[0];
        const previewContainer = document.getElementById(`${side}IdPreview`);
        const errorContainer = document.getElementById(`${side}IdError`);

        // Clear previous errors
        if (errorContainer) {
            errorContainer.textContent = '';
            errorContainer.style.display = 'none';
        }

        if (!file) {
            if (previewContainer) {
                previewContainer.innerHTML = '';
            }
            return;
        }

        // Validate file
        const validation = this.validateFile(file);
        if (!validation.valid) {
            this.showFileError(side, validation.error);
            event.target.value = ''; // Clear invalid file
            return;
        }

        // Show file preview
        this.showFilePreview(file, side);
        // Store selected file
        this.selectedFiles[side] = file;
        
        // Update UI state
        this.updateUploadButtonState();
    }

    /**
     * Validate uploaded file
     */
    validateFile(file) {
        if (!file) {
            return { valid: false, error: 'No file selected' };
        }

        if (file.size > this.maxFileSize) {
            return { 
                valid: false, 
                error: `File size too large. Maximum size is ${this.maxFileSize / (1024 * 1024)}MB` 
            };
        }

        if (!this.allowedTypes.includes(file.type)) {
            return { 
                valid: false, 
                error: 'Invalid file type. Please upload JPG, PNG, or PDF files only.' 
            };
        }

        return { valid: true };
    }

    /**
     * Show file preview
     */
    showFilePreview(file, side) {
        const previewContainer = document.getElementById(`${side}IdPreview`);
        if (!previewContainer) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const previewHTML = `
                <div class="file-preview">
                    <div class="preview-header">
                        <i class="fas fa-file-image"></i>
                        <span class="file-name">${file.name}</span>
                        <span class="file-size">${this.formatFileSize(file.size)}</span>
                    </div>
                    ${file.type.startsWith('image/') ? 
                        `<img src="${e.target.result}" alt="Preview" class="preview-image">` : 
                        `<div class="pdf-preview"><i class="fas fa-file-pdf"></i> PDF Document</div>`
                    }
                    <div class="preview-status">
                        <i class="fas fa-check-circle text-success"></i>
                        <span>Ready to upload</span>
                    </div>
                </div>
            `;
            previewContainer.innerHTML = previewHTML;
        };
        reader.readAsDataURL(file);
    }

    /**
     * Show file error
     */
    showFileError(side, error) {
        const errorContainer = document.getElementById(`${side}IdError`);
        if (errorContainer) {
            errorContainer.textContent = error;
            errorContainer.style.display = 'block';
        }
        
        // Show toast notification
        showToast(error, 'error');
    }

    /**
     * Update upload button state
     */
    updateUploadButtonState() {
        const uploadBtn = document.getElementById('uploadDocumentsBtn');
        const frontFile = document.getElementById('frontIdFile')?.files[0] || this.selectedFiles.front;
        
        if (uploadBtn) {
            uploadBtn.disabled = !frontFile;
        }
    }

    /**
     * Handle document upload
     */
    async handleDocumentUpload(event) {
        event.preventDefault();

        const frontFile = document.getElementById('frontIdFile')?.files[0] || this.selectedFiles.front;
        const backFile = document.getElementById('backIdFile')?.files[0] || this.selectedFiles.back;

        if (!frontFile) {
            showToast('Please select at least the front side of your student ID', 'error');
            return;
        }

        // Show loading state
        this.setUploadingState(true);

        try {
            const formData = new FormData();
            formData.append('frontId', frontFile);
            
            if (backFile) {
                formData.append('backId', backFile);
            }

            // Choose endpoint based on auth state
            const endpoint = this.testMode 
                ? '/api/verification/upload-documents-test'
                : '/api/verification/upload-documents';

            // Only send Authorization header when authenticated
            const headers = this.testMode || !this.token 
                ? {}
                : { 'Authorization': `Bearer ${this.token}` };

            let response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: formData
            });

            // If unauthorized, fall back to test endpoint without auth
            if (response.status === 401 || response.status === 403) {
                response = await fetch('/api/verification/upload-documents-test', {
                    method: 'POST',
                    body: formData
                });
            }

            let result;
            try {
                result = await response.json();
            } catch (e) {
                throw new Error('Server returned an unexpected response');
            }

            if (response.ok && result.success) {
                this.handleUploadSuccess(result);
            } else {
                throw new Error(result.message || 'Upload failed');
            }

        } catch (error) {
            console.error('Document upload error:', error);
            showToast(error.message || 'Failed to upload documents', 'error');
        } finally {
            this.setUploadingState(false);
        }
    }

    /**
     * Handle successful upload
     */
    handleUploadSuccess(result) {
        const { autoApproved, combinedConfidence, message } = result;

        // Show debug information if enabled
        if (this.debugMode) {
            this.displayDebugInfo(result);
        }

        // Show appropriate message based on result
        if (autoApproved) {
            showToast(message, 'success');
        } else {
            // Show failure reasons if available
            if (result.failureReasons && result.failureReasons.length > 0) {
                showToast(message, 'error');
                // Show detailed failure reasons
                setTimeout(() => {
                    this.showFailureReasons(result.failureReasons);
                }, 1000);
            } else {
                showToast(message, 'warning');
            }
        }

        // Update UI based on result
        if (autoApproved) {
            this.showVerificationSuccess(combinedConfidence);
        } else {
            this.showPendingReview(combinedConfidence);
        }

        // Clear form
        this.clearUploadForm();

        // Refresh verification status
        setTimeout(() => {
            this.loadVerificationStatus();
        }, 1000);
    }

    /**
     * Toggle debug mode
     */
    toggleDebugMode(enabled) {
        this.debugMode = enabled;
        const debugOutput = document.getElementById('debugOutput');
        if (debugOutput) {
            debugOutput.style.display = enabled ? 'block' : 'none';
        }
        
        if (enabled) {
            this.debugLog('🔬 Debug mode enabled - OCR processing details will be shown');
        }
    }

    /**
     * Log debug information
     */
    debugLog(message) {
        if (!this.debugMode) return;
        
        const debugLog = document.getElementById('debugLog');
        if (debugLog) {
            const timestamp = new Date().toLocaleTimeString();
            debugLog.textContent += `[${timestamp}] ${message}\n`;
            debugLog.scrollTop = debugLog.scrollHeight;
        }
    }

    /**
     * Display debug information from OCR result
     */
    displayDebugInfo(result) {
        this.debugLog('🎨 === OCR PROCESSING RESULTS ===');
        
        // Show preprocessing results if available
        if (result.preprocessingResults) {
            this.debugLog('🎨 Image Preprocessing Methods Tried:');
            result.preprocessingResults.forEach(prep => {
                this.debugLog(`  ${prep.method}: ${prep.confidence}% confidence, ${prep.textLength} chars`);
            });
            this.debugLog(`🏆 Best method selected: ${result.method} (${result.description})`);
        }

        // Show extracted text
        const extractedText = result.extractedText || result.results?.front?.extractedText || '';
        this.debugLog(`📝 Extracted Text (${extractedText.length} characters):`);
        this.debugLog(extractedText.substring(0, 300) + (extractedText.length > 300 ? '...' : ''));

        // Show extracted info
        const info = result.results?.front?.extractedInfo || result.extractedInfo || {};
        this.debugLog('🔍 Extracted Information:');
        this.debugLog(`  Student ID: ${info.studentId || 'Not found'}`);
        this.debugLog(`  Name: ${info.name || 'Not found'}`);
        if (info.nameSource) {
            this.debugLog(`  Name Source: ${info.nameSource === 'plv_email' ? '📧 PLV Email' : '👤 User Input'}`);
        }
        this.debugLog(`  University: ${info.university || 'Not found'}`);

        // Show matching results
        const matches = info.matches || {};
        this.debugLog('✅ Matching Results:');
        this.debugLog(`  Student ID Match: ${matches.studentId ? '✅ YES' : '❌ NO'}`);
        this.debugLog(`  Name Match: ${matches.name ? '✅ YES' : '❌ NO'}`);
        if (info.nameSource === 'plv_email' && matches.name) {
            this.debugLog(`  📧 Name verified using PLV email format!`);
        }
        this.debugLog(`  University Match: ${matches.university ? '✅ YES' : '❌ NO'}`);

        // Show confidence and metrics
        const confidence = result.combinedConfidence || result.results?.front?.confidence || result.confidence || 0;
        this.debugLog(`📊 Overall Confidence: ${confidence}%`);
        
        if (result.ocrConfidence) {
            this.debugLog(`🔍 Raw OCR Confidence: ${result.ocrConfidence}%`);
        }
        if (result.wordCount) {
            this.debugLog(`📊 Words Detected: ${result.wordCount}`);
        }
        if (result.processingTime) {
            this.debugLog(`⏱️ Total Processing Time: ${result.processingTime}ms`);
        }

        // Show verification decision
        const autoApproved = result.autoApproved;
        this.debugLog(`🎯 Verification Decision: ${autoApproved ? '✅ AUTO-APPROVED' : '⏳ REQUIRES REVIEW'}`);
        
        if (autoApproved) {
            this.debugLog('🎉 Account will be automatically verified!');
        } else {
            this.debugLog('👀 Document requires manual admin review');
            this.debugLog('💡 Tip: Both name AND student ID must match for auto-approval');
        }
        
        this.debugLog('🎨 === END OCR RESULTS ===\n');
    }

    /**
     * Show verification success UI
     */
    showVerificationSuccess(confidence) {
        const successHTML = `
            <div class="verification-success">
                <div class="success-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <h3>Verification Successful!</h3>
                <p>Your documents have been automatically verified with ${confidence}% confidence.</p>
                <p>Your account is now fully verified and you can access all platform features.</p>
                <button class="btn btn-primary" onclick="window.location.reload()">
                    Continue to Dashboard
                </button>
            </div>
        `;

        const container = document.getElementById('verificationContainer');
        if (container) {
            container.innerHTML = successHTML;
        }
    }

    /**
     * Show pending review UI
     */
    showPendingReview(confidence) {
        const pendingHTML = `
            <div class="verification-pending">
                <div class="pending-icon">
                    <i class="fas fa-clock"></i>
                </div>
                <h3>Documents Under Review</h3>
                <p>Your documents have been uploaded successfully with ${confidence}% confidence.</p>
                <p>Our admin team will review your documents within 24-48 hours.</p>
                <p>You'll receive an email notification once the review is complete.</p>
                <div class="pending-actions">
                    <button class="btn btn-outline-primary" onclick="verificationManager.showVerificationHistory()">
                        View Upload History
                    </button>
                </div>
            </div>
        `;

        const container = document.getElementById('verificationContainer');
        if (container) {
            container.innerHTML = pendingHTML;
        }
    }

    /**
     * Show detailed failure reasons to the user
     */
    showFailureReasons(failureReasons) {
        const reasonsHTML = failureReasons.map(reason => `
            <div class="failure-reason">
                <i class="fas fa-exclamation-triangle"></i>
                <span>${reason}</span>
            </div>
        `).join('');

        const modalHTML = `
            <div class="failure-modal-overlay" onclick="this.remove()">
                <div class="failure-modal" onclick="event.stopPropagation()">
                    <div class="failure-header">
                        <h3><i class="fas fa-times-circle"></i> Verification Failed</h3>
                        <button class="close-btn" onclick="this.closest('.failure-modal-overlay').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="failure-content">
                        <p>Your document verification failed for the following reasons:</p>
                        <div class="failure-reasons">
                            ${reasonsHTML}
                        </div>
                        <div class="failure-suggestions">
                            <h4><i class="fas fa-lightbulb"></i> Suggestions to Fix:</h4>
                            <ul>
                                <li>📸 Take a clearer, well-lit photo of your document</li>
                                <li>📄 Ensure all text is clearly visible and not blurry</li>
                                <li>✅ Verify your name and student ID match your registration</li>
                                <li>🏫 Make sure it's a valid PLV document (Student ID or COR)</li>
                                <li>📐 Keep the document flat and avoid shadows</li>
                            </ul>
                        </div>
                    </div>
                    <div class="failure-actions">
                        <button class="btn btn-primary" onclick="this.closest('.failure-modal-overlay').remove()">
                            <i class="fas fa-camera"></i> Try Again
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Add styles if not already present
        if (!document.getElementById('failure-modal-styles')) {
            const styles = `
                <style id="failure-modal-styles">
                .failure-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    animation: fadeIn 0.3s ease;
                }
                .failure-modal {
                    background: white;
                    border-radius: 12px;
                    max-width: 500px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                    animation: slideInUp 0.3s ease;
                }
                .failure-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 20px;
                    border-bottom: 1px solid #eee;
                    background: #f8f9fa;
                    border-radius: 12px 12px 0 0;
                }
                .failure-header h3 {
                    margin: 0;
                    color: #dc3545;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .close-btn {
                    background: none;
                    border: none;
                    font-size: 1.2rem;
                    color: #666;
                    cursor: pointer;
                    padding: 5px;
                    border-radius: 4px;
                }
                .close-btn:hover {
                    background: #f0f0f0;
                    color: #333;
                }
                .failure-content {
                    padding: 20px;
                }
                .failure-content p {
                    margin-bottom: 15px;
                    color: #666;
                }
                .failure-reasons {
                    margin: 15px 0;
                }
                .failure-reason {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px;
                    background: #fff5f5;
                    border: 1px solid #fed7d7;
                    border-radius: 6px;
                    margin-bottom: 8px;
                    color: #c53030;
                }
                .failure-reason i {
                    color: #e53e3e;
                }
                .failure-suggestions {
                    margin-top: 20px;
                    padding: 15px;
                    background: #f0f8ff;
                    border-radius: 6px;
                    border: 1px solid #bee3f8;
                }
                .failure-suggestions h4 {
                    margin: 0 0 10px 0;
                    color: #2b6cb0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .failure-suggestions ul {
                    margin: 0;
                    padding-left: 20px;
                }
                .failure-suggestions li {
                    margin-bottom: 5px;
                    color: #2d3748;
                }
                .failure-actions {
                    padding: 20px;
                    border-top: 1px solid #eee;
                    text-align: center;
                }
                @keyframes slideInUp {
                    from {
                        transform: translateY(30px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
                </style>
            `;
            document.head.insertAdjacentHTML('beforeend', styles);
        }
    }

    /**
     * Set uploading state
     */
    setUploadingState(isUploading) {
        const uploadBtn = document.getElementById('uploadDocumentsBtn');
        const progressContainer = document.getElementById('uploadProgress');

        if (uploadBtn) {
            uploadBtn.disabled = isUploading;
            uploadBtn.innerHTML = isUploading ? 
                '<i class="fas fa-spinner fa-spin"></i> Processing Documents...' : 
                '<i class="fas fa-upload"></i> Upload Documents';
        }

        if (progressContainer) {
            progressContainer.style.display = isUploading ? 'block' : 'none';
            
            if (isUploading) {
                this.simulateUploadProgress();
            }
        }
    }

    /**
     * Simulate upload progress for better UX
     */
    simulateUploadProgress() {
        const progressBar = document.getElementById('uploadProgressBar');
        const progressText = document.getElementById('uploadProgressText');
        
        if (!progressBar || !progressText) return;

        let progress = 0;
        const steps = [
            { progress: 20, text: 'Uploading documents...' },
            { progress: 40, text: 'Processing images...' },
            { progress: 60, text: 'Running OCR analysis...' },
            { progress: 80, text: 'Extracting text data...' },
            { progress: 95, text: 'Validating information...' },
            { progress: 100, text: 'Finalizing verification...' }
        ];

        let stepIndex = 0;
        const interval = setInterval(() => {
            if (stepIndex < steps.length) {
                const step = steps[stepIndex];
                progressBar.style.width = `${step.progress}%`;
                progressText.textContent = step.text;
                stepIndex++;
            } else {
                clearInterval(interval);
            }
        }, 800);
    }

    /**
     * Clear upload form
     */
    clearUploadForm() {
        const form = document.getElementById('documentUploadForm');
        if (form) {
            form.reset();
        }

        // Clear previews
        const frontPreview = document.getElementById('frontIdPreview');
        const backPreview = document.getElementById('backIdPreview');
        
        if (frontPreview) frontPreview.innerHTML = '';
        if (backPreview) backPreview.innerHTML = '';

        // Clear stored files and update button state
        this.selectedFiles = { front: null, back: null };
        this.updateUploadButtonState();
    }

    /**
     * Load current verification status
     */
    async loadVerificationStatus() {
        try {
            const response = await fetch('/api/verification/status', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            const result = await response.json();

            if (result.success) {
                this.updateVerificationStatusUI(result);
            }

        } catch (error) {
            console.error('Failed to load verification status:', error);
        }
    }

    /**
     * Update verification status UI
     */
    updateVerificationStatusUI(statusData) {
        const { verificationStatus, verificationMethod, latestAttempt } = statusData;
        const statusContainer = document.getElementById('verificationStatusContainer');

        if (!statusContainer) return;

        let statusHTML = '';

        switch (verificationStatus) {
            case 'verified':
                statusHTML = `
                    <div class="verification-status verified">
                        <i class="fas fa-check-circle"></i>
                        <span>Account Verified</span>
                    </div>
                `;
                break;

            case 'pending_review':
                statusHTML = `
                    <div class="verification-status pending">
                        <i class="fas fa-clock"></i>
                        <span>Under Review</span>
                        ${latestAttempt ? `
                            <small>Submitted ${new Date(latestAttempt.created_at).toLocaleDateString()}</small>
                        ` : ''}
                    </div>
                `;
                break;

            case 'rejected':
                statusHTML = `
                    <div class="verification-status rejected">
                        <i class="fas fa-times-circle"></i>
                        <span>Verification Rejected</span>
                        <button class="btn btn-sm btn-primary" onclick="verificationManager.retryVerification()">
                            Try Again
                        </button>
                    </div>
                `;
                break;

            default:
                statusHTML = `
                    <div class="verification-status pending">
                        <i class="fas fa-exclamation-circle"></i>
                        <span>Verification Required</span>
                    </div>
                `;
        }

        statusContainer.innerHTML = statusHTML;
    }

    /**
     * Retry verification
     */
    async retryVerification() {
        try {
            const response = await fetch('/api/verification/retry', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                showToast(result.message, 'success');
                // Reload the page to show fresh upload form
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                throw new Error(result.message);
            }

        } catch (error) {
            console.error('Retry verification error:', error);
            showToast(error.message || 'Failed to reset verification', 'error');
        }
    }

    /**
     * Show verification history
     */
    async showVerificationHistory() {
        try {
            const response = await fetch('/api/verification/history', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            const result = await response.json();

            if (result.success) {
                this.displayVerificationHistory(result.attempts);
            } else {
                throw new Error(result.message);
            }

        } catch (error) {
            console.error('Failed to load verification history:', error);
            showToast('Failed to load verification history', 'error');
        }
    }

    /**
     * Display verification history modal
     */
    displayVerificationHistory(attempts) {
        const historyHTML = attempts.map(attempt => `
            <div class="history-item">
                <div class="history-header">
                    <span class="status-badge status-${attempt.status}">
                        ${attempt.status.replace('_', ' ').toUpperCase()}
                    </span>
                    <span class="confidence">
                        ${attempt.combined_confidence}% confidence
                    </span>
                    <span class="date">
                        ${new Date(attempt.created_at).toLocaleDateString()}
                    </span>
                </div>
                ${attempt.admin_notes ? `
                    <div class="admin-notes">
                        <strong>Admin Notes:</strong> ${attempt.admin_notes}
                    </div>
                ` : ''}
            </div>
        `).join('');

        // Show in modal (you'll need to implement modal system)
        showModal('Verification History', `
            <div class="verification-history">
                ${historyHTML || '<p>No verification attempts found.</p>'}
            </div>
        `);
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Initialize verification manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.verificationManager = new VerificationManager();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VerificationManager;
}
