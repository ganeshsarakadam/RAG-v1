# Scaffolding & Architecture Implementation Notes

## 🏗️ Project Structure
We structured the `knowledge-service` as a modular **TypeScript** application using **Express.js**. This structure was chosen to separate concerns properly: handling HTTP requests, business logic, and database access.

```
src/
├── app.ts                  # Entry point, Middleware setup
├── config/                 # Configuration (Database, Env vars)
├── controllers/            # Request Handlers (HTTP Layer)
├── services/               # Business Logic (RAG, Ingestion, Retrieval)
├── entities/               # Database Models (TypeORM interactions)
├── utils/                  # Shared utilities (Chunking, Gemini helper)
└── scripts/                # Utility scripts (Ingestion, Testing)
```

## ❓ Why Express.js?
We chose Express for its:
1.  **Simplicity**: Minimal boilerplate compared to NestJS, allowing us to focus on the RAG logic.
2.  **Flexibility**: Easy Integration with custom middlewares and async handlers.
3.  **Ecosystem**: Extensive support for TypeScript types and middleware.

## 🧱 Component Design

### 1. Controllers (`src/controllers`)
The controllers are "thin". They only know how to read the HTTP request and send a response. They **delegate** all work to the Service layer.
*   **`ingest.controller.ts`**: Handles `/ingest` endpoints.
*   **`query.controller.ts`**: Handles the main `/query` chat endpoint.
*   **`rag.controller.ts`**: Debug endpoints (if any) or validation.

### 2. Services (`src/services`)
This is where the brain of the application lives.
*   **`ingestion.service.ts`**: Manages PDF parsing and saving to DB.
*   **`retrieval.service.ts`**: The complex search logic (Hybrid + RRF).
*   **`rag.service.ts`**: Orchestrates `Retrieval` -> `Prompt Building` -> `LLM Generation`.

### 3. Entities (`src/entities`)
We use **TypeORM** for database interaction.
*   **`DocumentChunkRecursive`**: This is the core table. It stores:
    *   `content`: The text chunk.
    *   `embedding`: The `vector(768)` from Gemini.
    *   `metadata`: JSON info (source, page number).
    *   `tsk`: A `tsvector` column purely for the Keyword Search optimization.

## 📝 Configuration
*   **`config/database.ts`**: Sets up `AppDataSource` using `postgres` driver. We explicitly enable `ssl` for production (RDS) but allow local implementation.
*   **Environment Variables**: Managed via `dotenv`. Critical keys like `GEMINI_API_KEY` and `DB_URL` are strictly separated from code.
