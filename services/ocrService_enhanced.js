/**
 * Enhanced OCR Service with Image Preprocessing
 * Includes multiple filters to improve text recognition accuracy
 */

const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

class EnhancedOCRService {
    constructor() {
        this.confidenceThreshold = 70;
        this.processingStats = {
            totalProcessed: 0,
            successful: 0,
            failed: 0,
            preprocessingTime: 0,
            ocrTime: 0
        };
    }

    /**
     * Process uploaded document with image preprocessing and OCR
     */
    async processDocument(filePath, userInfo) {
        const startTime = Date.now();
        
        try {
            console.log(`🔍 [ENHANCED OCR] Starting processing for: ${filePath}`);
            this.processingStats.totalProcessed++;
            
            // Check if file exists
            try {
                await fs.access(filePath);
            } catch (error) {
                throw new Error(`File not found: ${filePath}`);
            }

            // Try multiple preprocessing approaches
            const preprocessingResults = await this.tryMultiplePreprocessing(filePath, userInfo);
            
            // Find the best result
            const bestResult = this.selectBestResult(preprocessingResults);
            
            this.processingStats.successful++;
            
            const totalTime = Date.now() - startTime;
            console.log(`🔍 [ENHANCED OCR] Total processing time: ${totalTime}ms`);
            
            return {
                ...bestResult,
                processingTime: totalTime,
                preprocessingResults: preprocessingResults.map(r => ({
                    method: r.method,
                    confidence: r.confidence,
                    textLength: r.extractedText?.length || 0
                }))
            };
            
        } catch (error) {
            console.error('🔍 [ENHANCED OCR] Processing error:', error);
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
     * Try multiple preprocessing approaches and return all results
     */
    async tryMultiplePreprocessing(filePath, userInfo) {
        const preprocessingMethods = [
            { name: 'original', description: 'No preprocessing' },
            { name: 'grayscale', description: 'Grayscale conversion' },
            { name: 'enhanced', description: 'Grayscale + contrast + sharpening' },
            { name: 'threshold', description: 'Binary threshold' },
            { name: 'adaptive', description: 'Adaptive threshold + noise reduction' },
            { name: 'high_contrast', description: 'High contrast + gamma correction' }
        ];

        const results = [];
        
        for (const method of preprocessingMethods) {
            try {
                console.log(`🔍 [ENHANCED OCR] Trying method: ${method.name} - ${method.description}`);
                
                const preprocessStart = Date.now();
                const processedImagePath = await this.preprocessImage(filePath, method.name);
                const preprocessTime = Date.now() - preprocessStart;
                
                const ocrStart = Date.now();
                const ocrResult = await this.performOCR(processedImagePath, userInfo);
                const ocrTime = Date.now() - ocrStart;
                
                // Clean up processed image if it's different from original
                if (processedImagePath !== filePath) {
                    try {
                        await fs.unlink(processedImagePath);
                    } catch (cleanupError) {
                        console.warn('🔍 [ENHANCED OCR] Cleanup warning:', cleanupError.message);
                    }
                }
                
                results.push({
                    method: method.name,
                    description: method.description,
                    preprocessTime,
                    ocrTime,
                    ...ocrResult
                });
                
                console.log(`🔍 [ENHANCED OCR] Method ${method.name} - Confidence: ${ocrResult.confidence}%, Text length: ${ocrResult.extractedText?.length || 0}`);
                
            } catch (error) {
                console.error(`🔍 [ENHANCED OCR] Method ${method.name} failed:`, error.message);
                results.push({
                    method: method.name,
                    description: method.description,
                    success: false,
                    error: error.message,
                    confidence: 0,
                    extractedText: '',
                    extractedInfo: {}
                });
            }
        }
        
        return results;
    }

    /**
     * Preprocess image based on method
     */
    async preprocessImage(inputPath, method) {
        if (method === 'original') {
            return inputPath;
        }

        const ext = path.extname(inputPath);
        const outputPath = inputPath.replace(ext, `_${method}${ext}`);
        
        try {
            let pipeline = sharp(inputPath);
            
            switch (method) {
                case 'grayscale':
                    pipeline = pipeline.grayscale();
                    break;
                    
                case 'enhanced':
                    pipeline = pipeline
                        .grayscale()
                        .normalize()
                        .sharpen({ sigma: 1, m1: 0.5, m2: 2 })
                        .modulate({ contrast: 1.2 });
                    break;
                    
                case 'threshold':
                    pipeline = pipeline
                        .grayscale()
                        .normalize()
                        .threshold(128);
                    break;
                    
                case 'adaptive':
                    pipeline = pipeline
                        .grayscale()
                        .normalize()
                        .blur(0.3)  // Slight blur to reduce noise
                        .sharpen({ sigma: 1, m1: 0.5, m2: 2 })
                        .modulate({ contrast: 1.3 });
                    break;
                    
                case 'high_contrast':
                    pipeline = pipeline
                        .grayscale()
                        .normalize()
                        .gamma(0.8)  // Gamma correction
                        .modulate({ contrast: 1.5, brightness: 1.1 })
                        .sharpen({ sigma: 1.5, m1: 0.5, m2: 3 });
                    break;
                    
                default:
                    pipeline = pipeline.grayscale();
            }
            
            await pipeline.png().toFile(outputPath);
            return outputPath;
            
        } catch (error) {
            console.error(`🔍 [ENHANCED OCR] Preprocessing failed for method ${method}:`, error);
            return inputPath; // Fall back to original
        }
    }

    /**
     * Perform OCR on preprocessed image
     */
    async performOCR(imagePath, userInfo) {
        try {
            // Enhanced Tesseract configuration for better accuracy
            const ocrResult = await Tesseract.recognize(imagePath, 'eng', {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log(`🔍 [ENHANCED OCR] OCR Progress: ${Math.round(m.progress * 100)}%`);
                    }
                },
                tessedit_pageseg_mode: Tesseract.PSM.AUTO,
                tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-.,: ',
                preserve_interword_spaces: '1'
            });
            
            // Extract student information
            const extractedInfo = this.extractStudentInfo(ocrResult.data.text, userInfo);
            
            // Calculate confidence with detailed analysis
            const confidenceResult = this.calculateConfidence(ocrResult, extractedInfo);
            
            return {
                success: true,
                confidence: confidenceResult.confidence,
                extractedText: ocrResult.data.text,
                extractedInfo: extractedInfo,
                autoApproved: confidenceResult.isAcceptable,
                requiresReview: !confidenceResult.isAcceptable,
                ocrConfidence: ocrResult.data.confidence || 0,
                wordCount: ocrResult.data.words?.length || 0,
                failureReasons: confidenceResult.failureReasons,
                confidenceDetails: confidenceResult.details
            };
            
        } catch (error) {
            console.error('🔍 [ENHANCED OCR] OCR processing error:', error);
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
     * Select the best result from multiple preprocessing attempts
     */
    selectBestResult(results) {
        console.log('🔍 [ENHANCED OCR] Selecting best result from', results.length, 'attempts');
        
        // Filter successful results
        const successfulResults = results.filter(r => r.success !== false);
        
        if (successfulResults.length === 0) {
            console.log('🔍 [ENHANCED OCR] No successful results, returning first attempt');
            return results[0] || {
                success: false,
                error: 'All preprocessing methods failed',
                confidence: 0,
                extractedText: '',
                extractedInfo: {},
                autoApproved: false,
                requiresReview: true
            };
        }
        
        // Score each result based on multiple factors
        const scoredResults = successfulResults.map(result => {
            let score = 0;
            
            // OCR confidence (40% weight)
            score += (result.confidence || 0) * 0.4;
            
            // Text length (longer usually means more content detected) (20% weight)
            const textLength = result.extractedText?.length || 0;
            score += Math.min(textLength / 10, 20) * 0.2;
            
            // Matching success (40% weight)
            const matches = result.extractedInfo?.matches || {};
            let matchScore = 0;
            if (matches.studentId) matchScore += 20;
            if (matches.name) matchScore += 15;
            if (matches.university) matchScore += 5;
            score += matchScore * 0.4;
            
            console.log(`🔍 [ENHANCED OCR] Method ${result.method}: Score=${score.toFixed(1)}, Confidence=${result.confidence}%, Matches=${JSON.stringify(matches)}`);
            
            return { ...result, score };
        });
        
        // Sort by score (highest first)
        scoredResults.sort((a, b) => b.score - a.score);
        
        const bestResult = scoredResults[0];
        console.log(`🔍 [ENHANCED OCR] Best method: ${bestResult.method} (${bestResult.description}) with score ${bestResult.score.toFixed(1)}`);
        
        return bestResult;
    }

    // ============================
    // Helpers: normalization & fuzzy
    // ============================
    normalizeText(str) {
        return (str || '')
            .toUpperCase()
            .normalize('NFD').replace(/\p{Diacritic}/gu, '')
            .replace(/[^A-Z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    normalizeDigits(str) {
        if (!str) return '';
        // Map common OCR lookalikes to digits, then keep digits only
        const map = {
            'O': '0', 'Q': '0', 'D': '0',
            'I': '1', 'L': '1', 'l': '1',
            'Z': '2',
            'S': '5',
            'B': '8',
            'G': '6',
            'T': '7'
        };
        const up = String(str).toUpperCase();
        let out = '';
        for (const ch of up) {
            if (/[0-9]/.test(ch)) out += ch;
            else if (map[ch]) out += map[ch];
        }
        return out;
    }

    levenshtein(a, b) {
        const m = a.length, n = b.length;
        if (m === 0) return n;
        if (n === 0) return m;
        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + cost
                );
            }
        }
        return dp[m][n];
    }

    tokenNearIncludes(haystack, needle) {
        // Exact presence
        if (haystack.includes(needle)) return true;
        // Simple fuzzy: allow one edit in contiguous haystack substrings of same length
        for (let i = 0; i <= haystack.length - needle.length; i++) {
            const seg = haystack.slice(i, i + needle.length);
            if (this.levenshtein(seg, needle) <= 1) return true;
        }
        return false;
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
            },
            nearMatches: {
                studentId: false,
                name: false
            },
            nameTokensMatched: 0,
            nameTokensTotal: 0
        };

        if (!text) return info;

        const cleanText = this.normalizeText(text);
        const cleanNoSpaces = cleanText.replace(/\s+/g, '');
        
        console.log('🔍 [ENHANCED OCR] Clean text for processing:', cleanText.substring(0, 200) + '...');
        console.log('🔍 [ENHANCED OCR] User info for matching:', userInfo);
        
        // Look for student ID patterns
        const studentIdPatterns = [
            /\b\d{2}-\d{4}\b/g,        // 00-0000
            /\b\d{4}-\d{4}\b/g,        // 0000-0000
            /\b\d{8}\b/g,               // 00000000
            /\b\d{2}-\d{4}-\d{2}\b/g,   // 00-0000-00
            /\b\d{2}\s*-\s*\d{4}\b/g,   // 00 - 0000 (with spaces)
            /\b\d{2}\s+\d{4}\b/g        // 00 0000 (space separated)
        ];

        for (const pattern of studentIdPatterns) {
            const matches = cleanText.match(pattern);
            if (matches) {
                info.studentId = matches[0];
                const ocrDigits = this.normalizeDigits(matches[0]);
                const userDigits = this.normalizeDigits((userInfo.student_id || userInfo.student_no || ''));
                if (ocrDigits && userDigits) {
                    if (ocrDigits === userDigits) {
                        info.matches.studentId = true;
                    } else if (ocrDigits.length === userDigits.length && this.levenshtein(ocrDigits, userDigits) <= 1) {
                        info.nearMatches.studentId = true;
                    }
                }
                
                console.log('🔍 [ENHANCED OCR] Student ID found:', matches[0]);
                console.log('🔍 [ENHANCED OCR] OCR digits:', ocrDigits);
                console.log('🔍 [ENHANCED OCR] User digits:', userDigits);
                console.log('🔍 [ENHANCED OCR] ID Match:', info.matches.studentId, 'Near:', info.nearMatches.studentId);
                break;
            }
        }

        // Look for name matches (prefer DB/user-provided full name first)
        let nameToMatch = null;
        let nameSource = 'user_input';

        if (userInfo.full_name) {
            nameToMatch = userInfo.full_name;
            nameSource = 'user_input';
            console.log('🔍 [ENHANCED OCR] Using user-provided name:', nameToMatch);
        } else if (userInfo.email && userInfo.email.includes('@plv.edu.ph')) {
            const emailLocalPart = userInfo.email.split('@')[0];
            if (emailLocalPart.includes('.')) {
                const emailNameParts = emailLocalPart.split('.').map(part => 
                    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
                );
                nameToMatch = emailNameParts.join(' ');
            } else {
                nameToMatch = emailLocalPart.charAt(0).toUpperCase() + emailLocalPart.slice(1).toLowerCase();
            }
            nameSource = 'plv_email';
            console.log('🔍 [ENHANCED OCR] Extracted name from PLV email:', nameToMatch);
        }
        
        if (nameToMatch) {
            const normalizedName = this.normalizeText(nameToMatch);
            let nameParts = normalizedName.split(' ').filter(part => part.length > 1);
            // Remove suffix tokens at the end if present
            const suffixes = new Set(['JR', 'SR', 'II', 'III', 'IV']);
            while (nameParts.length > 1 && suffixes.has(nameParts[nameParts.length - 1])) {
                nameParts.pop();
            }
            const first = nameParts[0];
            const last = nameParts[nameParts.length - 1];

            let tokenMatches = 0;
            let firstMatch = false;
            let lastMatch = false;

            console.log('🔍 [ENHANCED OCR] Name parts to match:', nameParts);

            for (const part of nameParts) {
                const partNoSpace = part.replace(/\s+/g, '');
                const found = this.tokenNearIncludes(cleanText, part) || this.tokenNearIncludes(cleanNoSpaces, partNoSpace);
                if (found) {
                    tokenMatches++;
                    if (part === first) firstMatch = true;
                    if (part === last) lastMatch = true;
                    console.log('🔍 [ENHANCED OCR] ✓ Found/near name part:', part);
                } else {
                    console.log('🔍 [ENHANCED OCR] ✗ Missing name part:', part);
                }
            }

            info.nameTokensMatched = tokenMatches;
            info.nameTokensTotal = nameParts.length;

            // Consider a strong name match if first AND last names are present
            info.matches.name = firstMatch && lastMatch;
            info.nearMatches.name = !info.matches.name && tokenMatches > 0;
            if (info.matches.name || info.nearMatches.name) {
                info.name = nameToMatch;
                info.nameSource = nameSource;
            }

            console.log('🔍 [ENHANCED OCR] Name Match Result:', info.matches.name ? '✓ STRONG' : (info.nearMatches.name ? '△ PARTIAL' : '✗ FAILED'));
        }

        // Look for university indicators
        const universityKeywords = ['PLV', 'PAMANTASAN', 'LUNGSOD', 'VALENZUELA', 'UNIVERSITY', 'UNIBERSIDAD'];
        for (const keyword of universityKeywords) {
            if (cleanText.includes(keyword)) {
                info.matches.university = true;
                info.university = 'PLV';
                console.log('🔍 [ENHANCED OCR] University keyword found:', keyword);
                break;
            }
        }

        return info;
    }

