import { AppDataSource, initializeDatabase } from '../config/database';
import { DocumentChunkRecursive } from '../entities/DocumentChunkRecursive';
import { MetadataExtractor as OldExtractor } from '../utils/metadata-extractor';
import { MetadataExtractor as NewExtractor } from '../utils/metadata-extractor-enhanced';

/**
 * Test script to compare old vs new speaker extraction
 */
const testSpeakerExtraction = async () => {
    try {
        console.log('🧪 Testing Enhanced Speaker Extraction\n');

        await initializeDatabase();
        const chunkRepository = AppDataSource.getRepository(DocumentChunkRecursive);

        // Get random sample of chunks
        const sampleChunks = await chunkRepository
            .createQueryBuilder('chunk')
            .orderBy('RANDOM()')
            .limit(100)
            .getMany();

        console.log(`📦 Testing on ${sampleChunks.length} random chunks...\n`);

        let oldExtractionCount = 0;
        let newSpeakerCount = 0;
        let newCharacterCount = 0;
        const speakerExamples: Array<{content: string, speaker?: string, characters: string[]}> = [];

        for (const chunk of sampleChunks) {
            const oldSpeaker = OldExtractor.extractSpeaker(chunk.content);
            const charInfo = NewExtractor.extractCharacterInfo(chunk.content);

            if (oldSpeaker) oldExtractionCount++;
            if (charInfo.speaker) newSpeakerCount++;
            if (charInfo.characters.length > 0) newCharacterCount++;

            // Collect interesting examples
            if (charInfo.speaker || charInfo.characters.length > 0) {
                speakerExamples.push({
                    content: chunk.content.substring(0, 250) + '...',
                    speaker: charInfo.speaker,
                    characters: charInfo.characters
                });
            }
        }

        console.log('📊 Speaker Extraction Results:');
        console.log(`   Old Extractor: Found speakers in ${oldExtractionCount}/100 chunks (${oldExtractionCount}%)`);
        console.log(`   New Extractor (speakers): ${newSpeakerCount}/100 chunks (${newSpeakerCount}%)`);
        console.log(`   New Extractor (any character): ${newCharacterCount}/100 chunks (${newCharacterCount}%)`);
        console.log(`   Improvement: +${newCharacterCount - oldExtractionCount} chunks\n`);

        // Show examples
        if (speakerExamples.length > 0) {
            console.log('✨ Example improvements (new speaker found):');
            console.log('─'.repeat(80));

            speakerExamples.slice(0, 5).forEach((example, idx) => {
                console.log(`\nExample ${idx + 1}:`);
                if (example.speaker) console.log(`Speaker: ${example.speaker}`);
                if (example.characters.length > 0) console.log(`Characters: ${example.characters.join(', ')}`);
                console.log(`Content: ${example.content}`);
                console.log('─'.repeat(80));
            });
        }

        // Test on entire database
        console.log('\n🔍 Testing on entire database...');
        const totalChunks = await chunkRepository.count();
        console.log(`   Total chunks: ${totalChunks}`);

        // Estimate improvement
        const estimatedOldCoverage = Math.round((oldExtractionCount / 100) * totalChunks);
        const estimatedNewSpeakerCoverage = Math.round((newSpeakerCount / 100) * totalChunks);
        const estimatedNewCharacterCoverage = Math.round((newCharacterCount / 100) * totalChunks);

        console.log(`\n📈 Estimated full database coverage:`);
        console.log(`   Old Extractor: ~${estimatedOldCoverage} chunks (${oldExtractionCount}%)`);
        console.log(`   New Extractor (speakers only): ~${estimatedNewSpeakerCoverage} chunks (${newSpeakerCount}%)`);
        console.log(`   New Extractor (with characters): ~${estimatedNewCharacterCoverage} chunks (${newCharacterCount}%)`);
        console.log(`   Improvement: +${estimatedNewCharacterCoverage - estimatedOldCoverage} chunks\n`);

        console.log('💡 Next step: Run "npm run re-extract-speakers" to update all chunks');
        console.log('   This will add both speaker and characters fields to metadata');

        process.exit(0);

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
};

testSpeakerExtraction();
