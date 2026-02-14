const pdf = require('pdf-parse');
import { AppDataSource } from '../config/database';
import { DocumentChunkRecursive } from '../entities/DocumentChunkRecursive';
import { generateEmbedding, generateChunkContext } from '../utils/gemini';
import { MetadataExtractor } from '../utils/metadata-extractor';
import { HierarchicalChunker, ChunkWithMetadata } from '../utils/hierarchical-chunking';

export class IngestionService {
    /**
     * Ingest a PDF document with hierarchical chunking
     * @param pdfBuffer - Buffer containing PDF file data
     * @param fileName - Name of the PDF file
     * @param religion - Religion category (e.g., 'hinduism', 'christianity')
     * @param textSource - Specific text source (e.g., 'mahabharatam', 'bible')
     * @param docCategory - Document category (e.g., 'scripture', 'encyclopedia', 'commentary')
     * @param options - Optional configuration for chunking
     */
    async ingestDocument(
        pdfBuffer: Buffer,
        fileName: string,
        religion: string | null,
        textSource: string | null,
        docCategory: string | null = 'scripture',
        options?: {
            childChunkSize?: number;
            childOverlap?: number;
            clearExisting?: boolean;
        }
    ) {
        const { childChunkSize = 1000, childOverlap = 200, clearExisting = false } = options || {};

        try {
            console.log(`🚀 Starting hierarchical ingestion for: ${fileName}`);

            const chunkRepository = AppDataSource.getRepository(DocumentChunkRecursive);

            // Check existing data
            const existingCount = await chunkRepository.count();
            console.log(`📊 Current DB Count: ${existingCount}`);

            if (existingCount > 1000 && !clearExisting) {
                return {
                    success: false,
                    message: `Database appears populated (${existingCount} chunks). Set clearExisting=true to re-ingest.`,
                    stats: { existingCount }
                };
            }

            if (clearExisting && existingCount > 0) {
                console.log('🧹 Clearing existing data...');
                await chunkRepository.clear();
            }

            // Parse PDF
            console.log('📖 Parsing PDF...');
            const data = await pdf(pdfBuffer);
            console.log(`✅ Extracted text from ${data.numpages} pages`);

            // Extract document structure
            console.log('🔍 Analyzing document structure...');
            const sections = MetadataExtractor.parseDocumentStructure(data.text);
            console.log(`✅ Found ${sections.length} sections`);

            if (sections.length === 0) {
                return {
                    success: false,
                    message: 'No sections found in PDF. Check document format.',
                    stats: { pages: data.numpages }
                };
            }

            // Create hierarchical chunks
            console.log('✂️  Creating hierarchical chunks...');
            const rawChunks = HierarchicalChunker.createHierarchicalChunks(
                sections,
                fileName,
                childChunkSize,
                childOverlap
            );
            console.log(`📦 Generated ${rawChunks.length} raw chunks`);

            // Deduplicate
            console.log('🗑️  Removing duplicates...');
            const deduplicatedChunks = HierarchicalChunker.deduplicateChunks(rawChunks);
            console.log(`✅ ${deduplicatedChunks.length} unique chunks after deduplication`);

            // TWO-PASS SAVING
            // NOTE: Contextual content generation is disabled for now
            // To re-enable, set ENABLE_CONTEXTUAL_CONTENT = true
            const ENABLE_CONTEXTUAL_CONTENT = false; // Set to true to enable contextual content generation
            const BATCH_SIZE = ENABLE_CONTEXTUAL_CONTENT ? 25 : 50; // Use larger batches when not generating context
            const DELAY_MS = ENABLE_CONTEXTUAL_CONTENT ? 2500 : 1500; // Less delay needed without context generation

            // Map to store chunk entities by their original index
            const chunkEntities: { [key: number]: DocumentChunkRecursive } = {};

            console.log('\n📝 PASS 1: Generating embeddings and saving chunks...');

            for (let i = 0; i < deduplicatedChunks.length; i += BATCH_SIZE) {
                const batch = deduplicatedChunks.slice(i, i + BATCH_SIZE);
                const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
                const totalBatches = Math.ceil(deduplicatedChunks.length / BATCH_SIZE);

                console.log(`📦 Batch ${batchNumber}/${totalBatches} (Chunks ${i + 1}-${Math.min(i + BATCH_SIZE, deduplicatedChunks.length)})`);

                const embeddingPromises = batch.map(async (chunkData: ChunkWithMetadata) => {
                    try {
                        let contentToEmbed = chunkData.content;
                        let contextSummary: string | undefined;

                        // Contextual Retrieval: Generate context for CHILD chunks only
                        // NOTE: Currently disabled - set ENABLE_CONTEXTUAL_CONTENT = true to enable
                        if (ENABLE_CONTEXTUAL_CONTENT && chunkData.metadata.type === 'child' && chunkData.parentContent) {
                            try {
                                contextSummary = await generateChunkContext(
                                    chunkData.content,
                                    chunkData.parentContent,
                                    {
                                        parva: chunkData.metadata.parva,
                                        chapter: chunkData.metadata.chapter,
                                        section_title: chunkData.metadata.section_title,
                                        speaker: chunkData.metadata.speaker
                                    }
                                );

                                // Format: [CONTEXT]\n{context}\n\n[CONTENT]\n{original}
                                contentToEmbed = `[CONTEXT]\n${contextSummary}\n\n[CONTENT]\n${chunkData.content}`;

                                console.log(`   📝 Generated context for chunk ${chunkData.metadata.chunk_index}`);
                            } catch (err) {
                                console.warn(`   ⚠️  Context generation failed for chunk ${chunkData.metadata.chunk_index}, using original content`);
                            }
                        }

                        // Generate embedding with contextual content
                        const embedding = await generateEmbedding(contentToEmbed);

                        const chunk = new DocumentChunkRecursive();
                        chunk.content = chunkData.content; // Store original content
                        chunk.contextualContent = contentToEmbed !== chunkData.content ? contentToEmbed : null;
                        chunk.religion = religion;
                        chunk.textSource = textSource;
                        chunk.docCategory = docCategory;
                        chunk.metadata = {
                            ...chunkData.metadata,
                            has_context: contentToEmbed !== chunkData.content,
                            context_summary: contextSummary
                        };
                        chunk.embedding = embedding;
                        chunk.contentHash = chunkData.contentHash;
                        chunk.parentId = null; // Will be set in second pass

                        return {
                            chunk,
                            originalIndex: chunkData.metadata.chunk_index,
                            parentIndex: chunkData.parentIndex
                        };
                    } catch (err) {
                        console.error(`   ❌ Failed chunk ${chunkData.metadata.chunk_index}:`, err);
                        return null;
                    }
                });

                const results = await Promise.all(embeddingPromises);
                const validResults = results.filter(r => r !== null);

                if (validResults.length > 0) {
                    const saved = await chunkRepository.save(validResults.map(r => r!.chunk));

                    // Store mapping for parent-child relationships
                    validResults.forEach((result, idx) => {
                        chunkEntities[result!.originalIndex] = saved[idx];
                    });

                    console.log(`   ✅ Saved ${validResults.length} chunks`);
                }

                if (i + BATCH_SIZE < deduplicatedChunks.length) {
                    console.log(`   ⏳ Cooling down ${DELAY_MS}ms...`);
                    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
                }
            }

            // PASS 2: Update parent-child relationships
            console.log('\n🔗 PASS 2: Linking parent-child relationships...');
            const updates: DocumentChunkRecursive[] = [];

            deduplicatedChunks.forEach(chunkData => {
                if (chunkData.parentIndex !== undefined) {
                    const childEntity = chunkEntities[chunkData.metadata.chunk_index];
                    const parentEntity = chunkEntities[chunkData.parentIndex];

                    if (childEntity && parentEntity) {
                        childEntity.parentId = parentEntity.id;
                        updates.push(childEntity);
                    }
                }
            });

            if (updates.length > 0) {
                // Update in batches using raw SQL
                for (let i = 0; i < updates.length; i += 100) {
                    const batch = updates.slice(i, i + 100);

                    for (const chunk of batch) {
                        await AppDataSource.query(
                            `UPDATE knowledge_base_chunks SET "parentId" = $1 WHERE id = $2`,
                            [chunk.parentId, chunk.id]
                        );
                    }

                    console.log(`   Updated ${Math.min(i + 100, updates.length)}/${updates.length} child chunks...`);
                }
                console.log(`✅ Linked ${updates.length} child chunks to parents`);
            }

            // Final statistics
            const totalChunks = Object.keys(chunkEntities).length;
            const parentChunks = await chunkRepository.count({
                where: { metadata: { type: 'parent' } as any }
            });
            const childChunks = await chunkRepository.count({
                where: { metadata: { type: 'child' } as any }
            });

            console.log('\n📊 Final Statistics:');
            console.log(`   Total chunks: ${totalChunks}`);
            console.log(`   Parent chunks: ${parentChunks} (full sections)`);
            console.log(`   Child chunks: ${childChunks} (semantic units)`);
            console.log('\n🎉 Hierarchical ingestion complete!');

            return {
                success: true,
                message: 'Document ingested successfully with hierarchical chunking',
                stats: {
                    totalChunks,
                    parentChunks,
                    childChunks,
                    pages: data.numpages,
                    sections: sections.length,
                    duplicatesRemoved: rawChunks.length - deduplicatedChunks.length
                }
            };
        } catch (error) {
            console.error('❌ Ingestion failed:', error);
            throw error;
        }
    }
}

export const ingestionService = new IngestionService();
