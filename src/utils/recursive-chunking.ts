/**
 * Recursively splits text into chunks based on a list of separators.
 * This ensures that chunks respect semantic boundaries like paragraphs and sentences.
 *
 * Algorithm inspired by LangChain's RecursiveCharacterTextSplitter:
 * 1. Try to split by the first separator that exists in the text
 * 2. If a split piece is still too big, recurse with finer separators
 * 3. Merge small pieces until chunk size is reached
 * 4. Maintain overlap between chunks for context continuity
 *
 * @param text The text to split
 * @param chunkSize The maximum size of each chunk (default: 1000)
 * @param overlap The number of overlapping characters between chunks (default: 200)
 * @returns Array of chunk strings
 */
export const recursiveChunking = (
    text: string,
    chunkSize: number = 1000,
    overlap: number = 200
): string[] => {
    // Separators in order of preference: Paragraphs -> Lines -> Sentences -> Words -> Characters
    const defaultSeparators = ['\n\n', '\n', '. ', ' ', ''];

    const recurse = (text: string, separators: string[]): string[] => {
        const finalChunks: string[] = [];
        let separator = separators[separators.length - 1]; // Default to character split
        let newSeparators: string[] = [];

        // Find the first separator that actually exists in the text
        for (let i = 0; i < separators.length; i++) {
            const s = separators[i];
            if (s === '') {
                separator = s;
                break;
            }
            if (text.includes(s)) {
                separator = s;
                newSeparators = separators.slice(i + 1);
                break;
            }
        }

        // Split text by the chosen separator
        const splits = separator === '' ? Array.from(text) : text.split(separator);

        let currentChunk: string[] = [];
        let currentLen = 0;

        for (const split of splits) {
            const splitLen = split.length;

            // If a single split is bigger than chunk size, recurse with finer separators
            if (splitLen > chunkSize) {
                // First flush existing buffer
                if (currentChunk.length > 0) {
                    finalChunks.push(currentChunk.join(separator));
                    currentChunk = [];
                    currentLen = 0;
                }

                // Recurse on the big split if we have more separators
                if (newSeparators.length > 0) {
                    finalChunks.push(...recurse(split, newSeparators));
                } else {
                    // No more separators, forced to accept big chunk
                    finalChunks.push(split);
                }
            } else {
                // Check if adding this split would exceed chunk size
                const sepLen = (currentChunk.length > 0) ? separator.length : 0;

                if (currentLen + sepLen + splitLen > chunkSize) {
                    // Flush current chunk
                    finalChunks.push(currentChunk.join(separator));

                    // Apply overlap: keep elements from the end until we reach ~overlap size
                    while (currentLen > overlap && currentChunk.length > 0) {
                        const removed = currentChunk.shift();
                        if (removed) {
                            currentLen -= removed.length + (currentChunk.length > 0 ? separator.length : 0);
                        }
                    }

                    // If still too big after overlap retention, clear completely
                    if (currentLen + sepLen + splitLen > chunkSize) {
                        currentChunk = [];
                        currentLen = 0;
                    }
                }

                currentChunk.push(split);
                currentLen += split.length + (currentChunk.length > 1 ? separator.length : 0);
            }
        }

        // Flush remaining content
        if (currentChunk.length > 0) {
            finalChunks.push(currentChunk.join(separator));
        }

        return finalChunks;
    };

    return recurse(text, defaultSeparators);
};