    /**
     * Calculate overall confidence score and generate failure reasons
     */
    calculateConfidence(ocrResult, extractedInfo) {
        let confidence = 0;
        const failureReasons = [];
        const details = {
            ocrQuality: 0,
            studentIdMatch: false,
            nameMatch: false,
            universityMatch: false
        };
        
        // OCR confidence (40% weight)
        if (ocrResult.data && ocrResult.data.confidence) {
            details.ocrQuality = ocrResult.data.confidence;
            confidence += (ocrResult.data.confidence * 0.4);
            if (ocrResult.data.confidence < 70) {
                failureReasons.push(`Poor image quality (${Math.round(ocrResult.data.confidence)}% OCR confidence). Please upload a clearer image.`);
            }
        } else {
            confidence += 30;
            details.ocrQuality = 30;
            failureReasons.push('Unable to determine image quality. Please upload a clearer image.');
        }
        
        // Student ID match (30% weight)
        if (extractedInfo.matches.studentId) {
            confidence += 30;
            details.studentIdMatch = true;
        } else if (extractedInfo.nearMatches && extractedInfo.nearMatches.studentId) {
            confidence += 15; // partial credit for near ID match
            failureReasons.push('Student ID appears close but not exact. Please ensure the ID number is clearly visible.');
        } else {
            if (extractedInfo.studentId) {
                failureReasons.push(`Student ID mismatch. Found "${extractedInfo.studentId}" but expected your registered ID.`);
            } else {
                failureReasons.push('Student ID not found in document. Please ensure your ID number is clearly visible.');
            }
        }
        
        // Name match (20% weight)
        if (extractedInfo.matches.name) {
            confidence += 20;
            details.nameMatch = true;
            details.nameSource = extractedInfo.nameSource;
        } else if (extractedInfo.nearMatches && extractedInfo.nearMatches.name) {
            confidence += 10; // partial credit for partial/fuzzy name match
            failureReasons.push('Name partially matched. Please upload a clearer image showing your full name.');
        } else {
            failureReasons.push('Name not found in document. Please ensure your full name is clearly visible.');
        }
        
        // University match (10% weight)
        if (extractedInfo.matches.university) {
            confidence += 10;
            details.universityMatch = true;
        } else {
            failureReasons.push('University identifier (PLV) not found. Please ensure this is a valid PLV document.');
        }
        
        const finalConfidence = Math.min(Math.round(confidence), 100);
        
        console.log('🔍 [ENHANCED OCR] Confidence calculation:', {
            finalConfidence,
            details,
            failureReasons
        });
        
        return {
            confidence: finalConfidence,
            details,
            failureReasons,
            // Keep auto-approval strict: require solid ID + name
            isAcceptable: finalConfidence >= 70 && details.studentIdMatch && details.nameMatch
        };
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
module.exports = new EnhancedOCRService();
