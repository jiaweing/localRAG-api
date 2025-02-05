# Local Contextual RAG API Server

A lightweight & fully customizable API server for Contextual Retrieval-Augmented Generation (RAG) operations, supporting document chunking with context generation, multi-embedding semantic search, and reranking.

## Overview

This service provides endpoints for implementing contextual RAG workflows:

1. **Stateless RAG**: Stateless operations where you provide both documents and chunks in the request
   - Process documents into chunks and generate embeddings
   - Query against provided chunks with reranking
2. **Database RAG**: Complete contextual RAG pipeline using PostgreSQL (PgVector)
   - Document chunking with context-awareness
   - Hybrid semantic search with context embeddings
   - Flexible context generation using OpenAI or local models

## Features

- 🔍 Text chunking with configurable size and overlap
- 🧠 Optional context generation using OpenAI or local models
- 📈 Flexible embedding model selection:
  - Choose models per request in stateless operations
  - Configure default model for database operations
- 🎯 Hybrid semantic search with configurable weights (60/40 content/context)
- 🔄 Cross-encoder reranking for better relevance
- 📊 Highly configurable parameters for all operations
- 🚀 Efficient model management with auto-unloading
- 💾 Choose between stateless or database-backed operation

## Search Pipeline

The search pipeline consists of two stages:

1. **Initial Retrieval**

   - Generates embedding for the query
   - Calculates cosine similarity for both content and context embeddings
   - Combines similarities with weighted average (60% content, 40% context)
   - Applies similarity threshold (if specified)
   - Selects top_k most similar chunks

2. **Reranking**
   - Uses cross-encoder model for more accurate relevance scoring
   - Reranks the initial candidates
   - Returns final ordered results

The two-stage approach combines the efficiency of embedding-based retrieval with the accuracy of cross-encoder reranking.

## Setup

1. Clone and set up:

```bash
git clone https://github.com/jiaweing/localRAG-api.git
cd localRAG-api
pnpm install
```

2. Set up PostgreSQL database:

   - Install PostgreSQL if not already installed
   - Create a new database for the application
   - Run migrations with drizzle-kit (coming soon)
   - Configure database connection in `.env` file

3. Configure environment variables:

```bash
cp .env.example .env
```

Required environment variables:

```bash
# Server Configuration
PORT=57352

# OpenAI Configuration (optional)
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL_NAME=gpt-4o-mini # or any other OpenAI model

# Default Models Configuration
EMBEDDING_MODEL=all-MiniLM-L6-v2.Q4_K_M # Model used for database RAG operations

# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/rag
```

4. Place your GGUF models in the appropriate directories under `models/`:

```
localRAG-api/
  ├── models/
  │   ├── embedding/          # Embedding models (e.g., all-MiniLM-L6-v2)
  │   ├── reranker/          # Cross-encoder reranking models (e.g., bge-reranker)
  │   └── chat/              # Chat models for local context generation
```

#### Option 1: Automatic Download

**Windows:**

```batch
scripts\download-models.bat
```

**Linux/macOS:**

```bash
chmod +x scripts/download-models.sh
./scripts/download-models.sh
```

#### Option 2: Manual Download

Download the following models and place them in their respective directories:

1. [Llama-3.2-1B-Instruct-Q4_K_M.gguf](https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf)

   - Small instruction-tuned chat model for context generation (`models/chat/`)

