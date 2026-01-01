import { AppDataSource } from '../config/database';
import { DocumentChunkRecursive } from '../entities/DocumentChunkRecursive';

/**
 * Migration script to add docCategory field to existing chunks
 *
 * This script:
 * 1. Connects to the database
 * 2. Updates all existing chunks to have docCategory = 'scripture' (default for legacy data)
 * 3. Creates an index on the new column
 *
 * Run with: npm run migrate:doc-category
 */
async function migrateAddDocCategory() {
    try {
        console.log('🔄 Starting migration: Add docCategory field');
        console.log('='.repeat(50));

        // Initialize database connection
        await AppDataSource.initialize();
        console.log('✅ Database connected');

        const chunkRepo = AppDataSource.getRepository(DocumentChunkRecursive);

        // Check if column exists
        const queryRunner = AppDataSource.createQueryRunner();
        const table = await queryRunner.getTable('knowledge_base_chunks');
        const hasColumn = table?.columns.find(col => col.name === 'docCategory');

        if (!hasColumn) {
            console.log('\n📝 Adding docCategory column...');
            await queryRunner.query(
                `ALTER TABLE knowledge_base_chunks
                 ADD COLUMN "docCategory" VARCHAR(50)`
            );
            console.log('✅ Column added');
        } else {
            console.log('\n✅ Column already exists');
        }

        // Count total chunks
        const totalChunks = await chunkRepo.count();
        console.log(`\n📊 Total chunks in database: ${totalChunks.toLocaleString()}`);

        // Count chunks without docCategory
        const chunksWithoutCategory = await chunkRepo
            .createQueryBuilder('chunk')
            .where('chunk.docCategory IS NULL')
            .getCount();

        console.log(`📊 Chunks without docCategory: ${chunksWithoutCategory.toLocaleString()}`);

        if (chunksWithoutCategory === 0) {
            console.log('\n✅ All chunks already have docCategory assigned');
            await queryRunner.release();
            await AppDataSource.destroy();
            return;
        }

        // Update all chunks at once (PostgreSQL doesn't support LIMIT in UPDATE)
        console.log('\n🔄 Updating chunks with default docCategory = "scripture"...');

        const result = await chunkRepo
            .createQueryBuilder()
            .update()
            .set({ docCategory: 'scripture' })
            .where('docCategory IS NULL')
            .execute();

        console.log(`✅ Updated ${result.affected?.toLocaleString() || chunksWithoutCategory.toLocaleString()} chunks`);

        // Create index if it doesn't exist
        console.log('\n📝 Creating index on docCategory...');
        const hasIndex = await queryRunner.query(
            `SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_kb_doc_category'`
        );

        if (!hasIndex || hasIndex.length === 0) {
            await queryRunner.query(
                `CREATE INDEX "IDX_kb_doc_category" ON "knowledge_base_chunks" ("docCategory")`
            );
            console.log('✅ Index created');
        } else {
            console.log('✅ Index already exists');
        }

        await queryRunner.release();

        // Verify migration
        console.log('\n📊 Verification:');
        const byCategory = await chunkRepo
            .createQueryBuilder('chunk')
            .select('chunk.docCategory', 'category')
            .addSelect('COUNT(*)', 'count')
            .groupBy('chunk.docCategory')
            .getRawMany();

        console.log('   Chunks by category:');
        byCategory.forEach(row => {
            console.log(`   - ${row.category || 'NULL'}: ${parseInt(row.count).toLocaleString()}`);
        });

        console.log('\n' + '='.repeat(50));
        console.log('✅ Migration completed successfully!');
        console.log('\n💡 Next steps:');
        console.log('   1. Upload documents with new S3 structure:');
        console.log('      religion/textSource/docCategory/file.pdf');
        console.log('   2. Examples:');
        console.log('      - hinduism/mahabharatam/scripture/text.pdf');
        console.log('      - hinduism/mahabharatam/encyclopedia/characters.pdf');
        console.log('      - hinduism/mahabharatam/commentary/analysis.pdf');

        await AppDataSource.destroy();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
        }
        process.exit(1);
    }
}

// Run migration
if (require.main === module) {
    migrateAddDocCategory();
}

export { migrateAddDocCategory };
