import { AppDataSource, initializeDatabase } from '../config/database';
import { DocumentChunkRecursive } from '../entities/DocumentChunkRecursive';

/**
 * Validate contextual retrieval migration quality
 *
 * Run with: npm run validate:contextual-retrieval
 */
async function validateContextualRetrieval() {
    try {
        console.log('🔍 Validating Contextual Retrieval Migration\n');

        await initializeDatabase();
        const chunkRepo = AppDataSource.getRepository(DocumentChunkRecursive);

        // 1. Count statistics
        const totalChunks = await chunkRepo.count();
        const childChunks = await chunkRepo
            .createQueryBuilder('chunk')
            .where("chunk.metadata->>'type' = 'child'")
            .getCount();
        const contextualized = await chunkRepo
            .createQueryBuilder('chunk')
            .where("chunk.metadata->>'has_context' = 'true'")
            .getCount();

        console.log('📊 Statistics:');
        console.log(`   Total chunks: ${totalChunks.toLocaleString()}`);
        console.log(`   Child chunks: ${childChunks.toLocaleString()}`);
        console.log(`   Contextual chunks: ${contextualized.toLocaleString()}`);
        if (childChunks > 0) {
            console.log(`   Coverage: ${Math.round((contextualized / childChunks) * 100)}%\n`);
        } else {
            console.log(`   Coverage: N/A (no child chunks)\n`);
        }

        // 2. Sample contextual chunks
        console.log('📝 Sample Contextual Chunks:\n');

        const samples = await chunkRepo
            .createQueryBuilder('chunk')
            .where("chunk.metadata->>'has_context' = 'true'")
            .orderBy('RANDOM()')
            .limit(5)
            .getMany();

        if (samples.length === 0) {
            console.log('   No contextual chunks found. Run migration first.\n');
        } else {
            samples.forEach((chunk, idx) => {
                console.log(`Sample ${idx + 1}:`);
                console.log(`ID: ${chunk.id}`);
                console.log(`Parva: ${chunk.metadata.parva || 'N/A'}`);
                console.log(`Section: ${chunk.metadata.section_title || 'N/A'}`);
                console.log(`Context: ${chunk.metadata.context_summary || 'N/A'}`);
                console.log(`Original (first 100 chars): ${chunk.content.substring(0, 100)}...`);
                if (chunk.contextualContent) {
                    console.log(`Contextual (first 200 chars): ${chunk.contextualContent.substring(0, 200)}...`);
                }
                console.log('─'.repeat(60) + '\n');
            });
        }

        // 3. Check for issues
        const missingContextualContent = await chunkRepo
            .createQueryBuilder('chunk')
            .where("chunk.metadata->>'has_context' = 'true'")
            .andWhere('chunk.contextualContent IS NULL')
            .getCount();

        const missingEmbeddings = await chunkRepo
            .createQueryBuilder('chunk')
            .where("chunk.metadata->>'has_context' = 'true'")
            .andWhere('chunk.embedding IS NULL')
            .getCount();

        if (missingContextualContent > 0 || missingEmbeddings > 0) {
            console.log('⚠️  Issues Found:');
            if (missingContextualContent > 0) {
                console.log(`   - ${missingContextualContent} chunks marked as contextualized but missing contextualContent`);
            }
            if (missingEmbeddings > 0) {
                console.log(`   - ${missingEmbeddings} chunks missing embeddings`);
            }
            console.log('');
        } else {
            console.log('✅ No data integrity issues found\n');
        }

        // 4. Distribution analysis
        console.log('📈 Distribution Analysis:\n');

        const parentChunks = await chunkRepo
            .createQueryBuilder('chunk')
            .where("chunk.metadata->>'type' = 'parent'")
            .getCount();

        const contextualizedParents = await chunkRepo
            .createQueryBuilder('chunk')
            .where("chunk.metadata->>'type' = 'parent'")
            .andWhere("chunk.metadata->>'has_context' = 'true'")
            .getCount();

        console.log(`   Parent chunks: ${parentChunks.toLocaleString()}`);
        console.log(`   Contextualized parents: ${contextualizedParents.toLocaleString()} (should be 0)`);
        console.log(`   Child chunks: ${childChunks.toLocaleString()}`);
        console.log(`   Contextualized children: ${contextualized.toLocaleString()}`);

        if (contextualizedParents > 0) {
            console.log(`\n   ⚠️  Warning: ${contextualizedParents} parent chunks have context (unexpected)`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ Validation Complete\n');

        await AppDataSource.destroy();
        process.exit(0);

    } catch (error) {
        console.error('❌ Validation failed:', error);
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
        }
        process.exit(1);
    }
}

validateContextualRetrieval();
