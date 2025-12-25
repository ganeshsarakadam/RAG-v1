import fs from 'fs';
import path from 'path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
const pdf = require('pdf-parse');
import { AppDataSource, initializeDatabase } from '../config/database';
import { DocumentChunkRecursive } from '../entities/DocumentChunkRecursive';
import { generateEmbedding } from '../utils/gemini';
import { recursiveChunking } from '../utils/recursive-chunking';
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
        console.log(`✅ Text extracted! Total pages: ${data.numpages}`);

        // 4. Chunking
        const chunks = recursiveChunking(data.text, 1000, 200);
        console.log(`ℹ️  Total Chunks to Process: ${chunks.length}`);

        // 5. Process in Batches
        const BATCH_SIZE = 50;
        const DELAY_MS = 2000;

        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

            console.log(`📦 Processing Batch ${batchNumber}/${totalBatches} (Chunks ${i + 1}-${Math.min(i + BATCH_SIZE, chunks.length)})...`);

            const embeddingPromises = batch.map(async (chunkText, index) => {
                try {
                    const text = chunkText.trim();
                    if (!text) return null;

                    const embedding = await generateEmbedding(text);

                    const chunk = new DocumentChunkRecursive();
                    chunk.content = text;
                    chunk.metadata = {
                        source: `s3://${S3_BUCKET_NAME}/${S3_FILE_KEY}`,
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

            const results = await Promise.all(embeddingPromises);
            const validChunks = results.filter(c => c !== null) as DocumentChunkRecursive[];

            if (validChunks.length > 0) {
                await chunkRepository.save(validChunks);
                console.log(`   ✅ Saved ${validChunks.length} chunks.`);
            }

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

ingestFileFromS3();
