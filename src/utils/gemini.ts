import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env';
import * as crypto from 'crypto';

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
// Embedding model
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
// Generative models
const flashModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
const proModel = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

/**
 * Simple LRU Cache for embeddings to avoid redundant API calls
 */
class EmbeddingCache {
    private cache: Map<string, { embedding: number[]; timestamp: number }> = new Map();
    private maxSize: number;
    private ttlMs: number;

    constructor(maxSize: number = 1000, ttlMinutes: number = 60) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMinutes * 60 * 1000;
    }

    private hash(text: string): string {
        return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
    }

    get(text: string): number[] | null {
        const key = this.hash(text);
        const entry = this.cache.get(key);

        if (!entry) return null;

        // Check TTL
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return null;
        }

        return entry.embedding;
    }

    set(text: string, embedding: number[]): void {
        const key = this.hash(text);

        // Evict oldest entries if cache is full
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) this.cache.delete(oldestKey);
        }

        this.cache.set(key, { embedding, timestamp: Date.now() });
    }

    get size(): number {
        return this.cache.size;
    }
}

// Global embedding cache instance
const embeddingCache = new EmbeddingCache(1000, 60); // 1000 entries, 60 min TTL

/**
 * Normalize text for embedding while preserving important structure
 * - Collapses multiple newlines into double newline (paragraph boundary)
 * - Collapses multiple spaces into single space
 * - Preserves single newlines as they may indicate list items or verse breaks
 */
function normalizeTextForEmbedding(text: string): string {
    return text
        .replace(/\n{3,}/g, '\n\n')  // Collapse 3+ newlines to double newline
        .replace(/[ \t]+/g, ' ')      // Collapse multiple spaces/tabs to single space
        .replace(/\n /g, '\n')        // Remove space after newline
        .replace(/ \n/g, '\n')        // Remove space before newline
        .trim();
}

export const generateEmbedding = async (text: string): Promise<number[]> => {
    try {
        const cleanText = normalizeTextForEmbedding(text);

        // Check cache first
        const cached = embeddingCache.get(cleanText);
        if (cached) {
            return cached;
        }

        const result = await embeddingModel.embedContent(cleanText);
        const embedding = result.embedding.values;

        // Cache the result
        embeddingCache.set(cleanText, embedding);

        return embedding;
    } catch (error) {
        console.error('Error generating embedding with Gemini:', error);
        throw error;
    }
};

export const generateAnswer = async (prompt: string, modelType: 'flash' | 'pro' = 'pro', systemInstruction?: string): Promise<string> => {
    try {
        const modelName = modelType === 'flash' ? "gemini-2.0-flash" : "gemini-3-pro-preview";
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction
        });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Error generating answer with Gemini:', error);
        throw error;
    }
};

export const generateAnswerStream = async (prompt: string, modelType: 'flash' | 'pro' = 'pro', systemInstruction?: string) => {
    try {
        const modelName = modelType === 'flash' ? "gemini-2.0-flash" : "gemini-3-pro-preview";
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction
        });
        const result = await model.generateContentStream(prompt);
        return result;
    } catch (error) {
        console.error('Error generating answer stream with Gemini:', error);
        throw error;
    }
};

export const rerankResults = async (query: string, documents: { id: string; content: string; metadata?: any }[], topN: number = 5): Promise<string[]> => {
    try {
        // Build document list with more context (500 chars instead of 300)
        const docsText = documents.map((doc, index) => {
            const metadata = doc.metadata || {};
            const metaStr = [
                metadata.parva && `Parva: ${metadata.parva}`,
                metadata.speaker && `Speaker: ${metadata.speaker}`,
                metadata.type && `Type: ${metadata.type}`
            ].filter(Boolean).join(', ');

            return `[${index}] (ID: ${doc.id})${metaStr ? ` [${metaStr}]` : ''}\n${doc.content.substring(0, 500)}`;
        }).join('\n\n---\n\n');

        const prompt = `You are an expert on the Mahabharata epic, tasked with ranking search results by relevance to a user's query.

**Query:** "${query}"

**Ranking Criteria (in order of importance):**
1. **Direct Answer**: Does the passage directly answer or address the query?
2. **Specificity**: Does it contain specific names, events, or details relevant to the question?
3. **Completeness**: Does it provide sufficient context to understand the answer?
4. **Authority**: Prefer passages with identified speakers (dialogue) for quotes, narrative passages for events.

**Query Type Considerations:**
- For "Who is X?" questions: Prioritize passages that describe the character
- For "What happened?" questions: Prioritize narrative passages describing events
- For "Why did X?" questions: Prioritize passages explaining motivations or dialogue
- For philosophical questions: Prioritize teachings, dialogues with sages/Krishna

**Search Results:**
${docsText}

**Task:** Return the IDs of the top ${topN} most relevant passages, ordered by relevance (most relevant first).

Return ONLY a JSON array of ID strings. Example: ["id1", "id2", "id3"]
No explanation needed.`;

        const result = await flashModel.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // Clean up markdown code blocks if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        // Validate that returned IDs exist in documents
        const validIds = new Set(documents.map(d => d.id));
        const validatedIds = parsed.filter((id: string) => validIds.has(id));

        if (validatedIds.length === 0) {
            console.warn('Re-ranking returned no valid IDs, falling back to original order');
            return documents.slice(0, topN).map(d => d.id);
        }

        return validatedIds.slice(0, topN);
    } catch (error) {
        console.error('Error reranking with Gemini:', error);
        return documents.slice(0, topN).map(d => d.id); // Fallback: return top N original
    }
};

