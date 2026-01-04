# Project RAG-v1 - Knowledge Service (Mahabharata PDF )

A **Retrieval-Augmented Generation (RAG)** system built with Node.js, TypeScript, PostgreSQL (pgvector), and Google Gemini.

## 🌟 Features
- **PDF Ingestion**: Parses large PDF documents.
- **Chunking Strategies**: Implements **Fixed-Size with Overlap** (configurable).
- **Vector Storage**: Uses `pgvector` for high-performance similarity search.
- **Embeddings**: Google Gemini `text-embedding-004`.
- **Generation**: Google Gemini `gemini-2.0-flash`.

## 🏗 Architecture
1.  **Ingestion**:
    - Load PDF -> Extract Text.
    - **Chunking**: Sliding window (1000 chars length, 200 chars overlap).
    - **Embedding**: Generate 768-dim vector per chunk.
    - **Storage**: Save text + vector + metadata to PostgreSQL.

2.  **Retrieval**:
    - **Endpoint**: `/api/query`
    - Convert user query to vector.
    - Perform Cosine Similarity (`<=>`) search.
    - Return top K matches.

3.  **Generation (RAG)**:
    - **Endpoint**: `/api/ask`
    - Retrieve top relevant chunks.
    - Construct Prompt with Context.
    - Generate Answer using LLM.

## 🚀 Getting Started

### Prerequisites
- Node.js v20+
- Docker & Docker Compose
- Google Gemini API Key

### Installation
1.  **Clone the repository**.
2.  **Configure Environment**:
    Create a `.env` file:
    ```bash
    GEMINI_API_KEY=...
    DB_PASSWORD= ...
    ```
3.  **Start Services**:
    ```bash
    docker-compose up -d
    ```
4.  **Run Dev Server**:
    ```bash
    npm install
    npm run dev
    ```

### Data Ingestion
To populate the database with the Mahabharata text:
```bash
npx ts-node src/scripts/ingest-local.ts
```
*Note: This script includes logic to process ~18,000 chunks in batches.*

## 🧪 Evaluation & Testing

We provide endpoints to compare and test retrieval accuracy.

### 1. Raw Retrieval (Test Vector Search)
Inspect the raw chunks returned for a query to evaluate the "Hit Rate".
```bash
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Who is Krishna?"}'
```
*Check the `similarity` scores in the response.*

### 2. RAG Generation (Test End-to-End)
Evaluate the quality of the generated natural language answer.
```bash
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the significance of the game of dice?"}'
```

### 3. Comparing Strategies (Future Work)
To compare chunking strategies (e.g., Paragraph vs Fixed-Size):
1.  Change `metadata.type` in `ingest-local.ts`.
2.  Modify `chunking` logic (e.g., swap `fixedSizeChunking` for `text.split('\n\n')`).
3.  Re-run ingestion.
4.  Run the same queries and compare results.

## 🛠 Tech Stack
- **Runtime**: Node.js, TypeScript
- **Database**: PostgreSQL with `pgvector`
- **ORM**: TypeORM
- **AI/ML**: Google Gemini SDK (`@google/generative-ai`)

