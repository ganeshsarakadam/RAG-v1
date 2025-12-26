# Ingestion Strategy & Implementation Notes

## 📥 Overview
The Ingestion pipeline is responsible for transforming raw unstructured data (PDF) into structured, searchable vector embeddings. This process is the foundation of the RAG system; if the ingestion is poor, the answers will be poor ("Garbage In, Garbage Out").

## 🛠️ The Pipeline Steps

### 1. Source Extraction
*   **Source**: `Mahabharata (Unabridged in English).pdf`
*   **Tool**: `pdf-parse` (Node.js library)
*   **Process**: We extract raw text from each page. We track the total pages for metadata purposes.

### 2. Recursive Chunking (The Core Logic)
We do **NOT** just split by character count. That would cut sentences in half.
We implementation a **Recursive Character Text Splitter** (`src/utils/recursive-chunking.ts`).

*   **Algorithm**:
    1.  We strive to keep chunks semantically meaningful.
    2.  We try to split by `\n\n` (Paragraphs).
    3.  If a paragraph is too big (> 1000 chars), we split by `\n` (Lines).
    4.  If a line is too big, we split by `. ` (Sentences).
    5.  If even a sentence is too big, we split by spaces.
*   **Parameters**:
    *   **Chunk Size**: `1000` characters. Large enough to contain context, small enough to be precise.
    *   **Overlap**: `200` characters. This ensures that context isn't lost at the boundaries. If a question refers to the end of chunk A and start of chunk B, the overlap ensures retrieval.

### 3. Embedding Generation
*   **Model**: `text-embedding-004` (via Google Gemini API).
*   **Dimension**: 768.
*   **Implementation**: `src/utils/gemini.ts`.
*   **Why this model?**: It is optimized for retrieval tasks and has high semantic understanding compared to older models.

### 4. Database Storage
We store the data in the `document_chunk_recursive` table.
*   **`content`**: The plain text.
*   **`embedding`**: The 768-dim vector.
*   **`metadata`**: `{ source: string, chunk_index: number }`.
*   **Batching**: We process inserts in batches of **50** to avoid overwhelming the database connection pool.

## ⚠️ Rate Limiting Handling
The Gemini API has rate limits (RPM/TPM).
*   **Strategy**: We implemented a manual delay loop.
*   **Implementation**: After every batch of 50 chunks, we pause execution for **2000ms** (`setTimeout`). This ensures we stay within the "free tier" or standard tier limits without crashing the ingestion script.

## 🔄 Idempotency
To prevent duplicate data:
1.  The script checks `chunkRepository.count()`.
2.  If the count is > 1000, it assumes ingestion is already done and exits.
3.  This makes the `ingest-file` command safe to run multiple times in CI/CD or local dev storage.
