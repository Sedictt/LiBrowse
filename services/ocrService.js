/**
 * OCR Service for Document Verification
 * Simplified working version
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
                logger: m => console.log('OCR Progress:', m.status, m.progress)
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
