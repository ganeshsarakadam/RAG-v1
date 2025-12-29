import { AppDataSource, initializeDatabase } from '../config/database';
import { DocumentChunkRecursive } from '../entities/DocumentChunkRecursive';

const validateMetadata = async () => {
    try {
        await initializeDatabase();
        const repo = AppDataSource.getRepository(DocumentChunkRecursive);

        console.log('🔍 Metadata Validation Report\n');
        console.log('='.repeat(60));

        // 1. Overall statistics
        const totalChunks = await repo.count();
        console.log(`\n📊 Overall Statistics:`);
        console.log(`   Total chunks: ${totalChunks}`);

        // 2. Count by type
        const parentCount = await repo.createQueryBuilder('chunk')
            .where("chunk.metadata->>'type' = :type", { type: 'parent' })
            .getCount();

        const childCount = await repo.createQueryBuilder('chunk')
            .where("chunk.metadata->>'type' = :type", { type: 'child' })
            .getCount();

        console.log(`\n📚 Chunk Types:`);
        console.log(`   Parent chunks: ${parentCount} (${((parentCount / totalChunks) * 100).toFixed(1)}%)`);
        console.log(`   Child chunks: ${childCount} (${((childCount / totalChunks) * 100).toFixed(1)}%)`);

        // 3. Count by Parva
        const parvaQuery = await AppDataSource.query(`
            SELECT
                metadata->>'parva' as parva,
                COUNT(*) as count
            FROM document_chunk_recursive
            GROUP BY metadata->>'parva'
            ORDER BY COUNT(*) DESC
        `);

        console.log(`\n📖 Chunks per Parva:`);
        parvaQuery.forEach((row: any) => {
            console.log(`   ${row.parva || 'UNKNOWN'}: ${row.count}`);
        });

        // 4. Speaker statistics
        const speakerQuery = await AppDataSource.query(`
            SELECT
                COUNT(*) as total,
                COUNT(metadata->>'speaker') as with_speaker
            FROM document_chunk_recursive
        `);

        const speakerStats = speakerQuery[0];
        const speakerPercentage = ((speakerStats.with_speaker / speakerStats.total) * 100).toFixed(1);
        console.log(`\n🗣️  Speaker Attribution:`);
        console.log(`   Chunks with speaker: ${speakerStats.with_speaker} (${speakerPercentage}%)`);
        console.log(`   Chunks without speaker: ${speakerStats.total - speakerStats.with_speaker}`);

        // 5. Top speakers
        const topSpeakers = await AppDataSource.query(`
            SELECT
                metadata->>'speaker' as speaker,
                COUNT(*) as count
            FROM document_chunk_recursive
            WHERE metadata->>'speaker' IS NOT NULL
            GROUP BY metadata->>'speaker'
            ORDER BY COUNT(*) DESC
            LIMIT 10
        `);

        console.log(`\n👥 Top 10 Speakers:`);
        topSpeakers.forEach((row: any, i: number) => {
            console.log(`   ${i + 1}. ${row.speaker}: ${row.count} chunks`);
        });

        // 6. Sample chunks with full metadata
        console.log(`\n📝 Sample Chunks (with full metadata):\n`);
        const samples = await repo.find({ take: 5, relations: [] });

        samples.forEach((chunk, i) => {
            console.log(`[${i + 1}] ID: ${chunk.id.substring(0, 8)}...`);
            console.log(`    Type: ${chunk.metadata?.type || 'N/A'}`);
            console.log(`    Parva: ${chunk.metadata?.parva || 'N/A'}`);
            console.log(`    Chapter: ${chunk.metadata?.chapter || 'N/A'}`);
            console.log(`    Section: ${chunk.metadata?.section_title || 'N/A'}`);
            console.log(`    Speaker: ${chunk.metadata?.speaker || 'N/A'}`);
            console.log(`    Parent ID: ${chunk.parentId ? chunk.parentId.substring(0, 8) + '...' : 'N/A'}`);
            console.log(`    Content Hash: ${chunk.contentHash?.substring(0, 16)}...`);
            console.log(`    Content Preview: ${chunk.content.substring(0, 100).replace(/\n/g, ' ')}...\n`);
        });

        // 7. Check for orphan children (children without parents)
        const orphanQuery = await AppDataSource.query(`
            SELECT COUNT(*) as count
            FROM document_chunk_recursive c
            WHERE c."parentId" IS NOT NULL
            AND NOT EXISTS (
                SELECT 1
                FROM document_chunk_recursive p
                WHERE p.id = c."parentId"
            )
        `);

        const orphanCount = orphanQuery[0].count;
        if (orphanCount > 0) {
            console.log(`⚠️  WARNING: Found ${orphanCount} orphan children (children without parents)`);
        } else {
            console.log(`✅ No orphan children found - all parent-child relationships are valid`);
        }

        // 8. Content hash statistics (check for potential duplicates)
        const hashQuery = await AppDataSource.query(`
            SELECT
                "contentHash",
                COUNT(*) as count
            FROM document_chunk_recursive
            WHERE "contentHash" IS NOT NULL
            GROUP BY "contentHash"
            HAVING COUNT(*) > 1
        `);

        if (hashQuery.length > 0) {
            console.log(`\n⚠️  WARNING: Found ${hashQuery.length} duplicate content hashes`);
            console.log(`   This should not happen if deduplication worked correctly`);
        } else {
            console.log(`\n✅ All content hashes are unique - deduplication worked correctly`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ Validation complete!\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Validation failed:', error);
        process.exit(1);
    }
};

validateMetadata();
