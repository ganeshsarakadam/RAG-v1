/**
 * Splits text into fixed-size chunks with overlap.
 * @param text The input text to chunk.
 * @param chunkSize The maximum size of each chunk in characters.
 * @param overlap The number of characters to overlap between chunks.
 * @returns Array of chunk strings.
 */
export const fixedSizeChunking = (text: string, chunkSize: number = 1000, overlap: number = 200): string[] => {
    // Normalize whitespace to avoid issues with newlines counting towards size awkwardly
    const normalizedText = text.replace(/\s+/g, ' ');

    const chunks: string[] = [];
    let start = 0;

    while (start < normalizedText.length) {
        const end = Math.min(start + chunkSize, normalizedText.length);
        const chunk = normalizedText.slice(start, end);
        chunks.push(chunk);

        if (end >= normalizedText.length) break;

        start += (chunkSize - overlap);
    }

    return chunks;
};
