import { AppDataSource, initializeDatabase } from '../config/database';

/**
 * Migration script to:
 * 1. Copy data from document_chunk_recursive to knowledge_base_chunks
 * 2. Add religion and textSource fields with default values
 */
const migrateTableAndData = async () => {
    try {
        console.log('🔄 Starting table and data migration...\n');

        // Initialize database
        await initializeDatabase();

        // Check if old table exists and has data
        const oldTableCheck = await AppDataSource.query(`
            SELECT COUNT(*) as count
            FROM document_chunk_recursive
        `);
        const oldCount = parseInt(oldTableCheck[0].count);

        const newTableCheck = await AppDataSource.query(`
            SELECT COUNT(*) as count
            FROM knowledge_base_chunks
        `);
        const newCount = parseInt(newTableCheck[0].count);

        console.log('📊 Current State:');
        console.log(`   Old table (document_chunk_recursive): ${oldCount} chunks`);
        console.log(`   New table (knowledge_base_chunks): ${newCount} chunks`);
        console.log();

        if (oldCount === 0) {
            console.log('⚠️  Old table is empty. Nothing to migrate!');
            process.exit(0);
        }

        if (newCount > 0) {
            console.log('⚠️  New table already has data. Clearing it first...');
            await AppDataSource.query('TRUNCATE TABLE knowledge_base_chunks CASCADE');
            console.log('✅ New table cleared.');
        }

        console.log(`🔄 Copying ${oldCount} chunks from old table to new table...`);
        console.log('   Adding religion="hinduism" and textSource="mahabharatam"...');

        // Copy all data with new fields
        const result = await AppDataSource.query(`
            INSERT INTO knowledge_base_chunks
                (id, content, religion, "textSource", metadata, embedding, "parentId", "contentHash")
            SELECT
                id,
                content,
                'hinduism' as religion,
                'mahabharatam' as "textSource",
                metadata,
                embedding,
                "parentId",
                "contentHash"
            FROM document_chunk_recursive
        `);

        console.log(`✅ Successfully copied ${oldCount} chunks!`);
        console.log();

        // Verify migration
        const finalCheck = await AppDataSource.query(`
            SELECT COUNT(*) as count
            FROM knowledge_base_chunks
        `);
        const finalCount = parseInt(finalCheck[0].count);

        console.log('📊 Post-Migration Statistics:');
        console.log(`   Total chunks in new table: ${finalCount}`);

        // Check religion and textSource distribution
        const religionCheck = await AppDataSource.query(`
            SELECT religion, "textSource", COUNT(*) as count
            FROM knowledge_base_chunks
            GROUP BY religion, "textSource"
        `);

        console.log('\n   Distribution:');
        religionCheck.forEach((row: any) => {
            console.log(`     ${row.religion}/${row.textSource}: ${row.count} chunks`);
        });

        console.log();
        console.log('✅ Migration completed successfully!');
        console.log();
        console.log('💡 Next steps:');
        console.log('   1. Your Mahabharata data is now in the new table with proper tags');
        console.log('   2. The old table (document_chunk_recursive) can be dropped if you want:');
        console.log('      DROP TABLE document_chunk_recursive CASCADE;');
        console.log('   3. Upload other religious texts:');
        console.log('      aws s3 cp bible.pdf s3://bucket/christianity/bible/');
        console.log('   4. Test queries by religion:');
        console.log('      SELECT COUNT(*) FROM knowledge_base_chunks WHERE religion = \'hinduism\';');

        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
};

migrateTableAndData();
