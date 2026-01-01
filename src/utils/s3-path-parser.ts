/**
 * Parses S3 key to extract religion, text source, and document category
 *
 * Expected folder structure: {religion}/{textSource}/{docCategory}/{filename}
 * Example: hinduism/mahabharatam/scripture/mahabharata_v1.pdf
 *          └religion  └textSource   └docCategory └filename
 *
 * Legacy support: {religion}/{textSource}/{filename} (docCategory = 'scripture' by default)
 */
export interface S3PathInfo {
    religion: string | null;
    textSource: string | null;
    docCategory: string | null;
    fileName: string;
    fullPath: string;
}

/**
 * Parse S3 key into structured path information
 * @param s3Key - S3 object key (e.g., "hinduism/mahabharatam/scripture/file.pdf")
 * @returns Parsed path information
 */
export function parseS3Path(s3Key: string): S3PathInfo {
    const parts = s3Key.split('/').filter(p => p.length > 0);

    if (parts.length === 0) {
        return {
            religion: null,
            textSource: null,
            docCategory: null,
            fileName: s3Key,
            fullPath: s3Key
        };
    }

    if (parts.length === 1) {
        // Just filename: "file.pdf"
        return {
            religion: null,
            textSource: null,
            docCategory: null,
            fileName: parts[0],
            fullPath: s3Key
        };
    }

    if (parts.length === 2) {
        // religion/file.pdf
        return {
            religion: normalizeReligion(parts[0]),
            textSource: null,
            docCategory: null,
            fileName: parts[1],
            fullPath: s3Key
        };
    }

    if (parts.length === 3) {
        // Legacy format: religion/textSource/file.pdf
        // Default to 'scripture' for backward compatibility
        return {
            religion: normalizeReligion(parts[0]),
            textSource: normalizeTextSource(parts[1]),
            docCategory: 'scripture',
            fileName: parts[2],
            fullPath: s3Key
        };
    }

    // New format: religion/textSource/docCategory/file.pdf (or deeper nesting)
    return {
        religion: normalizeReligion(parts[0]),
        textSource: normalizeTextSource(parts[1]),
        docCategory: normalizeDocCategory(parts[2]),
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
 * Normalize document category names to consistent format
 */
function normalizeDocCategory(category: string): string {
    const normalized = category.toLowerCase().trim();

    // Map common variations to canonical names
    const categoryMap: { [key: string]: string } = {
        'scriptures': 'scripture',
        'original': 'scripture',
        'primary': 'scripture',
        'encyclopedias': 'encyclopedia',
        'reference': 'encyclopedia',
        'wiki': 'encyclopedia',
        'commentaries': 'commentary',
        'interpretation': 'commentary',
        'analysis': 'commentary',
        'translations': 'translation',
        'translated': 'translation',
    };

    return categoryMap[normalized] || normalized;
}

/**
 * Validate if the S3 path has the expected structure
 */
export function isValidS3Structure(s3Key: string): boolean {
    const parts = s3Key.split('/').filter(p => p.length > 0);
    // Accept both legacy (3 parts) and new format (4 parts)
    return parts.length >= 3;
}

/**
 * Get suggested S3 path for a file
 */
export function suggestS3Path(
    religion: string,
    textSource: string,
    fileName: string,
    docCategory: string = 'scripture'
): string {
    const normalizedReligion = normalizeReligion(religion);
    const normalizedTextSource = normalizeTextSource(textSource);
    const normalizedCategory = normalizeDocCategory(docCategory);
    return `${normalizedReligion}/${normalizedTextSource}/${normalizedCategory}/${fileName}`;
}
