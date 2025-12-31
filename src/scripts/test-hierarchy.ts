import { AppDataSource, initializeDatabase } from '../config/database';
import { DocumentChunkRecursive } from '../entities/DocumentChunkRecursive';

const testHierarchy = async () => {
    try {
        await initializeDatabase();
        const repo = AppDataSource.getRepository(DocumentChunkRecursive);

        console.log('🔗 Testing Parent-Child Relationships\n');
        console.log('='.repeat(60));

        // 1. Find a parent chunk
        console.log('\n📖 Finding parent chunks...');
        const parentsRaw = await AppDataSource.query(
            `SELECT * FROM knowledge_base_chunks
             WHERE metadata->>'type' = 'parent'
             LIMIT 3`
        );

        if (parentsRaw.length === 0) {
            console.log('❌ No parent chunks found in database');
            process.exit(1);
        }

        const parents = parentsRaw.map((p: any) => repo.create(p));

        console.log(`✅ Found ${parents.length} parent chunks for testing\n`);

        // Test each parent
        for (let idx = 0; idx < parents.length; idx++) {
            const parent = parents[idx];

            console.log(`\n${'─'.repeat(60)}`);
            console.log(`Test ${idx + 1}: Parent Chunk Analysis`);
            console.log('─'.repeat(60));

            console.log(`\n📖 Parent Chunk Details:`);
            console.log(`   ID: ${parent.id}`);
            console.log(`   Parva: ${parent.metadata?.parva || 'N/A'}`);
            console.log(`   Chapter: ${parent.metadata?.chapter || 'N/A'}`);
            console.log(`   Section: ${parent.metadata?.section_title || 'N/A'}`);
            console.log(`   Speaker: ${parent.metadata?.speaker || 'N/A'}`);
            console.log(`   Content length: ${parent.content.length} characters`);
            console.log(`   Content preview: ${parent.content.substring(0, 150).replace(/\n/g, ' ')}...`);

            // Find its children
            const children = await repo.find({
                where: { parentId: parent.id }
            });

            console.log(`\n👶 Children: ${children.length} chunks`);

            if (children.length === 0) {
                console.log(`   ⚠️  This parent has no children`);
                continue;
            }

            // Show first 3 children
            const displayCount = Math.min(3, children.length);
            console.log(`\n   Displaying first ${displayCount} children:\n`);

            for (let i = 0; i < displayCount; i++) {
                const child = children[i];
                console.log(`   [${i + 1}] ID: ${child.id.substring(0, 8)}...`);
                console.log(`       Speaker: ${child.metadata?.speaker || 'N/A'}`);
                console.log(`       Content length: ${child.content.length} characters`);
                console.log(`       Content: ${child.content.substring(0, 100).replace(/\n/g, ' ')}...`);
                console.log();
            }

            // Test retrieval with parent context
            console.log(`\n🔍 Testing Parent Retrieval:`);
            const sampleChild = children[0];
            if (sampleChild) {
                const parentOfChild = await repo.findOne({ where: { id: sampleChild.parentId! } });
                const isMatching = parentOfChild?.id === parent.id;

                console.log(`   Child ID: ${sampleChild.id.substring(0, 8)}...`);
                console.log(`   Parent ID (from child): ${sampleChild.parentId?.substring(0, 8)}...`);
                console.log(`   Retrieved parent ID: ${parentOfChild?.id.substring(0, 8)}...`);
                console.log(`   Match: ${isMatching ? '✅ YES' : '❌ NO'}`);

                if (isMatching) {
                    console.log(`   ✅ Parent-child relationship verified!`);
                } else {
                    console.log(`   ❌ ERROR: Parent-child relationship broken!`);
                }
            }
        }

        // 2. Statistics
        console.log(`\n${'='.repeat(60)}`);
        console.log('📊 Hierarchy Statistics\n');

        const statsQuery = await AppDataSource.query(`
            SELECT
                (SELECT COUNT(*) FROM knowledge_base_chunks WHERE metadata->>'type' = 'parent') as parent_count,
                (SELECT COUNT(*) FROM knowledge_base_chunks WHERE metadata->>'type' = 'child') as child_count,
                (SELECT COUNT(*) FROM knowledge_base_chunks WHERE "parentId" IS NOT NULL) as children_with_parent,
                (SELECT COUNT(*) FROM knowledge_base_chunks WHERE metadata->>'type' = 'child' AND "parentId" IS NULL) as orphan_children
        `);

        const stats = statsQuery[0];

        console.log(`   Total parent chunks: ${stats.parent_count}`);
        console.log(`   Total child chunks: ${stats.child_count}`);
        console.log(`   Children with parent link: ${stats.children_with_parent}`);
        console.log(`   Orphan children: ${stats.orphan_children}`);

        if (stats.orphan_children > 0) {
            console.log(`\n   ⚠️  WARNING: Found ${stats.orphan_children} orphan children!`);
        } else {
            console.log(`\n   ✅ All child chunks are properly linked to parents`);
        }

        // 3. Average children per parent
        const avgQuery = await AppDataSource.query(`
            SELECT
                AVG(child_count) as avg_children,
                MAX(child_count) as max_children,
                MIN(child_count) as min_children
            FROM (
                SELECT COUNT(*) as child_count
                FROM knowledge_base_chunks
                WHERE "parentId" IS NOT NULL
                GROUP BY "parentId"
            ) as counts
        `);

        if (avgQuery.length > 0 && avgQuery[0].avg_children) {
            const avgStats = avgQuery[0];
            console.log(`\n   Average children per parent: ${parseFloat(avgStats.avg_children).toFixed(2)}`);
            console.log(`   Max children for a parent: ${avgStats.max_children}`);
            console.log(`   Min children for a parent: ${avgStats.min_children}`);
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log('✅ Hierarchy testing complete!\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Hierarchy testing failed:', error);
        process.exit(1);
    }
};

testHierarchy();
