import { AppDataSource } from '../config/database';
import { generateEmbedding, rerankResults, expandQuery } from '../utils/gemini';
import { QueryClassifier } from '../utils/query-classifier';

// Minimum similarity threshold to filter out irrelevant results
// Cosine similarity ranges from 0 to 1 (1 = identical, 0 = orthogonal)
// Start low and tune upward based on observed results
const MIN_SIMILARITY_THRESHOLD = 0.25;

export class RetrievalService {
    async queryKnowledge(query: string, limit: number = 5) {
        try {
            console.log(`🔍 Processing query: "${query}"`);

            // 0. Expand query with related terms for better retrieval
            const { expanded: expandedQuery, keywords } = await expandQuery(query);
            console.log(`📝 Expanded query with ${keywords.length} keywords:`, keywords.slice(0, 5).join(', '));

            // 1. Classify query to determine optimal category
            const classification = QueryClassifier.classify(query);
            console.log(`📊 Query classification: ${classification.queryType} (confidence: ${classification.confidence})`);

            // 2. Generate Embeddings for both original and expanded queries
            // Use expanded query for embedding to capture broader semantic meaning
            const queryEmbedding = await generateEmbedding(expandedQuery);

            // 3. Parallel Search (Vector + Keyword)
            // Fetch more candidates than needed for RRF and Re-ranking
            const candidateLimit = limit * 4;

            // Determine if we should filter by category (only if high confidence)
            // DISABLED: Encyclopedia data not yet ingested, so filtering causes 0 results
            const categoryFilter = null; // Search all categories for now

            // Use expanded query for keyword search (more terms = better recall)
            const [vectorResults, keywordResults] = await Promise.all([
                this.searchVector(queryEmbedding, candidateLimit, categoryFilter),
                this.searchKeyword(expandedQuery, candidateLimit, categoryFilter)
            ]);

            console.log(`📈 Vector search: ${vectorResults.length} results (min similarity: ${MIN_SIMILARITY_THRESHOLD})`);
            console.log(`📝 Keyword search: ${keywordResults.length} results`);

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
     * Enrich results with parent chunk context (batched query)
     */
    private async enrichWithParentContext(results: any[]) {
        // Collect unique parent IDs from child chunks
        const parentIds = [...new Set(
            results
                .filter(r => r.metadata?.type === 'child' && r.parentid)
                .map(r => r.parentid)
        )];

        if (parentIds.length === 0) {
            return results;
        }

        // Batch fetch all parents in a single query
        const parentResults = await AppDataSource.query(
            `
            SELECT id, content, metadata
            FROM knowledge_base_chunks
            WHERE id = ANY($1)
            `,
            [parentIds]
        );

        // Create a map for O(1) lookup
        const parentMap = new Map<string, { content: string; metadata: any }>(
            parentResults.map((p: any) => [p.id, { content: p.content, metadata: p.metadata }])
        );

        console.log(`📚 Fetched ${parentResults.length} parent contexts for ${results.filter(r => r.parentid).length} child chunks`);

        // Enrich results with parent content
        return results.map(result => {
            if (result.metadata?.type === 'child' && result.parentid) {
                const parent = parentMap.get(result.parentid);
                if (parent) {
                    result.parent_content = parent.content;
                    result.parent_metadata = parent.metadata;
                }
            }
            return result;
        });
    }

    private async searchVector(embedding: number[], limit: number, categoryFilter: string | null = null) {
        // Build WHERE conditions
        // Cosine distance <= (1 - MIN_SIMILARITY) ensures similarity >= MIN_SIMILARITY
        const maxDistance = 1 - MIN_SIMILARITY_THRESHOLD;
        const conditions: string[] = [`(embedding <-> $1::vector) <= ${maxDistance}`];

        const params: any[] = [`[${embedding.join(',')}]`, limit];

        if (categoryFilter) {
            conditions.push(`"docCategory" = $3`);
            params.push(categoryFilter);
        }

        const whereClause = `WHERE ${conditions.join(' AND ')}`;

        return AppDataSource.query(
            `
            SELECT
              id,
              content,
              "contextualContent" as contextualcontent,
              metadata,
              "parentId" as parentid,
              "contentHash" as contenthash,
              "docCategory" as doccategory,
              1 - (embedding <-> $1::vector) as similarity,
              'vector' as source_type
            FROM knowledge_base_chunks
            ${whereClause}
            ORDER BY embedding <-> $1::vector ASC
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
              "contextualContent" as contextualcontent,
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
