import fs from 'fs';
import path from 'path';
const pdf = require('pdf-parse');
import { AppDataSource, initializeDatabase } from '../config/database';
import { DocumentChunkRecursive } from '../entities/DocumentChunkRecursive';
import { generateEmbedding } from '../utils/gemini';
import { recursiveChunking } from '../utils/recursive-chunking';

const PDF_FILE_NAME = 'Mahabharata (Unabridged in English).pdf';
// Assume the file is in the root of the project (parent of src)
const FILE_PATH = path.join(__dirname, '../../', PDF_FILE_NAME);

const ingestFile = async () => {
    try {
        console.log(`🚀 Starting ingestion for: ${FILE_PATH}`);

        if (!fs.existsSync(FILE_PATH)) {
            console.error(`❌ File not found: ${FILE_PATH}`);
            process.exit(1);
        }

        // 1. Initialize DB
        await initializeDatabase();
        const chunkRepository = AppDataSource.getRepository(DocumentChunkRecursive);

        // 3. Chunking Strategy (Do this BEFORE deciding to skip, to know expected count? 
        // No, parsing PDF is expensive. Let's check DB count first.)

        const existingCount = await chunkRepository.count();
        console.log(`📊 Current DB Count: ${existingCount}`);

        // Idempotency: If we have a significant number of chunks (e.g. > 1000), assume ingestion is done.
        // The demo run had 10.
        if (existingCount > 1000) {
            console.log(`✅ Database appears to be fully populated (${existingCount} chunks). Skipping ingestion.`);
            process.exit(0);
        }

        // If partial or empty, clear and start fresh
        if (existingCount > 0) {
            console.log('🧹 Clearing partial/demo data...');
            await chunkRepository.clear();
        }

        // 2. Read PDF
        console.log('📖 Parsing PDF (this may take a moment)...');
        const dataBuffer = fs.readFileSync(FILE_PATH);
        const data = await pdf(dataBuffer);
        console.log(`✅ Text extracted! Total pages: ${data.numpages}`);

        // 3. Chunking
        const chunks = recursiveChunking(data.text, 1000, 200);
        console.log(`ℹ️  Total Chunks to Process: ${chunks.length}`);

        // 4. Process in Batches
        const BATCH_SIZE = 50; // Process 50 chunks at a time
        const DELAY_MS = 2000; // 2 seconds delay between batches to respect rate limits

        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

            console.log(`📦 Processing Batch ${batchNumber}/${totalBatches} (Chunks ${i + 1}-${Math.min(i + BATCH_SIZE, chunks.length)})...`);

            const chunksToSave: DocumentChunkRecursive[] = [];
            const embeddingPromises = batch.map(async (chunkText, index) => {
                try {
                    const text = chunkText.trim();
                    if (!text) return null;

                    // Add a small jitter/delay per request if needed, but parallel might work for small batches
                    const embedding = await generateEmbedding(text);

                    const chunk = new DocumentChunkRecursive();
                    chunk.content = text;
                    chunk.metadata = {
                        source: PDF_FILE_NAME,
                        chunk_index: i + index,
                        type: 'recursive-chunking'
                    };
                    chunk.embedding = embedding;
                    return chunk;
                } catch (err) {
                    console.error(`   ❌ Failed to embed chunk ${i + index}:`, err);
                    return null;
                }
            });

            // Wait for all embeddings in this batch
            const results = await Promise.all(embeddingPromises);
            const validChunks = results.filter(c => c !== null) as DocumentChunkRecursive[];

            if (validChunks.length > 0) {
                await chunkRepository.save(validChunks);
                console.log(`   ✅ Saved ${validChunks.length} chunks.`);
            }

            // Rate Limit Delay
            if (i + BATCH_SIZE < chunks.length) {
                console.log(`   ⏳ Cooling down for ${DELAY_MS}ms...`);
                await new Promise(pkg => setTimeout(pkg, DELAY_MS));
            }
        }

        console.log('🎉 Full Ingestion Complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Ingestion failed:', error);
        process.exit(1);
    }
};

ingestFile();
