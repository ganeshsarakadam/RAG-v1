import { retrievalService } from '../services/retrieval.service';
import { initializeDatabase } from '../config/database';

const run = async () => {
    try {
        await initializeDatabase();

        const query = process.argv[2] || "philosophy of dharma";
        console.log(`\n🔍 Test Query: "${query}"\n`);

        const startTime = Date.now();
        const results = await retrievalService.queryKnowledge(query);
        const duration = Date.now() - startTime;

        console.log(`\n✅ Found ${results.length} results in ${duration}ms\n`);
        console.log('--- Top Results ---');

        results.forEach((doc: any, i) => {
            console.log(`\n[${i + 1}] ID: ${doc.id}`);
            console.log(`    Rank Source: ${doc.source_type ? doc.source_type : 'Hybrid/Reranked'}`);
            console.log(`    Content: ${doc.content.substring(0, 150).replace(/\n/g, ' ')}...`);
        });

    } catch (e) {
        console.error('❌ Error:', e);
    }
    process.exit(0);
};

run();
