/**
 * Parses S3 key to extract religion and text source
 *
 * Expected folder structure: {religion}/{textSource}/{filename}
 * Example: hinduism/mahabharatam/mahabharata_v1.pdf
 *          └religion  └textSource   └filename
 */
export interface S3PathInfo {
    religion: string | null;
    textSource: string | null;
    fileName: string;
    fullPath: string;
}

/**
 * Parse S3 key into structured path information
 * @param s3Key - S3 object key (e.g., "hinduism/mahabharatam/file.pdf")
 * @returns Parsed path information
 */
export function parseS3Path(s3Key: string): S3PathInfo {
    const parts = s3Key.split('/').filter(p => p.length > 0);

    if (parts.length === 0) {
        return {
            religion: null,
            textSource: null,
            fileName: s3Key,
            fullPath: s3Key
        };
    }

    if (parts.length === 1) {
        // Just filename: "file.pdf"
        return {
            religion: null,
            textSource: null,
            fileName: parts[0],
            fullPath: s3Key
        };
    }

    if (parts.length === 2) {
        // religion/file.pdf
        return {
            religion: normalizeReligion(parts[0]),
            textSource: null,
            fileName: parts[1],
            fullPath: s3Key
        };
    }

    // religion/textSource/file.pdf (or deeper nesting)
    return {
        religion: normalizeReligion(parts[0]),
        textSource: normalizeTextSource(parts[1]),
        fileName: parts[parts.length - 1],
        fullPath: s3Key
    };
}

/**
 * Normalize religion names to consistent format
 */
function normalizeReligion(religion: string): string {
    const normalized = religion.toLowerCase().trim();

    // Map common variations to canonical names
    const religionMap: { [key: string]: string } = {
        'hindu': 'hinduism',
        'christian': 'christianity',
        'muslim': 'islam',
        'islamic': 'islam',
        'buddhist': 'buddhism',
        'jewish': 'judaism',
        'judaist': 'judaism',
    };

    return religionMap[normalized] || normalized;
}

/**
 * Normalize text source names to consistent format
 */
function normalizeTextSource(textSource: string): string {
    const normalized = textSource.toLowerCase().trim();

    // Map common variations to canonical names
    const textMap: { [key: string]: string } = {
        'mahabharata': 'mahabharatam',
        'mahabharat': 'mahabharatam',
        'gita': 'bhagavad-gita',
        'bhagavadgita': 'bhagavad-gita',
        'quran': 'quran',
        'koran': 'quran',
        'ramayan': 'ramayana',
    };

    return textMap[normalized] || normalized;
}

/**
 * Validate if the S3 path has the expected structure
 */
export function isValidS3Structure(s3Key: string): boolean {
    const parts = s3Key.split('/').filter(p => p.length > 0);
    return parts.length >= 3; // religion/textSource/file.pdf
}

/**
 * Get suggested S3 path for a file
 */
export function suggestS3Path(religion: string, textSource: string, fileName: string): string {
    const normalizedReligion = normalizeReligion(religion);
    const normalizedTextSource = normalizeTextSource(textSource);
    return `${normalizedReligion}/${normalizedTextSource}/${fileName}`;
}
