import crypto from 'crypto';

export interface ExtractedMetadata {
    parva?: string;
    chapter?: number;
    section_title?: string;
    speaker?: string;
    speakers?: string[]; // Multiple speakers in one chunk
    page?: number;
}

export interface DocumentSection {
    parva: string;
    chapter: number;
    sectionTitle: string;
    startIndex: number;
    endIndex: number;
    content: string;
}

/**
 * Enhanced pattern-based metadata extraction for Mahabharata text
 * Significantly improved speaker detection for role-play features
 */
export class MetadataExtractor {
    // Comprehensive list of Mahabharata Parvas
    private static readonly PARVA_PATTERN = /\b(ADI|SABHA|VANA|VIRATA|UDYOGA|BHISHMA|BHISMA|DRONA|KARNA|SALYA|SAUPTIKA|STRI|SANTI|SHANTI|ANUSASANA|ANUSHASANA|ASWAMEDHA|ASHWAMEDHA|ASRAMAVASIKA|ASHRAMAVASIKA|MAUSALA|MAHAPRASTHANIKA|SVARGAROHANIKA|SWARGAROHANIKA)\s+PARVA\b/gi;

    // Section markers with Roman numerals
    private static readonly SECTION_PATTERN = /^SECTION\s+([IVXLCDM]+)\s*$/m;

    // Book pattern (alternative to SECTION)
    private static readonly BOOK_PATTERN = /^BOOK\s+(\d+)\s*$/m;

    // Known Mahabharata characters (most important ones)
    private static readonly KNOWN_CHARACTERS = [
        // Pandavas
        'Yudhishthira', 'Bhima', 'Arjuna', 'Nakula', 'Sahadeva',
        // Kauravas
        'Duryodhana', 'Dushasana', 'Dussasana', 'Shakuni',
        // Krishna and Yadavas
        'Krishna', 'Vasudeva', 'Balarama', 'Satyaki',
        // Elders
        'Bhishma', 'Drona', 'Dronacharya', 'Kripa', 'Kripacharya',
        'Vidura', 'Dhritarashtra', 'Gandhari', 'Kunti',
        // Warriors
        'Karna', 'Ashwatthama', 'Jayadratha', 'Abhimanyu',
        'Ghatotkacha', 'Bhagadatta', 'Shalya', 'Salya',
        // Women
        'Draupadi', 'Subhadra', 'Uttara', 'Hidimba',
        // Sages and Narrators
        'Vyasa', 'Vaisampayana', 'Vaishampayana', 'Sauti', 'Narada',
        'Janamejaya', 'Sanjaya',
        // Gods and Others
        'Indra', 'Brahma', 'Shiva', 'Hanuman'
    ];

    // Enhanced speaker patterns (multiple patterns for better coverage)
    private static readonly SPEAKER_PATTERNS = [
        // Pattern 1: "Name said, 'text" (MOST COMMON in Mahabharata)
        /"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(said|replied|answered|continued|asked|observed|exclaimed),[^"]*'/gi,

