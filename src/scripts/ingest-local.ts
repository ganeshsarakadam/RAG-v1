import fs from 'fs';
import path from 'path';
const pdf = require('pdf-parse');
import { AppDataSource, initializeDatabase } from '../config/database';
import { DocumentChunkRecursive } from '../entities/DocumentChunkRecursive';
import { generateEmbedding } from '../utils/gemini';
import { MetadataExtractor } from '../utils/metadata-extractor';
import { HierarchicalChunker, ChunkWithMetadata } from '../utils/hierarchical-chunking';

const PDF_FILE_NAME = 'Mahabharata (Unabridged in English).pdf';
const FILE_PATH = path.join(__dirname, '../../', PDF_FILE_NAME);

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

        if (existingCount > 1000) {
            console.log(`✅ Database appears populated (${existingCount} chunks).`);
            console.log(`ℹ️  To re-ingest with hierarchical chunking, manually clear the database first.`);
            console.log(`   Run: psql knowledge_db -c "TRUNCATE TABLE document_chunk_recursive;"`);
            process.exit(0);
        }

        if (existingCount > 0) {
            console.log('🧹 Clearing partial data...');
            await chunkRepository.clear();
        }

        // 3. Parse PDF
        console.log('📖 Parsing PDF (this may take a moment)...');
        const dataBuffer = fs.readFileSync(FILE_PATH);
        const data = await pdf(dataBuffer);
        console.log(`✅ Extracted text from ${data.numpages} pages`);

        // 4. Extract document structure (Parva/Section boundaries)
        console.log('🔍 Analyzing document structure...');
        const sections = MetadataExtractor.parseDocumentStructure(data.text);
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
        const BATCH_SIZE = 50;
        const DELAY_MS = 2000;

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
                    const embedding = await generateEmbedding(chunkData.content);

                    const chunk = new DocumentChunkRecursive();
                    chunk.content = chunkData.content;
                    chunk.metadata = chunkData.metadata;
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
                        `UPDATE document_chunk_recursive SET "parentId" = $1 WHERE id = $2`,
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
