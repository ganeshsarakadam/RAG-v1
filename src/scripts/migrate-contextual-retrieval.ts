import { AppDataSource, initializeDatabase } from '../config/database';
import { DocumentChunkRecursive } from '../entities/DocumentChunkRecursive';
import { generateEmbedding, generateChunkContext } from '../utils/gemini';

/**
 * Migration Script: Add Anthropic Contextual Retrieval to Existing Chunks
 *
 * This script:
 * 1. Fetches all child chunks with their parent chunks
 * 2. Generates contextual descriptions using parent content
 * 3. Prepends context to chunk content
 * 4. Re-generates embeddings with contextual content
 * 5. Updates database with new embeddings and metadata
 *
 * Run with: npm run migrate:contextual-retrieval
 */

interface MigrationProgress {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
}

async function migrateToContextualRetrieval() {
    const progress: MigrationProgress = {
        total: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0
    };

    try {
        console.log('🚀 Starting Contextual Retrieval Migration');
        console.log('='.repeat(60));
        console.log('This will add context-aware embeddings to all child chunks');
        console.log('using Anthropic\'s Contextual Retrieval technique.\n');

        // Initialize database
        await initializeDatabase();
        const chunkRepo = AppDataSource.getRepository(DocumentChunkRecursive);

        // Count chunks
        const totalChunks = await chunkRepo.count();
        const childChunks = await chunkRepo
            .createQueryBuilder('chunk')
            .where("chunk.metadata->>'type' = 'child'")
            .getCount();
        const chunksWithContext = await chunkRepo
            .createQueryBuilder('chunk')
            .where("chunk.metadata->>'has_context' = 'true'")
            .getCount();

        console.log('📊 Database Statistics:');
        console.log(`   Total chunks: ${totalChunks.toLocaleString()}`);
        console.log(`   Child chunks: ${childChunks.toLocaleString()}`);
        console.log(`   Already migrated: ${chunksWithContext.toLocaleString()}\n`);

        if (chunksWithContext === childChunks && childChunks > 0) {
            console.log('✅ All chunks already have contextual embeddings!');
            await AppDataSource.destroy();
            return;
        }

        const chunksToMigrate = childChunks - chunksWithContext;
        console.log(`🎯 Chunks to migrate: ${chunksToMigrate.toLocaleString()}\n`);

        // Estimate time and cost
        const estimatedMinutes = Math.ceil((chunksToMigrate * 2 * 1000) / (1000 * 60)); // 2 API calls per chunk, 1s avg
        const estimatedCost = (chunksToMigrate * 0.0001 * 2).toFixed(2); // ~$0.0001 per API call
        console.log('⏱️  Estimated time: ~' + estimatedMinutes + ' minutes');
        console.log('💰 Estimated cost: ~$' + estimatedCost + ' USD\n');

        // Confirm migration
        console.log('⚠️  This will re-generate embeddings for all child chunks.');
        console.log('   Press Ctrl+C now to cancel, or wait 5 seconds to continue...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log('🔄 Starting migration...\n');

        // Batch configuration (optimized for TPM limits)
        const BATCH_SIZE = 5;   // Very small batches to avoid TPM limits (4M tokens/min)
        const DELAY_MS = 10000;  // 10 second delay between batches to respect rate limits
        const SAVE_BATCH_SIZE = 100;  // Save to DB in larger batches

        progress.total = chunksToMigrate;
        const failedChunks: string[] = [];
        const updateQueue: DocumentChunkRecursive[] = [];

        // Process in batches
        let offset = 0;
        let batchNumber = 0;
        const totalBatches = Math.ceil(chunksToMigrate / BATCH_SIZE);

        while (offset < chunksToMigrate) {
            batchNumber++;
            console.log(`\n📦 Batch ${batchNumber}/${totalBatches}`);
            console.log('─'.repeat(60));

            // Fetch child chunks that need migration
            const chunks = await chunkRepo
                .createQueryBuilder('chunk')
                .where("chunk.metadata->>'type' = 'child'")
                .andWhere("(chunk.metadata->>'has_context' IS NULL OR chunk.metadata->>'has_context' = 'false')")
                .skip(offset)
                .take(BATCH_SIZE)
                .getMany();

            if (chunks.length === 0) break;

            // Process chunks in parallel (within batch)
            const processingPromises = chunks.map(async (chunk) => {
                try {
                    // Fetch parent chunk
                    if (!chunk.parentId) {
                        console.log(`   ⚠️  Skipping chunk ${chunk.id} (no parent)`);
                        progress.skipped++;
                        return null;
                    }

                    const parent = await chunkRepo.findOne({
                        where: { id: chunk.parentId }
                    });

                    if (!parent) {
                        console.log(`   ⚠️  Skipping chunk ${chunk.id} (parent not found)`);
                        progress.skipped++;
                        return null;
                    }

                    // Generate context
                    const contextSummary = await generateChunkContext(
                        chunk.content,
                        parent.content,
                        {
                            parva: chunk.metadata.parva,
                            chapter: chunk.metadata.chapter,
                            section_title: chunk.metadata.section_title,
                            speaker: chunk.metadata.speaker
                        }
                    );

                    // Create contextual content
                    const contextualContent = `[CONTEXT]\n${contextSummary}\n\n[CONTENT]\n${chunk.content}`;

                    // Generate new embedding
                    const embedding = await generateEmbedding(contextualContent);

                    // Update chunk
                    chunk.contextualContent = contextualContent;
                    chunk.embedding = embedding;
                    chunk.metadata = {
                        ...chunk.metadata,
                        has_context: true,
                        context_summary: contextSummary
                    };

                    progress.succeeded++;
                    return chunk;

                } catch (error) {
                    console.error(`   ❌ Failed chunk ${chunk.id}:`, error);
                    failedChunks.push(chunk.id);
                    progress.failed++;
                    return null;
                }
            });

            const results = await Promise.all(processingPromises);
            const validChunks = results.filter(c => c !== null) as DocumentChunkRecursive[];

            // Add to update queue
            updateQueue.push(...validChunks);

            // Save to database in larger batches
            if (updateQueue.length >= SAVE_BATCH_SIZE) {
                console.log(`   💾 Saving ${updateQueue.length} chunks to database...`);

                for (const chunk of updateQueue) {
                    await AppDataSource.query(
                        `UPDATE knowledge_base_chunks
                         SET "contextualContent" = $1,
                             embedding = $2,
                             metadata = $3
                         WHERE id = $4`,
                        [
                            chunk.contextualContent,
                            JSON.stringify(chunk.embedding),
                            JSON.stringify(chunk.metadata),
                            chunk.id
                        ]
                    );
                }

                console.log(`   ✅ Saved ${updateQueue.length} chunks`);
                updateQueue.length = 0;  // Clear queue
            }

            progress.processed += chunks.length;
            const percentComplete = Math.round((progress.processed / progress.total) * 100);

            console.log(`   Progress: ${progress.processed}/${progress.total} (${percentComplete}%)`);
            console.log(`   ✅ Succeeded: ${progress.succeeded} | ❌ Failed: ${progress.failed} | ⏭️  Skipped: ${progress.skipped}`);

            offset += BATCH_SIZE;

            // Rate limiting delay
            if (offset < chunksToMigrate) {
                console.log(`   ⏳ Cooling down ${DELAY_MS}ms...`);
                await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            }
        }

        // Save remaining chunks
        if (updateQueue.length > 0) {
            console.log(`\n💾 Saving final ${updateQueue.length} chunks...`);
            for (const chunk of updateQueue) {
                await AppDataSource.query(
                    `UPDATE knowledge_base_chunks
                     SET "contextualContent" = $1,
                         embedding = $2,
                         metadata = $3
                     WHERE id = $4`,
                    [
                        chunk.contextualContent,
                        JSON.stringify(chunk.embedding),
                        JSON.stringify(chunk.metadata),
                        chunk.id
                    ]
                );
            }
            console.log(`✅ Saved ${updateQueue.length} chunks`);
        }

        // Final statistics
        console.log('\n' + '='.repeat(60));
        console.log('📊 Migration Complete!\n');
        console.log('Final Statistics:');
        console.log(`   Total processed: ${progress.processed.toLocaleString()}`);
        console.log(`   ✅ Successfully migrated: ${progress.succeeded.toLocaleString()}`);
        console.log(`   ❌ Failed: ${progress.failed.toLocaleString()}`);
        console.log(`   ⏭️  Skipped: ${progress.skipped.toLocaleString()}`);

        if (failedChunks.length > 0) {
            console.log(`\n⚠️  Failed chunk IDs (${failedChunks.length}):`);
            console.log(failedChunks.slice(0, 10).join(', '));
            if (failedChunks.length > 10) {
                console.log(`   ... and ${failedChunks.length - 10} more`);
            }
        }

        // Verify migration
        const verifyCount = await chunkRepo
            .createQueryBuilder('chunk')
            .where("chunk.metadata->>'has_context' = 'true'")
            .getCount();

        console.log(`\n✅ Verification: ${verifyCount.toLocaleString()} chunks now have contextual embeddings`);

        console.log('\n💡 Next steps:');
        console.log('   1. Test retrieval quality with: npm run validate:contextual-retrieval');
        console.log('   2. Compare before/after accuracy');
        console.log('   3. Future ingestions will automatically use contextual retrieval\n');

        await AppDataSource.destroy();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        console.log('\n📊 Progress when failed:');
        console.log(`   Processed: ${progress.processed}/${progress.total}`);
        console.log(`   Succeeded: ${progress.succeeded}`);
        console.log(`   Failed: ${progress.failed}`);

        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
        }
        process.exit(1);
    }
}

// Run migration
if (require.main === module) {
    migrateToContextualRetrieval();
}

export { migrateToContextualRetrieval };