2. [all-MiniLM-L6-v2.Q4_K_M.gguf](https://huggingface.co/leliuga/all-MiniLM-L6-v2-GGUF/resolve/main/all-MiniLM-L6-v2.Q4_K_M.gguf)

   - Efficient text embedding model for semantic search (`models/embedding/`)

3. [bge-reranker-v2-m3-q8_0.gguf](https://huggingface.co/klnstpr/bge-reranker-v2-m3-Q8_0-GGUF/resolve/main/bge-reranker-v2-m3-q8_0.gguf)
   - Cross-encoder model for accurate result reranking (`models/reranker/`)

Expected directory structure after download:

```
models/
├── chat/
│   └── Llama-3.2-1B-Instruct-Q4_K_M.gguf
├── embedding/
│   └── all-MiniLM-L6-v2.Q4_K_M.gguf
└── reranker/
    └── bge-reranker-v2-m3-q8_0.gguf
```

5. Start the services:

#### Using Docker (recommended)

```bash
docker compose up --build
```

This will start:

- PostgreSQL with pgvector extension at localhost:5432
- API server at http://localhost:57352 (configurable via PORT environment variable)

#### Manual Development

```bash
pnpm dev
```

#### Manual Production

```bash
pnpm start
```

## Docker Setup

The project includes Docker configuration for easy deployment:

- `docker-compose.yml`: Defines services for PostgreSQL with pgvector and the API server
- `Dockerfile`: Multi-stage build for the Node.js API service using pnpm
- `.dockerignore`: Excludes unnecessary files from the Docker build context

Environment variables and database connection will be automatically configured when using Docker.

## Database Schema

The application uses PostgreSQL with the following schema:

```sql
CREATE TABLE dataset (
  id SERIAL PRIMARY KEY,
  file_id VARCHAR(32) NOT NULL,
  folder_id VARCHAR(32),
  context TEXT NOT NULL,
  context_embedding vector(384),
  content TEXT NOT NULL,
  content_embedding vector(384)
);

-- Create HNSW vector indexes for similarity search
CREATE INDEX context_embedding_idx ON dataset USING hnsw (context_embedding vector_cosine_ops);
CREATE INDEX content_embedding_idx ON dataset USING hnsw (content_embedding vector_cosine_ops);
-- Create indexes for file and folder lookups
CREATE INDEX file_id_idx ON dataset (file_id);
CREATE INDEX folder_id_idx ON dataset (folder_id);
```

## API Endpoints

### Stateless RAG Operations

#### `POST /v1/chunk`

Process document chunks and generate embeddings without persistence.

```json
{
  "text": "your document text",
  "model": "embedding-model-name",
  "chunkSize": 500, // optional, default: 500
  "overlap": 50, // optional, default: 50
  "generateContexts": true, // optional, default: false
  "useOpenAI": false // optional, default: false
}
```

Response:

```json
{
  "chunks": [
    {
      "content": "chunk text",
      "context": "generated context",
      "content_embedding": [...],
      "context_embedding": [...],
      "metadata": {
        "file_id": "",
        "folder_id": null,
        "has_context": true
      }
    }
  ]
}
```

#### `POST /v1/query`

Search across provided chunks with optional reranking.

```json
{
  "query": "your search query",
  "chunks": [], // Array of chunks with embeddings from /chunk endpoint
  "embeddingModel": "model-name", // Required: model to use for query embedding
  "rerankerModel": "model-name", // Optional: model to use for reranking
  "topK": 4, // Optional: number of results to return
  "shouldRerank": true // Optional: whether to apply reranking
}
```

Response:

```json
{
  "results": [
    {
      "content": "chunk text",
      "context": "chunk context",
      "metadata": {
        "file_id": "",
        "folder_id": null
      },
      "scores": {
        "content": 0.95,
        "context": 0.88,
        "combined": 0.92,
        "reranked": 0.96
      }
    }
  ]
}
```

### Database-Backed RAG Operations

#### `POST /v1/store`

Store a document in the database. The document will be automatically chunked with context generation.

```json
{
  "document": "full document text",
  "folder_id": "optional-folder-id", // optional
  "chunkSize": 500, // optional, default: 500
  "overlap": 50, // optional, default: 50
  "generateContexts": true, // optional, default: false
  "useOpenAI": false // optional, default: false
}
```

Response:

```json
{
  "message": "Document chunks processed successfully",
  "file_id": "generated-file-id",
  "folder_id": "optional-folder-id",
  "chunks": [
    {
      "content": "chunk text",
      "context": "generated context",
      "content_embedding": [...],
      "context_embedding": [...],
      "metadata": {
        "document": "document name/id",
        "timestamp": "2024-02-05T06:15:21.000Z"
      }
    }
  ]
}
```

#### `POST /v1/retrieve`

Search across stored chunks with hybrid semantic search.

```json
{
  "query": "your search query",
  "folder_id": "optional-folder-id",
  "top_k": 3, // Optional: default is 3
  "threshold": 0.0 // Optional: similarity threshold 0-1, default is 0.0
}
```

Response:

```json
{
  "message": "Chunks retrieved successfully",
  "results": [
    {
      "content": "chunk text",
      "context": "chunk context",
      "metadata": {
        "file_id": "file-id",
        "folder_id": "folder-id"
      },
      "scores": {
        "content": 0.95,
        "context": 0.88,
        "combined": 0.92,
        "reranked": 0.96
      }
    }
  ]
}
```

The search uses a hybrid approach combining both content and context similarity:

- Content similarity (60% weight): How well the chunk's content matches the query
- Context similarity (40% weight): How well the chunk's context matches the query
- Combined score: Weighted average of content and context similarities
- Reranked score: Cross-encoder reranking applied to initial results

#### `GET /v1/documents`

List stored documents with paginated results. Provides document previews with their first chunks.

```json
{
  "page": 1, // Optional: default is 1
  "pageSize": 10, // Optional: default is 10, max is 100
  "folder_id": "optional-folder-id", // Optional: filter by folder
  "file_id": "optional-file-id" // Optional: filter by file
}
```

Response:

```json
{
  "message": "Documents retrieved successfully",
  "data": [
    {
      "file_id": "unique-file-id",
      "folder_id": "optional-folder-id",
      "content_preview": "first chunk content",
      "context_preview": "first chunk context"
    }
  ],
  "pagination": {
    "current_page": 1,
    "total_pages": 5,
    "total_items": 50,
    "page_size": 10
  }
}
```

Response fields:

- `data`: Array of documents with previews and metadata
- `pagination`: Information about current page and total results

#### `POST /v1/delete`

Delete all chunks associated with a specific file_id.

```json
{
  "file_id": "file_id_to_delete"
}
```

Response:

```json
{
  "message": "Chunks deleted successfully",
  "file_id": "file_id_that_was_deleted"
}
```

### Model Management

#### `POST /v1/models/load`

Pre-load a model into memory.

```json
{
  "model": "model-name",
  "type": "embedding | reranker | chat"
}
```

Response:

```json
{
  "message": "Model loaded successfully"
}
```

#### `POST /v1/models/unload`

Unload a model from memory.

```json
{
  "model": "model-name"
}
```

Response:

```json
{
  "message": "Model unloaded successfully"
}
```

or if model not found:

```json
{
  "error": "Model not found or not loaded"
}
```

#### `GET /v1/models`

List all available models.

Response:

```json
[
  {
    "name": "model-name",
    "type": "embedding | reranker | chat",
    "loaded": true
  }
]
```

## Error Handling

All endpoints return appropriate HTTP status codes:

- 200: Success
- 400: Bad Request (missing/invalid parameters)
- 404: Not Found (model not found)
- 500: Internal Server Error

Error response format:

```json
{
  "error": "Error description"
}
```

## Examples

### Stateless RAG with Node.js

```typescript
async function searchChunks(text: string, query: string) {
  const API_URL = "http://localhost:57352/v1";

  // 1. Process document into chunks and get embeddings
  const chunkResponse = await fetch(`${API_URL}/chunk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model: "all-MiniLM-L6-v2",
      generateContexts: true,
      chunkSize: 500,
      overlap: 50,
    }),
  });
  const { chunks: processedChunks } = await chunkResponse.json();

  // 2. Search across chunks with reranking
  const queryResponse = await fetch(`${API_URL}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      chunks: processedChunks,
      embeddingModel: "all-MiniLM-L6-v2",
      rerankerModel: "bge-reranker-base",
      topK: 4,
      shouldRerank: true,
    }),
  });
  const { results } = await queryResponse.json();

  return results;
}
```

### With cURL

```bash
# List documents with pagination and filters
curl -X GET "http://localhost:57352/v1/documents?page=1&pageSize=10&folder_id=optional-folder-id"

# Process document into chunks (Stateless RAG)
curl -X POST http://localhost:57352/v1/chunk \
  -H "Content-Type: application/json" \
  -d '{
    "text": "your document text",
    "model": "all-MiniLM-L6-v2",
    "generateContexts": true,
    "chunkSize": 500,
    "overlap": 50
  }'

# Search across chunks with reranking (Stateless RAG)
curl -X POST http://localhost:57352/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "your search query",
    "chunks": [],
    "embeddingModel": "all-MiniLM-L6-v2",
    "rerankerModel": "bge-reranker-base",
    "topK": 4,
    "shouldRerank": true
  }'
```

### Database-Backed RAG with Node.js

```typescript
async function storeAndSearch(document: string, query: string) {
  const API_URL = "http://localhost:57352/v1";

  // 1. Store document in database (it will be automatically chunked)
  const storeResponse = await fetch(`${API_URL}/store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      document,
      folder_id: "optional-folder-id", // Optional: for organizing documents
      chunkSize: 500, // Optional: customize chunk size
      overlap: 50, // Optional: customize overlap
      generateContexts: true, // Optional: enable context generation
      useOpenAI: false, // Optional: use OpenAI for context generation
    }),
  });
  const { file_id, chunks: processedChunks } = await storeResponse.json();

  // 2. Search across stored chunks
  const queryResponse = await fetch(`${API_URL}/retrieve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      folder_id: "optional-folder-id", // Optional: search within folder
      top_k: 3,
      threshold: 0.7, // Only return matches with similarity > 0.7
    }),
  });
  const { results } = await queryResponse.json();

  return { results, file_id };
}

// Example: Delete stored chunks
async function deleteStoredChunks(fileId: string) {
  const API_URL = "http://localhost:57352/v1";

  const response = await fetch(`${API_URL}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_id: fileId,
    }),
  });
  const result = await response.json();
  console.log(`Deleted chunks for file ${result.file_id}`);
}
```

### With cURL

```bash
# 1. Store document in database (Database RAG)
curl -X POST http://localhost:57352/v1/store \
  -H "Content-Type: application/json" \
  -d '{
    "document": "full document text",
    "folder_id": "optional-folder-id",
    "chunkSize": 500,
    "overlap": 50,
    "generateContexts": true,
    "useOpenAI": false
  }'

# 2. Search stored chunks
curl -X POST http://localhost:57352/v1/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "search query",
    "folder_id": "optional-folder-id",
    "top_k": 3,
    "threshold": 0.7
  }'

# 3. Delete chunks using file_id
curl -X POST http://localhost:57352/v1/delete \
  -H "Content-Type: application/json" \
  -d '{
    "file_id": "file_id_from_store_response"
  }'
```
