# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A **Retrieval-Augmented Generation (RAG)** knowledge service backend built with Node.js, TypeScript, PostgreSQL (pgvector), and Google Gemini AI. Supports multiple religious texts with hierarchical chunking and hybrid search capabilities.

## Common Commands

```bash
# Development
npm run dev                    # Start development server with nodemon (port 3000)

# Build and Production
npm run build                  # Compile TypeScript to dist/
npm start                      # Run production build

# Data Ingestion
npm run ingest:local          # Ingest PDF with hierarchical chunking (local filesystem)
npm run ingest:s3             # Ingest PDF with hierarchical chunking (S3, dev mode)
npm run ingest:s3:prod        # Ingest PDF with hierarchical chunking (S3, production)

# Validation & Testing
npm run validate-metadata     # Validate metadata extraction (Parva, Chapter, Speaker stats)
npm run test-hierarchy        # Test parent-child relationships and hierarchy integrity
npm run test-speakers         # Test speaker extraction patterns
npm run re-extract-speakers   # Re-extract speakers from existing chunks

# Data Migration
npm run migrate-data                    # Migrate existing data
npm run migrate-table                   # Migrate table schema and data
npm run migrate:doc-category            # Add docCategory field to existing data
npm run migrate:contextual-retrieval    # Add contextual embeddings to existing chunks (Anthropic's technique)
npm run validate:contextual-retrieval   # Validate contextual retrieval migration

# Docker
docker-compose up -d          # Start postgres + pgadmin services
docker-compose down           # Stop services
```

## Architecture

**Tech Stack**: Node.js, TypeScript, Express, TypeORM, PostgreSQL with pgvector, Google Gemini AI

### Core Components

1. **Data Pipeline** (Ingestion → Chunking → Embedding → Storage):
   - PDF parsing via `pdf-parse`
   - Text chunking using recursive character splitting (1000 chars, 200 overlap)
   - Embedding generation via Gemini `text-embedding-004` (768-dim vectors)
   - Storage in PostgreSQL with pgvector extension

2. **Retrieval System** (src/services/retrieval.service.ts):
   - **Query Classification**: Determines optimal category and confidence using `QueryClassifier` (src/utils/query-classifier.ts)
   - **Hybrid Search**: Runs vector similarity search (cosine distance) and keyword search (PostgreSQL full-text search) in parallel
   - **Category Filtering**: Applies category filter when query classification confidence is high
   - **Reciprocal Rank Fusion (RRF)**: Combines results from both search methods using k=60
   - **Re-ranking**: Uses Gemini `gemini-2.0-flash` to rerank top candidates for final relevance

3. **RAG Generation** (src/services/rag.service.ts):
   - Retrieves top 5 chunks via hybrid search
   - Constructs context-aware prompts with custom system instructions
   - Generates answers using Gemini `gemini-2.0-flash` (quick mode) or `gemini-3-pro-preview` (pro mode)
   - Supports streaming responses

### Database Schema

- **Primary entity**: `DocumentChunkRecursive` (hierarchical chunks with metadata)
- **Fields**:
  - `id` (UUID): Primary key
  - `content` (text): Chunk content
  - `religion` (varchar): Multi-religious support (e.g., 'hinduism', 'christianity', 'islam', 'buddhism')
  - `textSource` (varchar): Source text identifier (e.g., 'mahabharatam', 'ramayana', 'bible', 'quran')
  - `docCategory` (varchar): Document category (e.g., 'scripture', 'encyclopedia', 'commentary', 'translation')
  - `metadata` (JSONB): Structured metadata
  - `embedding` (vector): 768-dim Gemini embedding
  - `parentId` (UUID): Reference to parent chunk
  - `contentHash` (varchar): SHA256 hash for deduplication
  - `tsk` (tsvector): Full-text search index (auto-generated)
- **Metadata includes**: `source`, `parva`, `chapter`, `section_title`, `speaker`, `chunk_index`, `type` ('parent' | 'child')
- **Relationships**: Parent-child via `parentId` (ManyToOne/OneToMany)
- **Indexes**: `parentId`, `contentHash`, `religion`, `textSource`, `docCategory`, `tsk` (full-text)

### API Endpoints

- `POST /api/upload` - Upload file to S3 (via multer)
- `POST /api/ingest` - Ingest document from S3
- `POST /api/webhook/s3-upload` - S3 event webhook for automatic ingestion
- `POST /api/query` - Raw retrieval (returns chunks with similarity scores)
- `POST /api/ask` - RAG generation with streaming response
- `GET /health` - Health check

### Environment Variables

Create a `.env` file:
```
GEMINI_API_KEY=your_api_key
DB_PASSWORD=your_password
NODE_ENV=development|production
PORT=3000
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_NAME=knowledge_db
```

## Key Implementation Details

### Hierarchical Chunking Strategy

The system uses **hierarchical semantic chunking** that creates both parent and child chunks:

**Two-Level Hierarchy:**
- **Parent Chunks**: Full sections/chapters (1,915 chunks from Mahabharata)
- **Child Chunks**: Smaller semantic units (~20,000 chunks)
- Children link to parents via `parentId` for context preservation

**Metadata Extraction** (src/utils/metadata-extractor.ts):
- **Parva detection**: Pattern matching for 18 Mahabharata Parvas (ADI PARVA, SABHA PARVA, etc.)
- **Section detection**: Roman numeral sections (SECTION I, II, III...)
- **Speaker extraction**: Identifies speakers from dialogue patterns ("Vaisampayana said:", "Sauti replied:")
- **Content hashing**: SHA256 for deduplication

