import { ragService } from '../services/rag.service';
import { initializeDatabase } from '../config/database';

const run = async () => {
    try {
        await initializeDatabase();

        const question = process.argv[2] || "How is Karna described?";
        const modeInput = process.argv[3] === 'quick' ? 'flash' : 'pro';

        console.log(`\n❓ Question: "${question}"`);
        console.log(`⚙️  Mode: ${modeInput === 'flash' ? 'Quick (Flash)' : 'Detailed (Pro)'}\n`);

        const startTime = Date.now();
        const result = await ragService.askQuestion(question, modeInput as 'flash' | 'pro');
        const duration = Date.now() - startTime;

        console.log(`\n🤖 Answer (${duration}ms):\n`);
        console.log(result.answer);
        console.log('\n-----------------------------------');

    } catch (e) {
        console.error('❌ Error:', e);
    }
    process.exit(0);
};

run();
