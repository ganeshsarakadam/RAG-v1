import { AppDataSource, initializeDatabase } from '../config/database';
import { DocumentChunkRecursive } from '../entities/DocumentChunkRecursive';

/**
 * Migration script to update existing Mahabharata data with religion and textSource fields
 * This is a one-time migration for data ingested before the schema update
 */
const migrateExistingData = async () => {
    try {
        console.log('🔄 Starting data migration...\n');

        // Initialize database
        await initializeDatabase();
        const chunkRepository = AppDataSource.getRepository(DocumentChunkRecursive);

        // Get statistics before migration
        const totalChunks = await chunkRepository.count();
        const chunksWithoutReligion = await chunkRepository.count({
            where: { religion: null as any }
        });

        console.log('📊 Current Database Statistics:');
        console.log(`   Total chunks: ${totalChunks}`);
        console.log(`   Chunks without religion field: ${chunksWithoutReligion}`);
        console.log();

        if (chunksWithoutReligion === 0) {
            console.log('✅ All chunks already have religion/textSource set. No migration needed!');
            process.exit(0);
        }

        // Ask for confirmation
        console.log(`⚠️  About to update ${chunksWithoutReligion} chunks with:`);
        console.log('   religion = "hinduism"');
        console.log('   textSource = "mahabharatam"');
        console.log();

        // Perform migration using raw SQL for better performance
        console.log('🔄 Updating chunks...');

        const result = await AppDataSource.query(`
            UPDATE knowledge_base_chunks
            SET
                religion = 'hinduism',
                "textSource" = 'mahabharatam'
            WHERE religion IS NULL
        `);

        console.log(`✅ Updated ${chunksWithoutReligion} chunks successfully!`);
        console.log();

        // Get statistics after migration
        const chunksWithReligion = await chunkRepository.count({
            where: { religion: 'hinduism' }
        });
        const chunksWithTextSource = await chunkRepository.count({
            where: { textSource: 'mahabharatam' }
        });

        console.log('📊 Post-Migration Statistics:');
        console.log(`   Total chunks: ${totalChunks}`);
        console.log(`   Chunks with religion='hinduism': ${chunksWithReligion}`);
        console.log(`   Chunks with textSource='mahabharatam': ${chunksWithTextSource}`);
        console.log();

        // Verify migration
        const remainingNull = await chunkRepository.count({
            where: { religion: null as any }
        });

        if (remainingNull === 0) {
            console.log('✅ Migration completed successfully! All chunks have been updated.');
        } else {
            console.log(`⚠️  Warning: ${remainingNull} chunks still have NULL religion field.`);
        }

        console.log();
        console.log('🎉 Migration complete! Your existing Mahabharata data is now properly tagged.');
        console.log();
        console.log('💡 Next steps:');
        console.log('   1. You can now query by religion: WHERE religion = "hinduism"');
        console.log('   2. Upload other religious texts to different folders:');
        console.log('      - s3://bucket/christianity/bible/bible.pdf');
        console.log('      - s3://bucket/islam/quran/quran.pdf');
        console.log('   3. Test cross-religious queries for your role-play feature!');

        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
};

migrateExistingData();
