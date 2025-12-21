import { AppDataSource } from '../config/database';
import { generateEmbedding } from '../utils/gemini';

export class RetrievalService {
    async queryKnowledge(query: string, limit: number = 5) {
        try {
            console.log(`🔍 Generating embedding for query: "${query}"`);
            const queryEmbedding = await generateEmbedding(query);

            // Perform Vector Search
            // Operator <=> is "cosine distance"
            // We explicitly cast the parameter to vector type '[...]'
            // We return 1 - distance as "similarity"
            const results = await AppDataSource.query(
                `
        SELECT
          id,
          content,
          metadata,
          1 - (embedding <=> $1::vector) as similarity
        FROM document_chunk
        ORDER BY embedding <=> $1::vector ASC
        LIMIT $2
        `,
                [`[${queryEmbedding.join(',')}]`, limit]
            );

            console.log(`Found ${results.length} results for query: "${query}"`);

            return results;
        } catch (error) {
            console.error('Error querying knowledge:', error);
            throw error;
        }
    }
}

export const retrievalService = new RetrievalService();