**Chunking Process** (src/utils/hierarchical-chunking.ts):
1. Parse document structure to identify Parva/Section boundaries
2. Create parent chunk for each section (full content)
3. Create child chunks using recursive splitting (1000 chars, 200 overlap) if section > 1000 chars
4. Link children to parents
5. Deduplicate using content hashing

**Recursive Character Splitting** (for child chunks):
- Separators hierarchy: `\n\n` (paragraphs) → `\n` (lines) → `. ` (sentences) → ` ` (words) → `` (chars)
- Attempts to split at natural boundaries first, recursing to finer boundaries only when necessary

### Retrieval Pipeline

The retrieval uses a sophisticated multi-stage approach:
1. **Query Classification**: Analyzes query to determine optimal category (docCategory) and confidence level
2. **Dual Search**: Vector similarity (L2 distance via pgvector `<=>`) + Full-text search (PostgreSQL tsvector)
3. **Category Filtering**: Applies category filter to searches when confidence is high
4. **RRF Fusion**: Combines rankings using k=60 constant
5. **LLM Re-ranking**: Gemini evaluates semantic relevance and reorders results
6. **Parent Context Enrichment**: For child chunks, fetches parent section content for broader context
7. **Fallback**: If re-ranking fails, uses RRF results

**Enhanced with Hierarchical Context:**
- Retrieves precise child chunks for accuracy
- Automatically fetches parent chunk content when child is retrieved
- Returns rich metadata: parva, chapter, section_title, speaker, type, has_parent

**Contextual Retrieval (Anthropic's Technique):**
- **Context Generation**: Child chunks get 1-2 sentence contextual descriptions using parent content
- **Context-Aware Embeddings**: Context is prepended to chunk content before embedding generation
- **Format**: `[CONTEXT]\n{context summary}\n\n[CONTENT]\n{original chunk}`
- **Benefits**: Improved retrieval accuracy (5-20% per Anthropic research), reduced ambiguity, better cross-section queries
- **Parent Chunks**: No context generation (already full sections)
- **Storage**: Original content preserved in `content`, contextual version in `contextualContent`, embeddings generated from contextual version
- **Tracking**: `metadata.has_context` flag and `metadata.context_summary` for reference

### TypeORM Configuration

- `synchronize: true` in development (auto-creates tables)
- Entities use decorators: `@Entity()`, `@Column()`, `@Index()`
- Vector extension enabled on startup: `CREATE EXTENSION IF NOT EXISTS vector`
- Full-text search uses generated column: `to_tsvector('english', content)`

### Ingestion Scripts

**ingest-local.ts** (Hierarchical Ingestion):
1. Parses PDF and extracts document structure (Parvas, Sections)
2. Creates hierarchical chunks (parents + children)
3. Deduplicates using content hashing
4. **Two-pass saving**:
   - Pass 1: Generate embeddings and save all chunks (50/batch, 2s delay)
   - Pass 2: Link child chunks to parents via parentId
5. Displays final statistics (parent count, child count, deduplication stats)
6. Idempotency: skips if >1000 chunks exist

**ingest-s3.ts**:
- Same hierarchical approach as ingest-local
- Downloads PDF from S3 bucket first
- AWS SDK v3 integration

**Key Features**:
- Metadata extraction for all chunks (parva, chapter, speaker, section_title)
- Content-based deduplication (typically removes <1% duplicates)
- Batch processing with rate limiting
- Progress tracking and detailed logging

## Development Workflow

1. **Setup**: Ensure PostgreSQL with pgvector is running (via docker-compose)
2. **Ingest Data**: Run `npm run ingest:local` to populate database with hierarchical chunks
   - Expected: ~22,000 chunks (1,900 parents + 20,000 children)
   - Time: ~60-90 minutes for full Mahabharata PDF
3. **Validate Ingestion**:
   - Run `npm run validate-metadata` to check metadata extraction quality
   - Run `npm run test-hierarchy` to verify parent-child relationships
4. **Test Retrieval**: Use `/api/query` endpoint to verify hybrid search quality
5. **Test RAG**: Use `/api/ask` endpoint to validate end-to-end answer generation
6. **Evaluation Scripts**: Use scripts in `src/scripts/` for testing

## Important Notes

- The knowledge service listens on port 3000 by default (configurable via PORT env var)
- Gemini API has rate limits - batching logic handles this with 2s delays between batches
- Database connection uses SSL in production (`ssl: { rejectUnauthorized: false }`)
- The `DocumentChunkRecursive` entity is the active entity with full hierarchical support
- **Multi-religious Support**: The system supports multiple religious texts via `religion`, `textSource`, and `docCategory` fields
- **Hierarchical Chunking**: Parent chunks provide broad context, child chunks enable precise retrieval
- **Metadata Coverage**: ~95%+ chunks have Parva/Chapter, ~60%+ have Speaker attribution
- **Deduplication**: Removes <1% exact duplicates using SHA256 content hashing
- CORS is enabled in knowledge-service for cross-origin requests

**Retrieval Behavior:**
- Query classification optimizes search by determining likely document categories
- Child chunks are retrieved for precise matching
- Parent context is automatically fetched and included in responses
- Metadata (parva, chapter, speaker, religion, textSource, docCategory) enables filtering and attribution
