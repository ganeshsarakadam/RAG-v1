import crypto from 'crypto';

export interface ExtractedMetadata {
    parva?: string;
    chapter?: number;
    section_title?: string;
    speaker?: string;
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
 * Pattern-based metadata extraction for Mahabharata text
 */
export class MetadataExtractor {
    // Comprehensive list of Mahabharata Parvas
    private static readonly PARVA_PATTERN = /\b(ADI|SABHA|VANA|VIRATA|UDYOGA|BHISHMA|BHISMA|DRONA|KARNA|SALYA|SAUPTIKA|STRI|SANTI|SHANTI|ANUSASANA|ANUSHASANA|ASWAMEDHA|ASHWAMEDHA|ASRAMAVASIKA|ASHRAMAVASIKA|MAUSALA|MAHAPRASTHANIKA|SVARGAROHANIKA|SWARGAROHANIKA)\s+PARVA\b/gi;

    // Section markers with Roman numerals
    private static readonly SECTION_PATTERN = /^SECTION\s+([IVXLCDM]+)\s*$/m;

    // Speaker patterns - common in Mahabharata
    private static readonly SPEAKER_PATTERN = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(said|replied|answered|continued|asked|spake|spoke):/gm;

    // Book pattern (alternative to SECTION)
    private static readonly BOOK_PATTERN = /^BOOK\s+(\d+)\s*$/m;

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
     * Extract speaker from a chunk of text
     * Returns the most frequently mentioned speaker
     */
    static extractSpeaker(text: string): string | undefined {
        const speakerMatches = [...text.matchAll(this.SPEAKER_PATTERN)];
        if (speakerMatches.length === 0) return undefined;

        // Count speaker occurrences
        const speakerCounts = new Map<string, number>();
        speakerMatches.forEach(match => {
            const speaker = match[1];
            speakerCounts.set(speaker, (speakerCounts.get(speaker) || 0) + 1);
        });

        // Return most frequent speaker
        let maxCount = 0;
        let primarySpeaker = '';
        speakerCounts.forEach((count, speaker) => {
            if (count > maxCount) {
                maxCount = count;
                primarySpeaker = speaker;
            }
        });

        return primarySpeaker || undefined;
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
