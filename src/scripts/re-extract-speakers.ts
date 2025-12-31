import { AppDataSource, initializeDatabase } from '../config/database';
import { DocumentChunkRecursive } from '../entities/DocumentChunkRecursive';
import { MetadataExtractor } from '../utils/metadata-extractor-enhanced';

/**
 * Re-extract speakers and characters from all existing chunks
 * Updates metadata with: speaker, speakers, characters fields
 */
const reExtractSpeakers = async () => {
    try {
        console.log('🔄 Re-extracting speakers and characters from all chunks...\n');

        await initializeDatabase();
        const chunkRepository = AppDataSource.getRepository(DocumentChunkRecursive);

        // Get total count
        const totalChunks = await chunkRepository.count();
        console.log(`📊 Total chunks to process: ${totalChunks}\n`);

        // Process in batches for better performance
        const BATCH_SIZE = 500;
        let processed = 0;
        let chunksWithSpeakers = 0;
        let chunksWithCharacters = 0;
        const speakerStats = new Map<string, number>();
        const characterStats = new Map<string, number>();

        console.log('🔄 Processing chunks in batches...\n');

        for (let offset = 0; offset < totalChunks; offset += BATCH_SIZE) {
            const chunks = await chunkRepository.find({
                skip: offset,
                take: BATCH_SIZE
            });

            for (const chunk of chunks) {
                // Extract comprehensive character info
                const charInfo = MetadataExtractor.extractCharacterInfo(chunk.content);

                // Track statistics
                if (charInfo.speaker) {
                    chunksWithSpeakers++;
                    speakerStats.set(charInfo.speaker, (speakerStats.get(charInfo.speaker) || 0) + 1);
                }

                if (charInfo.characters.length > 0) {
                    chunksWithCharacters++;
                    charInfo.characters.forEach(char => {
                        characterStats.set(char, (characterStats.get(char) || 0) + 1);
                    });
                }

                // Update metadata (only if there's character info)
                if (charInfo.speaker || charInfo.characters.length > 0) {
                    const newMetadata = {
                        ...chunk.metadata,
                        speaker: charInfo.speaker || undefined,
                        speakers: charInfo.speakers.length > 0 ? charInfo.speakers : undefined,
                        characters: charInfo.characters.length > 0 ? charInfo.characters : undefined
                    };

                    // Use raw query to avoid TypeORM type issues
                    await AppDataSource.query(
                        `UPDATE knowledge_base_chunks SET metadata = $1 WHERE id = $2`,
                        [JSON.stringify(newMetadata), chunk.id]
                    );
                }
            }

            processed += chunks.length;
            const percentComplete = Math.round((processed / totalChunks) * 100);

            console.log(`   Progress: ${processed}/${totalChunks} (${percentComplete}%)`);
        }

        console.log('\n✅ Re-extraction complete!\n');

        // Show comprehensive statistics
        console.log('📊 Final Statistics:');
        console.log(`   Total chunks: ${totalChunks}`);
        console.log(`   Chunks with speakers (dialogue): ${chunksWithSpeakers} (${Math.round((chunksWithSpeakers / totalChunks) * 100)}%)`);
        console.log(`   Chunks with any character: ${chunksWithCharacters} (${Math.round((chunksWithCharacters / totalChunks) * 100)}%)`);
        console.log();

        // Top 15 speakers (dialogue)
        const sortedSpeakers = Array.from(speakerStats.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15);

        console.log('🎭 Top 15 Speakers (Direct Dialogue):');
        sortedSpeakers.forEach(([speaker, count], idx) => {
            console.log(`   ${(idx + 1).toString().padStart(2)}. ${speaker.padEnd(20)} ${count.toString().padStart(5)} chunks`);
        });

        console.log();

        // Top 20 mentioned characters
        const sortedCharacters = Array.from(characterStats.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20);

        console.log('👥 Top 20 Mentioned Characters (Dialogue + Narrative):');
        sortedCharacters.forEach(([character, count], idx) => {
            console.log(`   ${(idx + 1).toString().padStart(2)}. ${character.padEnd(20)} ${count.toString().padStart(5)} chunks`);
        });

        console.log();
        console.log('🎮 Role-Play Features Now Available:');
        console.log('   ✅ Character-based dialogue retrieval');
        console.log('   ✅ Context-aware character queries');
        console.log('   ✅ Multi-character scene detection');
        console.log();
        console.log('💡 Example Queries:');
        console.log('   -- Find Krishna\'s dialogue');
        console.log('   SELECT * FROM knowledge_base_chunks WHERE metadata->>\'speaker\' = \'Krishna\';');
        console.log();
        console.log('   -- Find all chunks involving Arjuna');
        console.log('   SELECT * FROM knowledge_base_chunks WHERE metadata->\'characters\' ? \'Arjuna\';');
        console.log();
        console.log('   -- Find dialogue between Krishna and Arjuna');
        console.log('   SELECT * FROM knowledge_base_chunks');
        console.log('   WHERE metadata->\'characters\' ?& array[\'Krishna\', \'Arjuna\'];');

        process.exit(0);

    } catch (error) {
        console.error('❌ Re-extraction failed:', error);
        process.exit(1);
    }
};

reExtractSpeakers();
