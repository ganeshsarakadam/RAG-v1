import { AppDataSource } from '../config/database';
import { generateEmbedding, rerankResults } from '../utils/gemini';
import { QueryClassifier } from '../utils/query-classifier';

export class RetrievalService {
    async queryKnowledge(query: string, limit: number = 5) {
        try {
            console.log(`🔍 Processing query: "${query}"`);

            // 0. Classify query to determine optimal category
            const classification = QueryClassifier.classify(query);
            console.log(`📊 Query classification: ${classification.queryType} (confidence: ${classification.confidence})`);
            console.log(`   Category weights:`, classification.categoryWeights);

            // 1. Generate Embedding
            const queryEmbedding = await generateEmbedding(query);

            // 2. Parallel Search (Vector + Keyword)
            // Fetch more candidates than needed for RRF and Re-ranking
            const candidateLimit = limit * 4;

            // Determine if we should filter by category (only if high confidence)
            const categoryFilter = classification.confidence === 'high' ? classification.primaryCategory : null;

            const [vectorResults, keywordResults] = await Promise.all([
                this.searchVector(queryEmbedding, candidateLimit, categoryFilter),
                this.searchKeyword(query, candidateLimit, categoryFilter)
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

            // 5. ENHANCEMENT: Fetch parent context for child chunks
            const enrichedResults = await this.enrichWithParentContext(finalResults);

            return enrichedResults;
        } catch (error) {
            console.error('Error querying knowledge:', error);
            throw error;
        }
    }

    /**
     * NEW METHOD: Enrich results with parent chunk context
     */
    private async enrichWithParentContext(results: any[]) {
        const enriched = [];

        for (const result of results) {
            // If this is a child chunk with a parent, fetch parent content
            if (result.metadata?.type === 'child' && result.parentid) {
                const parentResult = await AppDataSource.query(
                    `
                    SELECT content, metadata
                    FROM knowledge_base_chunks
                    WHERE id = $1
                    `,
                    [result.parentid]
                );

                if (parentResult.length > 0) {
                    result.parent_content = parentResult[0].content;
                    result.parent_metadata = parentResult[0].metadata;
                }
            }

            enriched.push(result);
        }

        return enriched;
    }

    private async searchVector(embedding: number[], limit: number, categoryFilter: string | null = null) {
        const whereClause = categoryFilter ? `WHERE "docCategory" = $3` : '';
        const params: any[] = [`[${embedding.join(',')}]`, limit];
        if (categoryFilter) params.push(categoryFilter);

        return AppDataSource.query(
            `
            SELECT
              id,
              content,
              metadata,
              "parentId" as parentid,
              "contentHash" as contenthash,
              "docCategory" as doccategory,
              1 - (embedding <=> $1::vector) as similarity,
              'vector' as source_type
            FROM knowledge_base_chunks
            ${whereClause}
            ORDER BY embedding <=> $1::vector ASC
            LIMIT $2
            `,
            params
        );
    }

    private async searchKeyword(query: string, limit: number, categoryFilter: string | null = null) {
        // Clean query for TSVECTOR (remove special chars that might break syntax)
        const cleanQuery = query.replace(/[|&:*!]/g, ' ').trim().split(/\s+/).join(' & ');
        if (!cleanQuery) return [];

        const categoryCondition = categoryFilter ? `AND "docCategory" = $3` : '';
        const params: any[] = [query, limit];
        if (categoryFilter) params.push(categoryFilter);

        return AppDataSource.query(
            `
            SELECT
              id,
              content,
              metadata,
              "parentId" as parentid,
              "contentHash" as contenthash,
              "docCategory" as doccategory,
              ts_rank(tsk, plainto_tsquery('english', $1)) as rank,
              'keyword' as source_type
            FROM knowledge_base_chunks
            WHERE tsk @@ plainto_tsquery('english', $1)
            ${categoryCondition}
            ORDER BY rank DESC
            LIMIT $2
            `,
            params
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