        // Pattern 2: "Name, [epithet], said, 'text"
        /"([A-Z][a-z]+),\s+[^,]+,\s+(said|replied|answered|observed),[^"]*'/gi,

        // Pattern 3: Name said/replied without quotes
        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(said|replied|answered|continued|asked|spake|spoke|exclaimed|observed|commanded|declared):/gi,

        // Pattern 4: "Said Name:" or "Replied Name:"
        /\b(said|replied|answered|spake|spoke|exclaimed|observed|commanded|declared)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*):/gi,

        // Pattern 5: All caps names (common in older translations)
        /\b([A-Z]{3,})\s+(said|replied|answered|continued|asked|spake|spoke):/gi,
    ];

    /**
     * Parse entire PDF text to identify section boundaries
     * Returns array of DocumentSection objects with Parva, Chapter, and content
     */
    static parseDocumentStructure(fullText: string): DocumentSection[] {
        const sections: DocumentSection[] = [];
        let currentParva = 'UNKNOWN PARVA';
        let sectionIndex = 0;

        // Split into lines for processing
        const lines = fullText.split('\n');
        let currentSectionStart = 0;
        let currentSectionTitle = '';
        let currentChapter = 0;
        let tempContent: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Check for Parva marker
            const parvaMatch = line.match(this.PARVA_PATTERN);
            if (parvaMatch) {
                // Save previous section if exists
                if (tempContent.length > 0 && currentSectionTitle) {
                    sections.push({
                        parva: currentParva,
                        chapter: currentChapter,
                        sectionTitle: currentSectionTitle,
                        startIndex: currentSectionStart,
                        endIndex: i,
                        content: tempContent.join('\n').trim()
                    });
                    tempContent = [];
                }

                currentParva = parvaMatch[0].toUpperCase();
                // Reset chapter counter for new Parva
                continue;
            }

            // Check for Section marker
            const sectionMatch = line.match(this.SECTION_PATTERN);
            if (sectionMatch) {
                // Save previous section if exists
                if (tempContent.length > 0 && currentSectionTitle) {
                    sections.push({
                        parva: currentParva,
                        chapter: currentChapter,
                        sectionTitle: currentSectionTitle,
                        startIndex: currentSectionStart,
                        endIndex: i,
                        content: tempContent.join('\n').trim()
                    });
                }

                // Start new section
                currentChapter = this.romanToInt(sectionMatch[1]);
                currentSectionTitle = line;
                currentSectionStart = i;
                tempContent = [];
                continue;
            }

            // Accumulate content
            if (currentSectionTitle) {
                tempContent.push(lines[i]);
            }
        }

        // Save final section
        if (tempContent.length > 0 && currentSectionTitle) {
            sections.push({
                parva: currentParva,
                chapter: currentChapter,
                sectionTitle: currentSectionTitle,
                startIndex: currentSectionStart,
                endIndex: lines.length,
                content: tempContent.join('\n').trim()
            });
        }

        console.log(`📚 Parsed ${sections.length} sections across ${this.countParvas(sections)} Parvas`);

        return sections;
    }

    /**
     * Enhanced speaker extraction with multiple pattern matching
     * Returns the most prominent speaker (or all speakers if needed)
     */
    static extractSpeaker(text: string): string | undefined {
        const allSpeakers = new Map<string, number>();

        // Try all speaker patterns
        for (const pattern of this.SPEAKER_PATTERNS) {
            const matches = [...text.matchAll(pattern)];

            matches.forEach(match => {
                // Extract speaker name (could be in group 1 or 2 depending on pattern)
                let speaker = match[1] || match[2];

                // Skip common verbs that got matched as names
                if (['said', 'replied', 'answered', 'spake', 'spoke', 'asked', 'continued', 'exclaimed', 'observed', 'commanded', 'declared'].includes(speaker?.toLowerCase())) {
                    speaker = match[2] || match[1];
                }

                if (speaker) {
                    // Normalize: capitalize properly
                    speaker = this.normalizeName(speaker);

                    // Only count if it's a known character or looks like a proper name
                    if (this.isValidCharacterName(speaker)) {
                        allSpeakers.set(speaker, (allSpeakers.get(speaker) || 0) + 1);
                    }
                }
            });
        }

        if (allSpeakers.size === 0) return undefined;

        // Return most frequent speaker
        let maxCount = 0;
        let primarySpeaker = '';
        allSpeakers.forEach((count, speaker) => {
            if (count > maxCount) {
                maxCount = count;
                primarySpeaker = speaker;
            }
        });

        return primarySpeaker || undefined;
    }

    /**
     * Extract all speakers mentioned in a chunk (for multi-character scenes)
     */
    static extractAllSpeakers(text: string): string[] {
        const allSpeakers = new Set<string>();

        // Try all speaker patterns
        for (const pattern of this.SPEAKER_PATTERNS) {
            const matches = [...text.matchAll(pattern)];

            matches.forEach(match => {
                let speaker = match[1] || match[2];

                // Skip common verbs
                if (['said', 'replied', 'answered', 'spake', 'spoke', 'asked', 'continued', 'exclaimed', 'observed', 'commanded', 'declared'].includes(speaker?.toLowerCase())) {
                    speaker = match[2] || match[1];
                }

                if (speaker) {
                    speaker = this.normalizeName(speaker);
                    if (this.isValidCharacterName(speaker)) {
                        allSpeakers.add(speaker);
                    }
                }
            });
        }

        return Array.from(allSpeakers);
    }

    /**
     * Extract all mentioned characters from text (even in narrative)
     * This captures characters discussed in the text, not just speakers
     */
    static extractMentionedCharacters(text: string): string[] {
        const mentionedChars = new Set<string>();

        // Check for each known character in the text
        for (const character of this.KNOWN_CHARACTERS) {
            // Use word boundaries to match whole names
            const regex = new RegExp(`\\b${character}\\b`, 'gi');
            if (regex.test(text)) {
                mentionedChars.add(character);
            }
        }

        // Also check for possessive forms and with epithets
        // e.g., "Krishna's", "Arjuna, the mighty warrior"
        const possessivePattern = /\b([A-Z][a-z]+)'s\b/g;
        const matches = [...text.matchAll(possessivePattern)];

        matches.forEach(match => {
            const name = match[1];
            if (this.isValidCharacterName(name)) {
                mentionedChars.add(name);
            }
        });

        return Array.from(mentionedChars);
    }

    /**
     * Extract comprehensive character information from text
     * Returns { speaker, speakers, characters }
     */
    static extractCharacterInfo(text: string): {
        speaker?: string;
        speakers: string[];
        characters: string[];
    } {
        return {
            speaker: this.extractSpeaker(text),
            speakers: this.extractAllSpeakers(text),
            characters: this.extractMentionedCharacters(text)
        };
    }

    /**
     * Normalize character names to canonical form
     */
    private static normalizeName(name: string): string {
        // Convert all caps to proper case
        if (name === name.toUpperCase() && name.length > 2) {
            name = name.charAt(0) + name.slice(1).toLowerCase();
        }

        // Common variations to canonical names
        const nameMap: { [key: string]: string } = {
            'Vaisampayana': 'Vaishampayana',
            'Bhisma': 'Bhishma',
            'Dussasana': 'Dushasana',
            'Salya': 'Shalya',
            'Yudhisthira': 'Yudhishthira',
            'Arjun': 'Arjuna',
        };

        return nameMap[name] || name;
    }

    /**
     * Check if a name is a valid character name
     */
    private static isValidCharacterName(name: string): boolean {
        // Check against known characters
        if (this.KNOWN_CHARACTERS.includes(name)) {
            return true;
        }

        // General heuristics for valid names
        // - At least 3 characters
        // - Starts with capital
        // - No numbers
        // - Not a common word
        const commonWords = ['The', 'And', 'That', 'Then', 'Thus', 'When', 'After', 'Before', 'Once', 'There'];

        return name.length >= 3 &&
               /^[A-Z][a-z]+$/.test(name) &&
               !commonWords.includes(name);
    }

    /**
     * Convert Roman numerals to integers
     */
    private static romanToInt(roman: string): number {
        const romanMap: { [key: string]: number } = {
            'I': 1, 'V': 5, 'X': 10, 'L': 50,
            'C': 100, 'D': 500, 'M': 1000
        };

        let result = 0;
        for (let i = 0; i < roman.length; i++) {
            const current = romanMap[roman[i]];
            const next = romanMap[roman[i + 1]];
            if (next && current < next) {
                result -= current;
            } else {
                result += current;
            }
        }
        return result;
    }

    /**
     * Generate content hash for deduplication
     * Uses SHA256 hash of normalized content
     */
    static generateContentHash(content: string): string {
        // Normalize: lowercase, trim, remove extra whitespace
        const normalized = content.toLowerCase().trim().replace(/\s+/g, ' ');
        return crypto.createHash('sha256').update(normalized).digest('hex');
    }

    /**
     * Count unique Parvas in sections
     */
    private static countParvas(sections: DocumentSection[]): number {
        const uniqueParvas = new Set(sections.map(s => s.parva));
        return uniqueParvas.size;
    }
}
