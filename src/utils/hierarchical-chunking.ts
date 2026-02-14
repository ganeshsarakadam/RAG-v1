import { recursiveChunking } from './recursive-chunking';
import { MetadataExtractor, DocumentSection } from './metadata-extractor';

/**
 * Configuration for chunking different content types
 */
export interface ChunkingConfig {
    childChunkSize: number;
    childOverlap: number;
}

/**
 * Predefined chunking configurations for different content types
 */
export const CHUNKING_PRESETS: Record<string, ChunkingConfig> = {
    scripture: { childChunkSize: 1000, childOverlap: 200 },      // Default for religious texts
    encyclopedia: { childChunkSize: 500, childOverlap: 100 },    // Shorter for factual entries
    commentary: { childChunkSize: 1500, childOverlap: 300 },     // Longer for analytical content
    dialogue: { childChunkSize: 800, childOverlap: 150 },        // Medium for conversational content
    default: { childChunkSize: 1000, childOverlap: 200 }
};

export interface ChunkWithMetadata {
    content: string;
    contextualContent?: string; // Contextual Retrieval: Content with context prepended
    metadata: {
        source: string;
        parva: string;
        chapter: number;
        section_title: string;
        speaker?: string;
        chunk_index: number;
        type: 'parent' | 'child';
        page?: number;      // PDF page number where chunk starts
        pageEnd?: number;   // PDF page number where chunk ends
        has_context?: boolean; // Contextual Retrieval: tracks if chunk has contextual embedding
        context_summary?: string; // Contextual Retrieval: the generated context description
    };
    parentIndex?: number; // Reference to parent chunk index
    parentContent?: string; // Contextual Retrieval: Parent content for context generation
    contentHash: string;
}

/**
 * Hierarchical chunking that respects semantic boundaries
 */
export class HierarchicalChunker {
    /**
     * Process document sections into parent and child chunks
     *
     * @param sections - Array of DocumentSection from MetadataExtractor
     * @param source - Source document name
     * @param childChunkSize - Size for child chunks (default: 1000)
     * @param childOverlap - Overlap for child chunks (default: 200)
     */
    static createHierarchicalChunks(
        sections: DocumentSection[],
        source: string,
        childChunkSize: number = 1000,
        childOverlap: number = 200
    ): ChunkWithMetadata[] {
        const allChunks: ChunkWithMetadata[] = [];
        let globalChunkIndex = 0;

        console.log(`✂️  Creating hierarchical chunks from ${sections.length} sections...`);

        sections.forEach((section, sectionIdx) => {
            // Skip empty sections
            if (!section.content || section.content.trim().length === 0) {
                console.log(`⚠️  Skipping empty section: ${section.sectionTitle} in ${section.parva}`);
                return;
            }

            // 1. Create PARENT chunk (full section/chapter)
            const parentChunk: ChunkWithMetadata = {
                content: section.content,
                metadata: {
                    source,
                    parva: section.parva,
                    chapter: section.chapter,
                    section_title: section.sectionTitle,
                    speaker: MetadataExtractor.extractSpeaker(section.content),
                    chunk_index: globalChunkIndex++,
                    type: 'parent',
                    page: section.pageStart,
                    pageEnd: section.pageEnd
                },
                contentHash: MetadataExtractor.generateContentHash(section.content)
            };

            const parentIndex = allChunks.length;
            allChunks.push(parentChunk);

            // 2. Create CHILD chunks using recursive splitting (if section is large enough)
            if (section.content.length > childChunkSize) {
                const childChunkTexts = recursiveChunking(
                    section.content,
                    childChunkSize,
                    childOverlap
                );

                // Get parent speaker for inheritance
                const parentSpeaker = parentChunk.metadata.speaker;

                childChunkTexts.forEach(childText => {
                    // Try to extract speaker from child text first
                    const childSpeaker = MetadataExtractor.extractSpeaker(childText);
                    // Inherit from parent if child has no speaker detected
                    const speaker = childSpeaker || parentSpeaker;

                    const childChunk: ChunkWithMetadata = {
                        content: childText,
                        metadata: {
                            source,
                            parva: section.parva,
                            chapter: section.chapter,
                            section_title: section.sectionTitle,
                            speaker,
                            chunk_index: globalChunkIndex++,
                            type: 'child',
                            // Child chunks inherit parent's page range
                            page: section.pageStart,
                            pageEnd: section.pageEnd
                        },
                        parentIndex, // Link to parent
                        parentContent: section.content, // Contextual Retrieval: Store parent content for context generation
                        contentHash: MetadataExtractor.generateContentHash(childText)
                    };

                    allChunks.push(childChunk);
                });
            }

            // Log progress every 50 sections
            if ((sectionIdx + 1) % 50 === 0) {
                console.log(`   Progress: ${sectionIdx + 1}/${sections.length} sections processed...`);
            }
        });

        const parentCount = allChunks.filter(c => c.metadata.type === 'parent').length;
        const childCount = allChunks.filter(c => c.metadata.type === 'child').length;

        console.log(`📦 Created ${allChunks.length} total chunks:`);
        console.log(`   - ${parentCount} parent chunks (full sections)`);
        console.log(`   - ${childCount} child chunks (semantic units)`);

        return allChunks;
    }

    /**
     * Remove exact duplicates based on content hash
     */
    static deduplicateChunks(chunks: ChunkWithMetadata[]): ChunkWithMetadata[] {
        const seen = new Set<string>();
        const deduplicated: ChunkWithMetadata[] = [];

        chunks.forEach(chunk => {
            if (!seen.has(chunk.contentHash)) {
                seen.add(chunk.contentHash);
                deduplicated.push(chunk);
            }
        });

        const removedCount = chunks.length - deduplicated.length;
        if (removedCount > 0) {
            console.log(`🗑️  Removed ${removedCount} duplicate chunks (${((removedCount / chunks.length) * 100).toFixed(2)}%)`);
        } else {
            console.log(`✅ No duplicate chunks found`);
        }

        return deduplicated;
    }
}
