import fs from 'fs';
import path from 'path';
const pdf = require('pdf-parse');
import { AppDataSource, initializeDatabase } from '../config/database';
import { DocumentChunkRecursive } from '../entities/DocumentChunkRecursive';
import { generateEmbedding, generateChunkContext } from '../utils/gemini';
import { MetadataExtractor, PageInfo } from '../utils/metadata-extractor';
import { HierarchicalChunker, ChunkWithMetadata } from '../utils/hierarchical-chunking';

const PDF_FILE_NAME = 'Mahabharata (Unabridged in English).pdf';
const FILE_PATH = path.join(__dirname, '../../', PDF_FILE_NAME);

/**
 * Parse PDF page-by-page to get accurate page boundaries
 * Returns both the full text and the page map
 */
async function parsePdfWithPages(pdfBuffer: Buffer): Promise<{ text: string; pages: PageInfo[] }> {
    const pages: PageInfo[] = [];
    let fullText = '';
    let currentIndex = 0;

    // Custom page render function that processes each page
    const renderPage = (pageData: any) => {
        return pageData.getTextContent()
            .then((textContent: any) => {
                // Extract text from this page
                let pageText = '';
                let lastY: number | null = null;

                for (const item of textContent.items) {
                    // Add newline if y position changes (new line)
                    if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                        pageText += '\n';
                    }
                    pageText += item.str;
                    lastY = item.transform[5];
                }

                const pageNum = pages.length + 1;
                const startIndex = currentIndex;

                pages.push({
                    pageNum,
                    startIndex,
                    endIndex: 0, // Will be updated after adding separator
                    charCount: pageText.length
                });

                fullText += pageText + '\n';  // Add separator between pages
                currentIndex = fullText.length;

                // Update endIndex after adding separator
                pages[pages.length - 1].endIndex = currentIndex;

                // Log progress every 200 pages
                if (pageNum % 200 === 0) {
                    console.log(`   📄 Processed page ${pageNum}...`);
                }

                return pageText;
            });
    };

    const options = {
        pagerender: renderPage
    };

    await pdf(pdfBuffer, options);

    return { text: fullText, pages };
}

const ingestFile = async () => {
    try {
        console.log(`🚀 Starting hierarchical ingestion for: ${FILE_PATH}`);
        console.log(`📋 This will create parent chunks (full sections) and child chunks (semantic units)`);

        if (!fs.existsSync(FILE_PATH)) {
            console.error(`❌ File not found: ${FILE_PATH}`);
            process.exit(1);
        }

        // 1. Initialize DB
        await initializeDatabase();
        const chunkRepository = AppDataSource.getRepository(DocumentChunkRecursive);

        // 2. Check existing data
        const existingCount = await chunkRepository.count();
        console.log(`📊 Current DB Count: ${existingCount}`);

        // Check for --force flag to allow re-ingestion
        const forceReIngest = process.argv.includes('--force');

        if (existingCount > 1000 && !forceReIngest) {
            console.log(`✅ Database appears populated (${existingCount} chunks).`);
            console.log(`ℹ️  To re-ingest, run with --force flag:`);
            console.log(`   npx ts-node src/scripts/ingest-local.ts --force`);
            process.exit(0);
        }

        if (existingCount > 0) {
            console.log('🧹 Clearing existing data before re-ingestion...');
            await chunkRepository.clear();
            console.log('✅ Database cleared');
        }

        // 3. Parse PDF page-by-page for accurate page numbers
        console.log('📖 Parsing PDF page-by-page (this takes ~30s for accurate page tracking)...');
        const dataBuffer = fs.readFileSync(FILE_PATH);
        const { text: pdfText, pages: pageMap } = await parsePdfWithPages(dataBuffer);
        console.log(`✅ Extracted text from ${pageMap.length} pages (${pdfText.length} characters)`);

        // 4. Extract document structure (Parva/Section boundaries) with accurate page numbers
        console.log('🔍 Analyzing document structure with page tracking...');
        const sections = MetadataExtractor.parseDocumentStructureWithPages(pdfText, pageMap);
        console.log(`✅ Found ${sections.length} sections`);

        if (sections.length === 0) {
            console.error('❌ No sections found in PDF. Check pattern matching logic.');
            process.exit(1);
        }

        // 5. Create hierarchical chunks
        console.log('✂️  Creating hierarchical chunks...');
        const rawChunks = HierarchicalChunker.createHierarchicalChunks(
            sections,
            PDF_FILE_NAME,
            1000,  // child chunk size
            200    // child overlap
        );
        console.log(`📦 Generated ${rawChunks.length} raw chunks`);

        // 6. Deduplicate
        console.log('🗑️  Removing duplicates...');
        const deduplicatedChunks = HierarchicalChunker.deduplicateChunks(rawChunks);
        console.log(`✅ ${deduplicatedChunks.length} unique chunks after deduplication`);

        // 7. TWO-PASS SAVING
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
                    chunk.religion = 'hinduism';
                    chunk.textSource = 'mahabharatam';
                    chunk.docCategory = 'scripture';
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

        // 8. PASS 2: Update parent-child relationships
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
            // Update in batches using raw SQL to avoid generated column issues
            for (let i = 0; i < updates.length; i += 100) {
                const batch = updates.slice(i, i + 100);

                // Use raw SQL to update only the parentId column
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

        // 9. Final statistics
        console.log('\n📊 Final Statistics:');
        const totalChunks = Object.keys(chunkEntities).length;
        const parentChunks = await chunkRepository.count({
            where: { metadata: { type: 'parent' } as any }
        });
        const childChunks = await chunkRepository.count({
            where: { metadata: { type: 'child' } as any }
        });

        console.log(`   Total chunks: ${totalChunks}`);
        console.log(`   Parent chunks: ${parentChunks} (full sections)`);
        console.log(`   Child chunks: ${childChunks} (semantic units)`);

        console.log('\n🎉 Hierarchical ingestion complete!');
        console.log('\n💡 Next steps:');
        console.log('   - Run: npm run validate-metadata (to verify metadata extraction)');
        console.log('   - Run: npm run test-hierarchy (to test parent-child relationships)');

        process.exit(0);
    } catch (error) {
        console.error('❌ Ingestion failed:', error);
        process.exit(1);
    }
};

ingestFile();
