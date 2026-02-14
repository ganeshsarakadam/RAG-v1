import fs from 'fs';
import path from 'path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
const pdf = require('pdf-parse');
import { AppDataSource, initializeDatabase } from '../config/database';
import { DocumentChunkRecursive } from '../entities/DocumentChunkRecursive';
import { generateEmbedding, generateChunkContext } from '../utils/gemini';
import { MetadataExtractor } from '../utils/metadata-extractor';
import { HierarchicalChunker, ChunkWithMetadata } from '../utils/hierarchical-chunking';
import dotenv from 'dotenv';
dotenv.config();

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || '';
const S3_FILE_KEY = 'Mahabharata (Unabridged in English).pdf';
const REGION = process.env.AWS_REGION || 'us-east-1';

// Initialize S3 Client
const s3Client = new S3Client({ region: REGION });

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
};

const ingestFileFromS3 = async () => {
    try {
        console.log(`🚀 Starting ingestion from S3 Bucket: ${S3_BUCKET_NAME}, Key: ${S3_FILE_KEY}`);

        if (!S3_BUCKET_NAME) {
            console.error('❌ S3_BUCKET_NAME is not defined in environment variables.');
            process.exit(1);
        }

        // 1. Initialize DB
        await initializeDatabase();
        const chunkRepository = AppDataSource.getRepository(DocumentChunkRecursive);

        const existingCount = await chunkRepository.count();
        console.log(`📊 Current DB Count: ${existingCount}`);

        if (existingCount > 1000) {
            console.log(`✅ Database appears to be fully populated (${existingCount} chunks). Skipping ingestion.`);
            process.exit(0);
        }

        if (existingCount > 0) {
            console.log('🧹 Clearing partial/demo data...');
            await chunkRepository.clear();
        }

        // 2. Fetch PDF from S3
        console.log('⬇️  Downloading PDF from S3...');
        const command = new GetObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: S3_FILE_KEY,
        });

        const response = await s3Client.send(command);
        if (!response.Body) {
            throw new Error('S3 object body is empty');
        }
        const dataBuffer = await streamToBuffer(response.Body as Readable);
        console.log(`✅ PDF Downloaded! Size: ${dataBuffer.length} bytes`);

        // 3. Parse PDF
        console.log('📖 Parsing PDF content...');
        const data = await pdf(dataBuffer);
        console.log(`✅ Extracted text from ${data.numpages} pages`);

        // 4. Extract document structure
        console.log('🔍 Analyzing document structure...');
        const sections = MetadataExtractor.parseDocumentStructure(data.text);
        console.log(`✅ Found ${sections.length} sections`);

        if (sections.length === 0) {
            console.error('❌ No sections found in PDF. Check pattern matching logic.');
            process.exit(1);
        }

        // 5. Create hierarchical chunks
        console.log('✂️  Creating hierarchical chunks...');
        const sourcePath = `s3://${S3_BUCKET_NAME}/${S3_FILE_KEY}`;
        const rawChunks = HierarchicalChunker.createHierarchicalChunks(
            sections,
            sourcePath,
            1000,
            200
        );
        console.log(`📦 Generated ${rawChunks.length} raw chunks`);

        // 6. Deduplicate
        console.log('🗑️  Removing duplicates...');
        const deduplicatedChunks = HierarchicalChunker.deduplicateChunks(rawChunks);
        console.log(`✅ ${deduplicatedChunks.length} unique chunks after deduplication`);

        // 7. TWO-PASS SAVING
        const BATCH_SIZE = 25; // Reduced from 50 for contextual retrieval (more API calls per chunk)
        const DELAY_MS = 2500; // Increased from 2000 for rate limiting
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
                    if (chunkData.metadata.type === 'child' && chunkData.parentContent) {
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
                    chunk.metadata = {
                        ...chunkData.metadata,
                        has_context: contentToEmbed !== chunkData.content,
                        context_summary: contextSummary
                    };
                    chunk.embedding = embedding;
                    chunk.contentHash = chunkData.contentHash;
                    chunk.parentId = null;

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
        process.exit(0);

    } catch (error) {
        console.error('❌ Ingestion failed:', error);
        process.exit(1);
    }
};

ingestFileFromS3();
