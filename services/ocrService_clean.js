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
        
        console.log('🔬 [OCR DEBUG] Clean text for processing:', cleanText.substring(0, 200) + '...');
        console.log('🔬 [OCR DEBUG] User info for matching:', userInfo);
        
        // Look for student ID patterns
        const studentIdPatterns = [
            /\b\d{2}-\d{4}\b/g,        // 00-0000
            /\b\d{4}-\d{4}\b/g,        // 0000-0000
            /\b\d{8}\b/g,               // 00000000
            /\b\d{2}-\d{4}-\d{2}\b/g   // 00-0000-00
        ];

        for (const pattern of studentIdPatterns) {
            const matches = cleanText.match(pattern);
            if (matches) {
                info.studentId = matches[0];
                const ocrDigits = matches[0].replace(/[^0-9]/g, '');
                const userDigits = (userInfo.student_id || '').replace(/[^0-9]/g, '');
                info.matches.studentId = !!(ocrDigits && userDigits && ocrDigits === userDigits);
                
                console.log('🔬 [OCR DEBUG] Student ID found:', matches[0]);
                console.log('🔬 [OCR DEBUG] OCR digits:', ocrDigits);
                console.log('🔬 [OCR DEBUG] User digits:', userDigits);
                console.log('🔬 [OCR DEBUG] ID Match:', info.matches.studentId);
                break;
            }
        }

        // Look for name matches using PLV email format (more reliable)
        let nameToMatch = null;
        let nameSource = 'user_input';
        
        // First, try to extract name from PLV email
        if (userInfo.email && userInfo.email.includes('@plv.edu.ph')) {
            const emailLocalPart = userInfo.email.split('@')[0];
            
            // Check if email has dots (standard format like juan.dela.cruz)
            if (emailLocalPart.includes('.')) {
                // Convert email format (juan.dela.cruz) to proper name format
                const emailNameParts = emailLocalPart.split('.').map(part => 
                    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
                );
                nameToMatch = emailNameParts.join(' ');
            } else {
                // Handle emails without dots (like josephvenedicttillo)
                nameToMatch = emailLocalPart.charAt(0).toUpperCase() + emailLocalPart.slice(1).toLowerCase();
            }
            
            nameSource = 'plv_email';
            console.log('🔬 [OCR DEBUG] Email local part:', emailLocalPart);
            console.log('🔬 [OCR DEBUG] Extracted name from PLV email:', nameToMatch);
        }
        
        // Fallback to user-provided full name if no PLV email
        if (!nameToMatch && userInfo.full_name) {
            nameToMatch = userInfo.full_name;
            nameSource = 'user_input';
            console.log('🔬 [OCR DEBUG] Using user-provided name:', nameToMatch);
        }
        
        if (nameToMatch) {
            // Normalize both the name and OCR text for better matching
            const normalizedName = nameToMatch.toUpperCase().trim();
            let nameParts = normalizedName.split(' ').filter(part => part.length > 1);
            
            // Special handling for concatenated email names (like josephvenedicttillo)
            if (nameParts.length === 1 && nameParts[0].length > 10 && nameSource === 'plv_email') {
                console.log('🔬 [OCR DEBUG] Detected concatenated email name, trying smart matching');
                
                // Extract the concatenated name from email
                const emailName = nameParts[0]; // e.g., "JOSEPHVENEDICTTILLO"
                
                // Try to find individual name components in OCR text that match parts of the email
                const ocrWords = cleanText.split(/\s+/).filter(word => word.length > 2);
                const matchedParts = [];
                
                console.log('🔬 [OCR DEBUG] Email name to match:', emailName);
                console.log('🔬 [OCR DEBUG] OCR words found:', ocrWords.slice(0, 20)); // Show first 20 words
                
                for (const word of ocrWords) {
                    const cleanWord = word.replace(/[^A-Z]/g, '');
                    
                    // Skip common non-name words
                    if (['PAMANTASAN', 'LUNGSOD', 'VALENZUELA', 'INFORMATION', 'TECHNOLOGY', 'BLOOD', 'TYPE', 'CITY', 'CONTACT', 'NUMBER', 'ADDRESS', 'PROPERTY'].includes(cleanWord)) {
                        continue;
                    }
                    
                    if (cleanWord.length >= 3) {
                        let wordMatched = false;
                        
                        // Strategy 1: OCR word is contained in email name (e.g., TILLO in JOSEPHVENEDICTTILLO)
                        if (emailName.includes(cleanWord)) {
                            matchedParts.push(cleanWord);
                            console.log('🔬 [OCR DEBUG] ✅ Found name component:', cleanWord, 'contained in email name');
                            wordMatched = true;
                        }
                        
                        // Strategy 2: Check if email name contains a substring that matches this OCR word
                        if (!wordMatched) {
                            // For names like JOSELITO vs JOSEPH in JOSEPHVENEDICTTILLO
                            for (let i = 0; i <= emailName.length - cleanWord.length; i++) {
                                const emailSubstring = emailName.substring(i, i + cleanWord.length);
                                if (emailSubstring === cleanWord) {
                                    matchedParts.push(cleanWord);
                                    console.log('🔬 [OCR DEBUG] ✅ Found name component:', cleanWord, 'matches substring in email');
                                    wordMatched = true;
                                    break;
                                }
                            }
                        }
                        
                        // Strategy 3: Fuzzy matching for similar names (e.g., JOSELITO vs JOSEPH)
                        if (!wordMatched && cleanWord.length >= 4) {
                            // Check if the beginning of the email name is similar to this word
                            const emailStart = emailName.substring(0, Math.min(cleanWord.length + 2, emailName.length));
                            if (emailStart.startsWith(cleanWord.substring(0, Math.min(4, cleanWord.length)))) {
                                matchedParts.push(cleanWord);
                                console.log('🔬 [OCR DEBUG] ✅ Found name component:', cleanWord, 'similar to email start:', emailStart);
                                wordMatched = true;
                            }
                        }
                    }
                }
                
                // If we found at least 2 name components, consider it a match
                if (matchedParts.length >= 2) {
                    console.log('🔬 [OCR DEBUG] 🎯 Smart match successful! Found', matchedParts.length, 'name components');
                    nameParts = matchedParts; // Use the found components for matching
                } else {
                    console.log('🔬 [OCR DEBUG] ⚠️ Smart match failed, found only', matchedParts.length, 'components');
                }
            }
            
            let nameMatches = 0;
            const foundParts = [];
            const missingParts = [];
            
            console.log('🔬 [OCR DEBUG] Original name to match:', nameToMatch);
            console.log('🔬 [OCR DEBUG] Normalized name:', normalizedName);
            console.log('🔬 [OCR DEBUG] Name parts to match (100% required):', nameParts);
            console.log('🔬 [OCR DEBUG] Name source:', nameSource);
            console.log('🔬 [OCR DEBUG] Clean OCR text (first 200 chars):', cleanText.substring(0, 200));
            
            for (const part of nameParts) {
                // Try multiple matching strategies
                let partFound = false;
                
                // Strategy 1: Exact match
                if (cleanText.includes(part)) {
                    partFound = true;
                    console.log('🔬 [OCR DEBUG] ✅ Found name part (exact):', part);
                }
                
                // Strategy 2: Try with common OCR substitutions
                if (!partFound) {
                    const ocrVariations = [
                        part.replace(/O/g, '0').replace(/0/g, 'O'), // O/0 confusion
                        part.replace(/I/g, '1').replace(/1/g, 'I'), // I/1 confusion
                        part.replace(/S/g, '5').replace(/5/g, 'S'), // S/5 confusion
                        part.replace(/B/g, '8').replace(/8/g, 'B'), // B/8 confusion
                        part.replace(/G/g, '6').replace(/6/g, 'G')  // G/6 confusion
                    ];
                    
                    for (const variation of ocrVariations) {
                        if (cleanText.includes(variation)) {
                            partFound = true;
                            console.log('🔬 [OCR DEBUG] ✅ Found name part (OCR variation):', part, '→', variation);
                            break;
                        }
                    }
                }
                
                // Strategy 3: Fuzzy matching for partial matches (at least 80% of characters)
                if (!partFound && part.length >= 4) {
                    const minMatchLength = Math.ceil(part.length * 0.8);
                    for (let i = 0; i <= part.length - minMatchLength; i++) {
                        const substring = part.substring(i, i + minMatchLength);
                        if (cleanText.includes(substring)) {
                            partFound = true;
                            console.log('🔬 [OCR DEBUG] ✅ Found name part (fuzzy):', part, '→', substring);
                            break;
                        }
                    }
                }
                
                if (partFound) {
                    nameMatches++;
                    foundParts.push(part);
                } else {
                    missingParts.push(part);
                    console.log('🔬 [OCR DEBUG] ❌ Missing name part:', part);
                }
            }
            
            // Require ALL name parts to be found (100% accuracy)
            const requiredMatches = nameParts.length;
            info.matches.name = nameMatches === requiredMatches && requiredMatches > 0;
            if (info.matches.name) {
                info.name = nameToMatch;
                info.nameSource = nameSource;
            }
            
            console.log('🔬 [OCR DEBUG] === NAME MATCHING SUMMARY ===');
            console.log('🔬 [OCR DEBUG] Name matches found:', nameMatches, '/', nameParts.length);
            console.log('🔬 [OCR DEBUG] ✅ Found parts:', foundParts);
            console.log('🔬 [OCR DEBUG] ❌ Missing parts:', missingParts);
            console.log('🔬 [OCR DEBUG] Required matches (100%):', requiredMatches);
            console.log('🔬 [OCR DEBUG] Final Name Match Result:', info.matches.name ? '✅ SUCCESS' : '❌ FAILED');
            console.log('🔬 [OCR DEBUG] Name source used:', nameSource);
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
