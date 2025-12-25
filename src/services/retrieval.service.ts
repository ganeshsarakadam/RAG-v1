import { AppDataSource } from '../config/database';
import { generateEmbedding, rerankResults } from '../utils/gemini';

export class RetrievalService {
    async queryKnowledge(query: string, limit: number = 5) {
        try {
            console.log(`🔍 Processing query: "${query}"`);

            // 1. Generate Embedding
            const queryEmbedding = await generateEmbedding(query);

            // 2. Parallel Search (Vector + Keyword)
            // Fetch more candidates than needed for RRF and Re-ranking
            const candidateLimit = limit * 4;

            const [vectorResults, keywordResults] = await Promise.all([
                this.searchVector(queryEmbedding, candidateLimit),
                this.searchKeyword(query, candidateLimit)
            ]);

            // 3. Reciprocal Rank Fusion (RRF)
            const combinedResults = this.performRRF(vectorResults, keywordResults, limit * 2);

            console.log(`Found ${combinedResults.length} hybrid candidates. Reranking top results...`);

            // 4. Re-ranking
            // Only rerank the top candidates to save cost/latency
            if (combinedResults.length === 0) return [];

            const topCandidates = combinedResults;
            const rerankedIds = await rerankResults(query, topCandidates, limit);

            // Sort original objects by the reranked order
            const finalResults = rerankedIds
                .map((id: string) => topCandidates.find((doc: any) => doc.id === id))
                .filter((doc: any) => doc !== undefined); // Safety check

            // Fallback: if reranking failed or returned few, fill with RRF top results
            if (finalResults.length < limit) {
                const existingIds = new Set(finalResults.map((r: any) => r!.id));
                for (const doc of topCandidates) {
                    if (finalResults.length >= limit) break;
                    if (!existingIds.has(doc.id)) {
                        finalResults.push(doc);
                        existingIds.add(doc.id);
                    }
                }
            }

            return finalResults;
        } catch (error) {
            console.error('Error querying knowledge:', error);
            throw error;
        }
    }

    private async searchVector(embedding: number[], limit: number) {
        return AppDataSource.query(
            `
            SELECT
              id,
              content,
              metadata,
              1 - (embedding <=> $1::vector) as similarity,
              'vector' as source_type
            FROM document_chunk
            ORDER BY embedding <=> $1::vector ASC
            LIMIT $2
            `,
            [`[${embedding.join(',')}]`, limit]
        );
    }

    private async searchKeyword(query: string, limit: number) {
        // Clean query for TSVECTOR (remove special chars that might break syntax)
        const cleanQuery = query.replace(/[|&:*!]/g, ' ').trim().split(/\s+/).join(' & ');
        if (!cleanQuery) return [];

        return AppDataSource.query(
            `
            SELECT
              id,
              content,
              metadata,
              ts_rank(tsk, plainto_tsquery('english', $1)) as rank,
              'keyword' as source_type
            FROM document_chunk
            WHERE tsk @@ plainto_tsquery('english', $1)
            ORDER BY rank DESC
            LIMIT $2
            `,
            [query, limit] // plainto_tsquery handles the parsing safely
        );
    }

    private performRRF(vectorResults: any[], keywordResults: any[], limit: number) {
        const k = 60; // Standard RRF constant
        const scores = new Map<string, number>();
        const docs = new Map<string, any>();

        // Process Vector Results
        vectorResults.forEach((doc, index) => {
            scores.set(doc.id, (scores.get(doc.id) || 0) + (1 / (k + index + 1)));
            docs.set(doc.id, doc);
        });

        // Process Keyword Results
        keywordResults.forEach((doc, index) => {
            scores.set(doc.id, (scores.get(doc.id) || 0) + (1 / (k + index + 1)));
            if (!docs.has(doc.id)) docs.set(doc.id, doc);
        });

        return Array.from(scores.entries())
            .sort(([, scoreA], [, scoreB]) => scoreB - scoreA) // Descending
            .slice(0, limit)
            .map(([id]) => docs.get(id));
    }
}

export const retrievalService = new RetrievalService();
