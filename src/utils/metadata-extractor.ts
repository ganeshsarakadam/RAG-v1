import crypto from 'crypto';

export interface ExtractedMetadata {
    parva?: string;
    chapter?: number;
    section_title?: string;
    speaker?: string;
    page?: number;
    pageEnd?: number;
}

export interface DocumentSection {
    parva: string;
    chapter: number;
    sectionTitle: string;
    startIndex: number;
    endIndex: number;
    content: string;
    pageStart: number;  // Page where section starts
    pageEnd: number;    // Page where section ends
}

/**
 * Page boundary information from page-by-page PDF parsing
 */
export interface PageInfo {
    pageNum: number;
    startIndex: number;
    endIndex: number;
    charCount: number;
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
     * Returns array of DocumentSection objects with Parva, Chapter, content, and page numbers
     *
     * @param fullText - The full PDF text (with \f page separators from pdf-parse)
     */
    static parseDocumentStructure(fullText: string): DocumentSection[] {
        const sections: DocumentSection[] = [];
        let currentParva = 'UNKNOWN PARVA';

        // Build a page map: for each character index, which page is it on?
        // pdf-parse uses \f (form-feed) as page separator
        const pageBreaks = this.buildPageMap(fullText);

        // Remove form-feed characters for processing but keep track of positions
        const cleanText = fullText.replace(/\f/g, '\n');

        // Split into lines for processing
        const lines = cleanText.split('\n');
        let currentSectionStart = 0;
        let currentSectionTitle = '';
        let currentChapter = 0;
        let currentSectionPageStart = 1;
        let tempContent: string[] = [];

        // Track character position for page mapping
        let charPosition = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineStartPos = charPosition;
            charPosition += lines[i].length + 1; // +1 for newline

            // Check for Parva marker
            const parvaMatch = line.match(this.PARVA_PATTERN);
            if (parvaMatch) {
                // Save previous section if exists
                if (tempContent.length > 0 && currentSectionTitle) {
                    const pageEnd = this.getPageAtPosition(pageBreaks, lineStartPos);
                    sections.push({
                        parva: currentParva,
                        chapter: currentChapter,
                        sectionTitle: currentSectionTitle,
                        startIndex: currentSectionStart,
                        endIndex: i,
                        content: tempContent.join('\n').trim(),
                        pageStart: currentSectionPageStart,
                        pageEnd: pageEnd
                    });
                    tempContent = [];
                }

                currentParva = parvaMatch[0].toUpperCase();
                continue;
            }

            // Check for Section marker
            const sectionMatch = line.match(this.SECTION_PATTERN);
            if (sectionMatch) {
                // Save previous section if exists
                if (tempContent.length > 0 && currentSectionTitle) {
                    const pageEnd = this.getPageAtPosition(pageBreaks, lineStartPos);
                    sections.push({
                        parva: currentParva,
                        chapter: currentChapter,
                        sectionTitle: currentSectionTitle,
                        startIndex: currentSectionStart,
                        endIndex: i,
                        content: tempContent.join('\n').trim(),
                        pageStart: currentSectionPageStart,
                        pageEnd: pageEnd
                    });
                }

                // Start new section
                currentChapter = this.romanToInt(sectionMatch[1]);
                currentSectionTitle = line;
                currentSectionStart = i;
                currentSectionPageStart = this.getPageAtPosition(pageBreaks, lineStartPos);
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
                content: tempContent.join('\n').trim(),
                pageStart: currentSectionPageStart,
                pageEnd: pageBreaks.length > 0 ? pageBreaks.length : 1
            });
        }

        console.log(`📚 Parsed ${sections.length} sections across ${this.countParvas(sections)} Parvas`);

        return sections;
    }

    /**
     * Parse document structure using pre-built page map from page-by-page parsing
     * This provides accurate page numbers for each section
     * 
     * @param fullText - The full PDF text (already processed page-by-page)
     * @param pageMap - Array of PageInfo from page-by-page parsing
     */
    static parseDocumentStructureWithPages(fullText: string, pageMap: PageInfo[]): DocumentSection[] {
        const sections: DocumentSection[] = [];
        let currentParva = 'UNKNOWN PARVA';

        // Split into lines for processing
        const lines = fullText.split('\n');
        let currentSectionStart = 0;
        let currentSectionTitle = '';
        let currentChapter = 0;
        let currentSectionPageStart = 1;
        let currentSectionCharStart = 0;
        let tempContent: string[] = [];

        // Track character position for page mapping
        let charPosition = 0;

        // Helper to get page at a character position using pre-built page map
        const getPageAtPosition = (position: number): number => {
            for (let i = pageMap.length - 1; i >= 0; i--) {
                if (position >= pageMap[i].startIndex) {
                    return pageMap[i].pageNum;
                }
            }
            return 1;
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineStartPos = charPosition;
            charPosition += lines[i].length + 1; // +1 for newline

            // Check for Parva marker
            const parvaMatch = line.match(this.PARVA_PATTERN);
            if (parvaMatch) {
                // Save previous section if exists
                if (tempContent.length > 0 && currentSectionTitle) {
                    const pageEnd = getPageAtPosition(lineStartPos);
                    sections.push({
                        parva: currentParva,
                        chapter: currentChapter,
                        sectionTitle: currentSectionTitle,
                        startIndex: currentSectionStart,
                        endIndex: i,
                        content: tempContent.join('\n').trim(),
                        pageStart: currentSectionPageStart,
                        pageEnd: pageEnd
                    });
                    tempContent = [];
                }

                currentParva = parvaMatch[0].toUpperCase();
                continue;
            }

            // Check for Section marker
            const sectionMatch = line.match(this.SECTION_PATTERN);
            if (sectionMatch) {
                // Save previous section if exists
                if (tempContent.length > 0 && currentSectionTitle) {
                    const pageEnd = getPageAtPosition(lineStartPos);
                    sections.push({
                        parva: currentParva,
                        chapter: currentChapter,
                        sectionTitle: currentSectionTitle,
                        startIndex: currentSectionStart,
                        endIndex: i,
                        content: tempContent.join('\n').trim(),
                        pageStart: currentSectionPageStart,
                        pageEnd: pageEnd
                    });
                }

                // Start new section
                currentChapter = this.romanToInt(sectionMatch[1]);
                currentSectionTitle = line;
                currentSectionStart = i;
                currentSectionCharStart = lineStartPos;
                currentSectionPageStart = getPageAtPosition(lineStartPos);
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
                content: tempContent.join('\n').trim(),
                pageStart: currentSectionPageStart,
                pageEnd: pageMap.length > 0 ? pageMap[pageMap.length - 1].pageNum : 1
            });
        }

        console.log(`📚 Parsed ${sections.length} sections across ${this.countParvas(sections)} Parvas`);
        console.log(`📄 Using ${pageMap.length} pages for accurate page tracking`);

        return sections;
    }

    /**
     * Build a map of page break positions from PDF text
     * @param text - PDF text with \f page separators
     * @returns Array of character positions where each page starts
     */
    private static buildPageMap(text: string): number[] {
        const pageBreaks: number[] = [0]; // Page 1 starts at position 0

        let pos = 0;
        while ((pos = text.indexOf('\f', pos)) !== -1) {
            pageBreaks.push(pos + 1); // Next page starts after \f
            pos++;
        }

        console.log(`📄 Detected ${pageBreaks.length} pages in document`);
        return pageBreaks;
    }

    /**
     * Get page number for a given character position
     */
    private static getPageAtPosition(pageBreaks: number[], position: number): number {
        for (let i = pageBreaks.length - 1; i >= 0; i--) {
            if (position >= pageBreaks[i]) {
                return i + 1; // Pages are 1-indexed
            }
        }
        return 1;
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
