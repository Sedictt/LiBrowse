/**
 * OCR Service for Document Verification
 * Simplified version for immediate functionality
 */

const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs').promises;

class OCRService {
    constructor() {
        this.confidenceThreshold = 70;
        this.processingStats = {
            totalProcessed: 0,
            successful: 0,
            failed: 0
        };
    }

    /**
     * Process uploaded document and extract text using OCR
     * @param {string} filePath - Path to uploaded file
     * @param {Object} userInfo - User registration information
     * @returns {Object} OCR results with confidence and extracted data
     */
    async processDocument(filePath, userInfo) {
        try {
            console.log(`Starting OCR processing for file: ${filePath}`);
            this.processingStats.totalProcessed++;
            
            // Check if file exists
            try {
                await fs.access(filePath);
            } catch (error) {
                throw new Error(`File not found: ${filePath}`);
            }

            // Perform OCR using Tesseract
            const ocrResult = await Tesseract.recognize(filePath, 'eng', {
                logger: m => console.log('OCR Progress:', m)
            });
            
            // Extract student information
            const extractedInfo = this.extractStudentInfo(ocrResult.data.text, userInfo);
            
            // Calculate confidence
            const confidence = this.calculateConfidence(ocrResult, extractedInfo);
            
            this.processingStats.successful++;
            
            return {
                success: true,
                confidence: confidence,
                extractedText: ocrResult.data.text,
                extractedInfo: extractedInfo,
                autoApproved: confidence >= this.confidenceThreshold,
                requiresReview: confidence < this.confidenceThreshold,
                processingTime: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('OCR processing error:', error);
            this.processingStats.failed++;
            return {
                success: false,
                error: error.message,
                confidence: 0,
                extractedText: '',
                extractedInfo: {},
                autoApproved: false,
                requiresReview: true
            };
        }
    }

    /**
     * Extract student information from OCR text
     */
    extractStudentInfo(text, userInfo) {
        const info = {
            studentId: null,
            name: null,
            university: null,
            matches: {
                studentId: false,
                name: false,
                university: false
            }
        };

        if (!text) return info;

        const cleanText = text.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ');
        
        // Look for student ID patterns
        const studentIdPatterns = [
            /\b\d{4}-\d{4}\b/g,
            /\b\d{8}\b/g,
            /\b\d{2}-\d{4}-\d{2}\b/g
        ];

        for (const pattern of studentIdPatterns) {
            const matches = cleanText.match(pattern);
            if (matches) {
                info.studentId = matches[0];
                info.matches.studentId = userInfo.student_id && 
                    matches[0].replace(/[^0-9]/g, '') === userInfo.student_id.replace(/[^0-9]/g, '');
                break;
            }
        }

        // Look for name matches
        if (userInfo.full_name) {
            const nameParts = userInfo.full_name.toUpperCase().split(' ');
            let nameMatches = 0;
            
            for (const part of nameParts) {
                if (part.length > 2 && cleanText.includes(part)) {
                    nameMatches++;
                }
            }
            
            info.matches.name = nameMatches >= Math.ceil(nameParts.length / 2);
            if (info.matches.name) {
                info.name = userInfo.full_name;
            }
        }

        // Look for university indicators
        const universityKeywords = ['PLV', 'PAMANTASAN', 'LUNGSOD', 'VALENZUELA', 'UNIVERSITY'];
        for (const keyword of universityKeywords) {
            if (cleanText.includes(keyword)) {
                info.matches.university = true;
                info.university = 'PLV';
                break;
            }
        }

        return info;
    }

    /**
     * Calculate overall confidence score
     */
    calculateConfidence(ocrResult, extractedInfo) {
        let confidence = 0;
        
        // OCR confidence (40% weight)
        if (ocrResult.data && ocrResult.data.confidence) {
            confidence += (ocrResult.data.confidence * 0.4);
        } else {
            confidence += 30; // Base confidence if no OCR confidence available
        }
        
        // Student ID match (30% weight)
        if (extractedInfo.matches.studentId) {
            confidence += 30;
        }
        
        // Name match (20% weight)
        if (extractedInfo.matches.name) {
            confidence += 20;
        }
        
        // University match (10% weight)
        if (extractedInfo.matches.university) {
            confidence += 10;
        }
        
        return Math.min(Math.round(confidence), 100);
    }

    /**
     * Get processing statistics
     */
    getProcessingStats() {
        return {
            ...this.processingStats,
            successRate: this.processingStats.totalProcessed > 0 
                ? (this.processingStats.successful / this.processingStats.totalProcessed * 100).toFixed(2)
                : 0
        };
    }
}

// Export singleton instance
module.exports = new OCRService();
                success: false,
                error: error.message,
                confidence: 0,
                autoApproved: false,
                requiresReview: true
            };
        }
    }

    /**
     * Validate uploaded file format and size
     */
    async validateFile(filePath) {
        const stats = await fs.stat(filePath);
        
        // Check file size
        if (stats.size > this.maxFileSize) {
            throw new Error(`File size exceeds maximum limit of ${this.maxFileSize / (1024 * 1024)}MB`);
        }
        
        // Check file format
        const ext = path.extname(filePath).toLowerCase().substring(1);
        if (!this.supportedFormats.includes(ext)) {
            throw new Error(`Unsupported file format. Supported formats: ${this.supportedFormats.join(', ')}`);
        }
        
        return true;
    }

    /**
     * Preprocess image to improve OCR accuracy
     */
    async preprocessImage(filePath) {
        const processedPath = filePath.replace(/\.[^/.]+$/, '_processed.png');
        
        try {
            // Use Sharp for image preprocessing
            await sharp(filePath)
                .resize(1200, null, { 
                    withoutEnlargement: true,
                    fit: 'inside'
                })
                .greyscale()
                .normalize()
                .sharpen()
                .png({ quality: 90 })
                .toFile(processedPath);
                
            return processedPath;
        } catch (error) {
            console.error('Image preprocessing error:', error);
            // Fallback to original file if preprocessing fails
            return filePath;
        }
    }

    /**
     * Perform OCR using Tesseract
     */
    async performOCR(imagePath) {
        console.log('Performing OCR on processed image...');
        
        const result = await Tesseract.recognize(
            imagePath,
            'eng', // English language
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                    }
                },
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-. ',
                tessedit_pageseg_mode: Tesseract.PSM.AUTO
            }
        );
        
        console.log(`OCR completed with confidence: ${result.data.confidence}%`);
        return result;
    }

    /**
     * Extract student information from OCR text
     */
    async extractStudentInfo(ocrText, userInfo) {
        const extractedInfo = {
            studentId: null,
            name: null,
            university: null,
            confidence: {
                studentId: 0,
                name: 0,
                university: 0
            }
        };

        // Clean OCR text
        const cleanText = ocrText.replace(/[^\w\s-\.]/g, ' ').replace(/\s+/g, ' ').trim();
        console.log('Cleaned OCR Text:', cleanText);

        // Extract Student ID (PLV format: typically numbers with dashes)
        const studentIdPatterns = [
            /(\d{2,4}[-\s]?\d{4,6}[-\s]?\d{2,4})/g, // General pattern
            /(\d{8,12})/g, // Continuous numbers
            /(PLV[-\s]?\d+)/gi, // PLV prefix
            /(\d{4}[-\s]\d{4}[-\s]\d{4})/g // Specific format
        ];

        for (const pattern of studentIdPatterns) {
            const matches = cleanText.match(pattern);
            if (matches) {
                const candidateId = matches[0].replace(/\s/g, '');
                if (this.validateStudentId(candidateId, userInfo.studentId)) {
                    extractedInfo.studentId = candidateId;
                    extractedInfo.confidence.studentId = 85;
                    break;
                }
            }
        }

        // Extract Name (look for capitalized words)
        const namePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
        const nameMatches = cleanText.match(namePattern);
        if (nameMatches) {
            for (const nameCandidate of nameMatches) {
                if (this.validateName(nameCandidate, userInfo.fullName)) {
                    extractedInfo.name = nameCandidate;
                    extractedInfo.confidence.name = 80;
                    break;
                }
            }
        }

        // Extract University information
        const universityPatterns = [
            /pamantasan\s+ng\s+lungsod\s+ng\s+valenzuela/gi,
            /PLV/gi,
            /valenzuela/gi,
            /pamantasan/gi
        ];

        for (const pattern of universityPatterns) {
            if (pattern.test(cleanText)) {
                extractedInfo.university = 'Pamantasan ng Lungsod ng Valenzuela';
                extractedInfo.confidence.university = 90;
                break;
            }
        }

        return extractedInfo;
    }

    /**
     * Validate extracted student ID against user input
     */
    validateStudentId(extractedId, userInputId) {
        if (!extractedId || !userInputId) return false;
        
        // Remove all non-alphanumeric characters for comparison
        const cleanExtracted = extractedId.replace(/[^a-zA-Z0-9]/g, '');
        const cleanInput = userInputId.replace(/[^a-zA-Z0-9]/g, '');
        
        // Check for exact match or partial match (at least 70% similarity)
        if (cleanExtracted === cleanInput) return true;
        
        const similarity = this.calculateStringSimilarity(cleanExtracted, cleanInput);
        return similarity >= 0.7;
    }

    /**
     * Validate extracted name against user input
     */
    validateName(extractedName, userInputName) {
        if (!extractedName || !userInputName) return false;
        
        const cleanExtracted = extractedName.toLowerCase().replace(/[^a-z\s]/g, '');
        const cleanInput = userInputName.toLowerCase().replace(/[^a-z\s]/g, '');
        
        // Check if any part of the name matches
        const extractedParts = cleanExtracted.split(/\s+/);
        const inputParts = cleanInput.split(/\s+/);
        
        let matchCount = 0;
        for (const inputPart of inputParts) {
            if (inputPart.length > 2) { // Only check meaningful name parts
                for (const extractedPart of extractedParts) {
                    if (extractedPart.includes(inputPart) || inputPart.includes(extractedPart)) {
                        matchCount++;
                        break;
                    }
                }
            }
        }
        
        return matchCount >= Math.min(2, inputParts.length * 0.6);
    }

    /**
     * Calculate string similarity using Levenshtein distance
     */
    calculateStringSimilarity(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));

        for (let i = 0; i <= len1; i++) matrix[0][i] = i;
        for (let j = 0; j <= len2; j++) matrix[j][0] = j;

        for (let j = 1; j <= len2; j++) {
            for (let i = 1; i <= len1; i++) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + indicator
                );
            }
        }

        const distance = matrix[len2][len1];
        return 1 - distance / Math.max(len1, len2);
    }

    /**
     * Calculate overall confidence score
     */
    calculateConfidence(ocrResult, extractedInfo) {
        const ocrConfidence = ocrResult.data.confidence || 0;
        const studentIdConfidence = extractedInfo.confidence.studentId || 0;
        const nameConfidence = extractedInfo.confidence.name || 0;
        const universityConfidence = extractedInfo.confidence.university || 0;

        // Weighted average with higher weight on student ID
        const weights = {
            ocr: 0.3,
            studentId: 0.4,
            name: 0.2,
            university: 0.1
        };

        const weightedScore = 
            (ocrConfidence * weights.ocr) +
            (studentIdConfidence * weights.studentId) +
            (nameConfidence * weights.name) +
            (universityConfidence * weights.university);

        return Math.round(weightedScore);
    }

    /**
     * Clean up temporary files
     */
    async cleanup(filePath) {
        try {
            if (filePath.includes('_processed')) {
                await fs.unlink(filePath);
                console.log('Cleaned up processed image file');
            }
        } catch (error) {
            console.warn('Failed to cleanup processed image:', error.message);
        }
    }

    /**
     * Get OCR processing statistics
     */
    getProcessingStats() {
        return {
            confidenceThreshold: this.confidenceThreshold,
            supportedFormats: this.supportedFormats,
            maxFileSize: this.maxFileSize,
            version: '1.0.0'
        };
    }
}

module.exports = new OCRService();