/**
 * Generate contextual description for a chunk using Anthropic's Contextual Retrieval technique
 *
 * @param childContent - The child chunk content to contextualize
 * @param parentContent - The parent section content for broader context
 * @param metadata - Chunk metadata (parva, chapter, section, speaker)
 * @returns Promise<string> - Brief 1-2 sentence context summary
 */
export const generateChunkContext = async (
    childContent: string,
    parentContent: string,
    metadata: {
        parva?: string;
        chapter?: number;
        section_title?: string;
        speaker?: string;
    }
): Promise<string> => {
    try {
        // Build context-aware prompt
        const metadataStr = [
            metadata.parva && `Parva: ${metadata.parva}`,
            metadata.chapter && `Chapter: ${metadata.chapter}`,
            metadata.section_title && `Section: ${metadata.section_title}`,
            metadata.speaker && `Speaker: ${metadata.speaker}`
        ].filter(Boolean).join(', ');

        const prompt = `<document>
${parentContent}
</document>

The above document is from the Mahabharata epic${metadataStr ? ` (${metadataStr})` : ''}.

Here is the specific chunk from this document that we need to contextualize:
<chunk>
${childContent}
</chunk>

Please provide a brief 1-2 sentence context that explains what this chunk is about within the larger document section. The context should:
- Help a retrieval system understand what this chunk discusses
- Reference the broader narrative or topic from the parent document
- Be concise and informative (1-2 sentences maximum)

Return ONLY the context description, no explanations or metadata.`;

        // Use flash model for cost efficiency (context generation is simple)
        const context = await generateAnswer(prompt, 'flash');

        // Clean and validate
        const cleanContext = context.trim();

        if (!cleanContext || cleanContext.length < 10) {
            throw new Error('Generated context is too short or empty');
        }

        // Truncate if too long (max 500 chars for context)
        return cleanContext.substring(0, 500);

    } catch (error) {
        console.error('Error generating chunk context:', error);
        // Fallback: construct basic context from metadata
        const fallbackContext = `This is a passage from the Mahabharata${
            metadata.parva ? ` ${metadata.parva}` : ''
        }${
            metadata.section_title ? `, ${metadata.section_title}` : ''
        }${
            metadata.speaker ? `, spoken by ${metadata.speaker}` : ''
        }.`;
        return fallbackContext;
    }
};

/**
 * Query Expansion for improved retrieval
 *
 * Expands a user query with:
 * - Related character names
 * - Alternative phrasings
 * - Sanskrit/English term variations
 * - Contextual keywords from Mahabharata domain
 *
 * @param query - Original user query
 * @returns Promise<{original: string, expanded: string, keywords: string[]}> - Expanded query info
 */
export const expandQuery = async (query: string): Promise<{
    original: string;
    expanded: string;
    keywords: string[];
}> => {
    try {
        const prompt = `You are a Mahabharata expert helping improve search queries.

Given this search query about the Mahabharata: "${query}"

Generate search expansion terms to help find relevant passages. Think about:
1. Character names involved (both main name and aliases/titles)
2. Related characters (parents, spouses, children)
3. Alternative ways to describe the event/concept
4. Key Sanskrit terms that might appear in translations
5. The Parva (book) where this would likely be found

Return a JSON object with:
{
  "keywords": ["keyword1", "keyword2", ...],  // 5-10 highly relevant search terms
  "expandedQuery": "expanded natural language query"
}

Examples:
- "How were kauravas born" → keywords: ["Gandhari", "Dhritarashtra", "hundred sons", "flesh", "pots", "Vyasa", "birth", "Adi Parva"]
- "Why did Karna fight for Duryodhana" → keywords: ["Karna", "Duryodhana", "loyalty", "friendship", "Anga", "gratitude", "Pandavas", "rejected"]
- "Krishna's teaching to Arjuna" → keywords: ["Bhagavad Gita", "Krishna", "Arjuna", "dharma", "duty", "Kurukshetra", "Bhishma Parva", "despondency"]

Return ONLY valid JSON, no explanation.`;

        const result = await flashModel.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // Clean and parse JSON
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        const keywords: string[] = parsed.keywords || [];
        const expandedQuery = parsed.expandedQuery || query;

        // Combine original query with keywords for search
        const combined = `${query} ${keywords.join(' ')}`;

        console.log(`🔍 Query expansion: "${query}" → +${keywords.length} keywords`);

        return {
            original: query,
            expanded: combined,
            keywords
        };
    } catch (error) {
        console.error('Error expanding query:', error);
        // Fallback: return original query unchanged
        return {
            original: query,
            expanded: query,
            keywords: []
        };
    }
};
