# Retrieval & Search Strategy Notes

## 🔍 The Challenge
A RAG system is only as good as its retrieval. Standard "Vector Search" (Cosine Similarity) often fails on:
1.  **Exact Names**: Vector models might think "Arjuna" and "Warrior" are similar, but if I search for "King Virat", I need that specific name, not just "a king".
2.  **Specific Terminology**: Sanskrit terms in the Mahabharata might have similar vector space embeddings but distinct meanings.

## 💡 Solution: Hybrid Search with RRF & Re-ranking

We implemented a 3-stage retrieval pipeline (`src/services/retrieval.service.ts`):

### Stage 1: Parallel Hybrid Retrieval
We run two queries against Postgres **simultaneously**:

#### A. Vector Search (Semantic)
*   **Concept**: Finds concepts related to the query.
*   **SQL**: `ORDER BY embedding <=> query_vector`
*   **Metric**: Cosine Distance.
*   **Good for**: "How did the war start?" (Conceptual)

#### B. Keyword Search (Lexical)
*   **Concept**: Finds exact word matches.
*   **SQL**: `ts_rank(tsk, plainto_tsquery('english', $1))`
*   **Mechanism**: We rely on the `tsk` column (TSVECTOR) which indexes the chunks for full-text search.
*   **Good for**: "Who killed Bhishma?" (Proper nouns)

---

### Stage 2: Reciprocal Rank Fusion (RRF)
We have two lists of results (e.g., 20 from Vector, 20 from Keyword). How do we combine them?
Standard weighted average (`0.7 * vector + 0.3 * keyword`) is hard to tune.

**We use RRF:**
$$ Score(d) = \sum_{rank \in \{vector, keyword\}} \frac{1}{k + rank(d)} $$

*   **Constant `k`**: set to **60** (Standard usage).
*   **Effect**: A document that appears in *both* lists gets a massive score boost. A document that is #1 in Keyword but missing in Vector still gets a decent score, preventing it from being buried.
*   **Result**: We get a unified list of "Candidate" chunks.

---

### Stage 3: LLM Re-ranking (The "Judge")
Retrieval algorithms (Vector/Keyword) are fast but "dumb". They don't understand the *nuance* of the user's question.

*   **Action**: We take the top candidates from RRF and send them to **Gemini 1.5 Flash**.
*   **Prompt**: "You are an expert. Rate these snippets based on how helpful they are for answering: '{UserQuestion}'."
*   **Why Flash?**: It is extremely fast and cheap. We don't need deep reasoning yet, just relevance scoring.
*   **Outcome**: The Top 5 snippets returned by this stage are highly accurate and contextually relevant.

## 🚀 Performance Optimization
*   **Candidate Expansion**: We fetch `4 * Limit` items in Stage 1 to ensure RRF has enough overlap to work with.
*   **Filtering**: We only Re-rank the top results from RRF to minimize token usage and latency.
