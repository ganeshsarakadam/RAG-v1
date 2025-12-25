/**
 * Recursively splits text into chunks based on a list of separators.
 * This ensures that chunks respect semantic boundaries like paragraphs and sentences.
 *
 * @param text The text to split
 * @param chunkSize The maximum size of each chunk
 * @param overlap The number of overlapping characters
 * @returns Array of chunk strings
 */
export const recursiveChunking = (
    text: string,
    chunkSize: number = 1000,
    overlap: number = 200
): string[] => {
    // List of separators in order of preference (Paragraphs -> Lines -> Sentences -> Words -> Characters)
    const separators = ['\n\n', '\n', '. ', ' ', ''];

    const splitText = (currentText: string, currentSeparators: string[]): string[] => {
        const finalChunks: string[] = [];
        const separator = currentSeparators[0];
        const nextSeparators = currentSeparators.slice(1);

        let parts: string[] = [];

        if (separator === '') {
            // Fallback: split by character
            parts = Array.from(currentText);
        } else {
            // Split by the current separator
            // We use a regex with a lookahead to keep the separator attached to the end of the previous chunk if possible, 
            // but for simplicity in this implementation, we will just split and re-join.
            // A more robust way is to just split.
            parts = currentText.split(separator);
        }

        let goodChunks: string[] = [];
        let currentChunkPart = '';

        for (const part of parts) {
            // Re-attach separator if it's not the last character-level split
            const partWithSeparator = (separator !== '' && separator !== ' ') ? part + separator : part + (separator === ' ' ? ' ' : '');

            // If adding this part exceeds chunkSize, we need to finalize the current chunk
            if (currentChunkPart.length + partWithSeparator.length > chunkSize) {
                if (currentChunkPart.length > 0) {
                    goodChunks.push(currentChunkPart);
                    currentChunkPart = '';
                }

                // If the part ITSELF is too big, we must recurse on it
                if (partWithSeparator.length > chunkSize && nextSeparators.length > 0) {
                    const subChunks = splitText(part, nextSeparators);
                    goodChunks.push(...subChunks);
                } else {
                    // Otherwise, just start a new chunk with it
                    currentChunkPart = partWithSeparator;
                }
            } else {
                currentChunkPart += partWithSeparator;
            }
        }

        if (currentChunkPart.length > 0) {
            goodChunks.push(currentChunkPart);
        }

        // Apply overlap logic to the resulting valid chunks?
        // Actually, standard recursive splitters usually merge small chunks until they hit the limit.
        // The logic above essentially does that (merges parts into `currentChunkPart`).

        return goodChunks;
    };

    // Initial naive implementation above has a flaw: it doesn't handle overlap nicely during the merge.
    // Let's implement a cleaner "merge" loop that takes a list of atomic text blocks and combines them.

    // 1. Recursive helper to simply return the smallest atomic units (e.g. sentences) would be expensive.
    // 2. Standard approach: Try to split by current separator. If a split part is too big, recurse on THAT part.
    //    If parts are small, merge them into a chunk until limit.

    const _split = (text: string, separators: string[]): string[] => {
        const separator = separators[0];
        const newSeparators = separators.slice(1);

        let splits: string[];
        if (separator === '') {
            splits = Array.from(text); // Character split
        } else {
            // Split but keep the separator? LangChain usually splits by separator and then merges.
            splits = text.split(separator).filter(s => s !== '');
        }

        const finalChunks: string[] = [];
        let currentDoc: string[] = [];
        let currentLength = 0;

        for (let s of splits) {
            // restore separator for length calculation roughly
            const sLen = s.length + (separator === '' ? 0 : separator.length);

            if (currentLength + sLen > chunkSize) {
                // The current doc is full.
                if (currentLength > 0) {
                    const doc = currentDoc.join(separator);
                    // If the doc effectively shrank due to join, fine.
                    finalChunks.push(doc);

                    // Handle overlap: keep the last few items of currentDoc?
                    // Overlap logic in recursive is tricky.
                    // Simple restart:
                    while (currentLength > overlap && currentDoc.length > 0) {
                        const removed = currentDoc.shift();
                        if (removed) currentLength -= (removed.length + (separator === '' ? 0 : separator.length));
                    }
                }

                // If the single new piece `s` is still too big, we must recurse on IT
                if (sLen > chunkSize && newSeparators.length > 0) {
                    const subChunks = _split(s, newSeparators);
                    finalChunks.push(...subChunks);
                    // after a big chunk, we reset
                    currentDoc = [];
                    currentLength = 0;
                } else {
                    // standard add
                    currentDoc.push(s);
                    currentLength += sLen;
                }
            } else {
                currentDoc.push(s);
                currentLength += sLen;
            }
        }

        if (currentDoc.length > 0) {
            finalChunks.push(currentDoc.join(separator));
        }

        return finalChunks;
    };

    // To minimize complexity and bugs, let's use a simpler known algorithm structure
    // inspired directly by LangChain's RecursiveCharacterTextSplitter logic.

    const recurse = (text: string, separators: string[]): string[] => {
        const finalChunks: string[] = [];
        let separator = separators[separators.length - 1]; // Default to chars
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

        const splits = separator === '' ? Array.from(text) : text.split(separator);

        let currentChunk: string[] = [];
        let currentLen = 0;

        for (const split of splits) {
            const splitLen = split.length;
            // If a single split is bigger than chunk size, and we have more separators, recurse
            if (splitLen > chunkSize) {
                // First flush existing buffer
                if (currentChunk.length > 0) {
                    finalChunks.push(currentChunk.join(separator));
                    currentChunk = [];
                    currentLen = 0;
                }
                // Recurse on the big split if possible
                if (newSeparators.length > 0) {
                    finalChunks.push(...recurse(split, newSeparators));
                } else {
                    // No more separators, forced to accept big chunk (or truncate)
                    finalChunks.push(split);
                }
            } else {
                // Check if adding this fits
                // + separator length, unless it's the first item
                const sepLen = (currentChunk.length > 0) ? separator.length : 0;

                if (currentLen + sepLen + splitLen > chunkSize) {
                    // Flush
                    finalChunks.push(currentChunk.join(separator));

                    // Reset with overlap
                    // A simple overlap strategy: keep elements from the end until we occupy ~overlap space
                    // But calculating exact overlap with join separators is annoying.
                    // Simplified: clear and start new. (Overlap valid recursive is hard to get 100% right in 50 lines without a class).
                    // Let's try a basic overlap retention:

                    while (currentLen > overlap && currentChunk.length > 0) {
                        const removed = currentChunk.shift();
                        if (removed) currentLen -= removed.length + (currentChunk.length > 0 ? separator.length : 0); // approx
                    }

                    // If after removing we are still too big (unlikely if split < chunk), clear all
                    if (currentLen + sepLen + splitLen > chunkSize) {
                        currentChunk = [];
                        currentLen = 0;
                    }
                }
                currentChunk.push(split);
                currentLen += split.length + (currentChunk.length > 1 ? separator.length : 0);
            }
        }

        if (currentChunk.length > 0) {
            finalChunks.push(currentChunk.join(separator));
        }

        return finalChunks;
    }

    return recurse(text, ['\n\n', '\n', '. ', ' ', '']);
};
