import { retrievalService } from './retrieval.service';
import { generateAnswer, generateAnswerStream } from '../utils/gemini';
import {
    MAHABHARATA_SYSTEM_INSTRUCTION,
    LOW_QUALITY_RETRIEVAL_RESPONSE,
    MIN_AVERAGE_SIMILARITY
} from '../config/system-instructions';

/**
 * Extract consistent source metadata from chunks
 * Ensures both streaming and non-streaming responses have the same metadata structure
 * Includes page numbers and content for PDF viewer highlighting
 */
function extractSourceMetadata(chunk: any) {
    return {
        id: chunk.id,
        source: chunk.metadata?.source,
        parva: chunk.metadata?.parva,
        chapter: chunk.metadata?.chapter,
        section_title: chunk.metadata?.section_title,
        speaker: chunk.metadata?.speaker,
        type: chunk.metadata?.type,
        similarity: chunk.similarity,
        has_parent: !!chunk.parent_content,
        // Page info for PDF viewer
        page: chunk.metadata?.page,
        pageEnd: chunk.metadata?.pageEnd,
        // Content snippet for text highlighting in PDF viewer
        highlightText: chunk.content?.substring(0, 200)
    };
}

/**
 * Check if retrieval quality is sufficient for generation
 * Returns true if average similarity is above threshold
 */
function isRetrievalQualitySufficient(chunks: any[]): { sufficient: boolean; avgSimilarity: number } {
    if (!chunks || chunks.length === 0) {
        return { sufficient: false, avgSimilarity: 0 };
    }

    const similarities = chunks
        .map(c => c.similarity)
        .filter(s => typeof s === 'number' && !isNaN(s));

    if (similarities.length === 0) {
        return { sufficient: false, avgSimilarity: 0 };
    }

    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    const sufficient = avgSimilarity >= MIN_AVERAGE_SIMILARITY;

    console.log(`📊 Retrieval quality: avg similarity = ${avgSimilarity.toFixed(3)}, threshold = ${MIN_AVERAGE_SIMILARITY}, sufficient = ${sufficient}`);

    return { sufficient, avgSimilarity };
}

/**
 * Build context string from chunks for LLM consumption
 *
 * Priority for context building:
 * 1. Use contextualContent if available (matches what was embedded - best semantic match)
 * 2. Fall back to content + parent context if contextualContent is not available
 *
 * This ensures the LLM sees content that semantically matches the embeddings
 */
function buildContext(chunks: any[], includeParentContext: boolean = true): string {
    return chunks.map((chunk: any) => {
        // Prefer contextualContent (already formatted with [CONTEXT] and [CONTENT] during ingestion)
        // This matches what the embedding was generated from
        if (chunk.contextualcontent) {
            return chunk.contextualcontent;
        }

        // Fallback: use original content with parent context if available
        let contextText = chunk.content;

        // If child chunk with parent, include parent for broader context
        if (includeParentContext && chunk.parent_content) {
            const parentPreview = chunk.parent_content.substring(0, 500);
            contextText = `[Parent Section Context: ${parentPreview}...]\n\n[Specific Passage: ${chunk.content}]`;
        }

        return contextText;
    }).join('\n\n---\n\n');
}

export class RagService {
    async askQuestion(question: string, modelType: 'flash' | 'pro' = 'pro') {
        // 1. Retrieve relevant chunks
        const chunks = await retrievalService.queryKnowledge(question, 5);

        if (!chunks || chunks.length === 0) {
            return {
                answer: "I'm sorry, I couldn't find any relevant information in the Knowledge Base.",
                sources: []
            };
        }

        // 2. Check retrieval quality
        const { sufficient, avgSimilarity } = isRetrievalQualitySufficient(chunks);
        if (!sufficient) {
            console.log(`⚠️ Low retrieval quality (avg: ${avgSimilarity.toFixed(3)}), returning graceful response`);
            return {
                answer: LOW_QUALITY_RETRIEVAL_RESPONSE,
                sources: chunks.map(extractSourceMetadata),
                meta: { avgSimilarity, qualityWarning: true }
            };
        }

        // 3. Construct Context (with parent context)
        const context = buildContext(chunks, true);
        console.log('Context length:', context.length, 'chars');

        // 4. Construct Prompt
        const prompt = `${context}

Question: ${question}

Answer:`;

        // 5. Generate Answer
        const answer = await generateAnswer(prompt, modelType, MAHABHARATA_SYSTEM_INSTRUCTION);

        return {
            answer,
            sources: chunks.map(extractSourceMetadata),
            meta: { avgSimilarity }
        };
    }

    async askQuestionStream(question: string, modelType: 'flash' | 'pro' = 'pro') {
        const chunks = await retrievalService.queryKnowledge(question, 5);

        if (!chunks || chunks.length === 0) {
            return {
                stream: null,
                sources: []
            };
        }

        // Check retrieval quality
        const { sufficient, avgSimilarity } = isRetrievalQualitySufficient(chunks);
        if (!sufficient) {
            console.log(`⚠️ Low retrieval quality (avg: ${avgSimilarity.toFixed(3)}), returning graceful response`);
            // Return null stream with fallback answer for controller to handle
            return {
                stream: null,
                sources: chunks.map(extractSourceMetadata),
                fallbackAnswer: LOW_QUALITY_RETRIEVAL_RESPONSE,
                meta: { avgSimilarity, qualityWarning: true }
            };
        }

        // Construct context with parent context
        const context = buildContext(chunks, true);

        const prompt = `${context}

Question: ${question}

Answer:`;

        const streamResult = await generateAnswerStream(prompt, modelType, MAHABHARATA_SYSTEM_INSTRUCTION);

        return {
            stream: streamResult,
            sources: chunks.map(extractSourceMetadata),
            meta: { avgSimilarity }
        };
    }
}

export const ragService = new RagService();
