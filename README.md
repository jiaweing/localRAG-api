# Local Contextual RAG API Server

A lightweight API server for Contextual Retrieval-Augmented Generation (RAG) operations, supporting document chunking with context generation, multi-embedding semantic search, and reranking.

## Overview

This service provides endpoints for implementing contextual RAG workflows:

1. **In-Memory RAG**: Stateless operations where you provide both documents and chunks in the request
   - Process documents into chunks and generate embeddings
   - Query against provided chunks with reranking
2. **Database RAG**: Complete contextual RAG pipeline using PostgreSQL (PgVector)
   - Document chunking with context-awareness
   - Hybrid semantic search with context embeddings
   - Flexible context generation using OpenAI or local models

## Features

- 🔍 Text chunking with configurable size and overlap
- 🧠 Optional context generation using OpenAI or local models
- 📈 Dual embeddings support for context-aware search
- 🎯 Hybrid semantic search with configurable weights
- 🔄 Cross-encoder reranking for better relevance
- 📊 Highly configurable parameters for all operations
- 🚀 Efficient model management with auto-unloading
- 💾 Choose between in-memory or database-backed operation

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
# OpenAI Configuration (optional)
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL_NAME=gpt-4o-mini # or any other OpenAI model

# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/your_database_name
```

4. Place your GGUF models in the appropriate directories under `models/`:

```
localRAG-api/
  ├── models/
  │   ├── embedding/          # Embedding models (e.g., all-MiniLM-L6-v2)
  │   ├── reranker/          # Cross-encoder reranking models (e.g., bge-reranker)
  │   └── chat/              # Chat models for local context generation
```

5. Run the service:

Development mode:

```bash
pnpm dev
```

Production mode:

```bash
pnpm start
```

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

### In-Memory RAG Operations

#### `POST /v1/chunk`

Process document chunks and generate embeddings without persistence.

```json
{
  "document": "doc1",
  "chunks": ["chunk text 1", "chunk text 2"]
}
```

Response:

```json
{
  "message": "Document chunks processed successfully",
  "chunks": [
    {
      "content": "chunk text 1",
      "context": "context of this chunk",
      "content_embedding": [...],
      "context_embedding": [...],
      "metadata": {
        "document": "doc1",
        "timestamp": "2024-02-05T06:15:21.000Z"
      }
    },
    // ... more chunks
  ]
}
```

#### `POST /v1/query`

Search across provided chunks with optional reranking.

```json
{
  "query": "your search query",
  "chunks": [
    // Array of chunks with embeddings from /chunk endpoint
  ],
  "top_k": 3, // optional, default: 3
  "threshold": 0.7 // optional, default: 0.0, similarity threshold between 0 and 1
}
```

Response:

```json
{
  "message": "Chunks retrieved successfully",
  "results": [
    {
      "content": "most relevant chunk",
      "context": "context of the chunk",
      "scores": {
        "content": 0.95,
        "context": 0.88,
        "combined": 0.92,
        "reranked": 0.96
      }
    }
    // ... more results ordered by relevance
  ]
}
```

### Database-Backed RAG Operations

#### `POST /v1/store`

Store document chunks with embeddings in the database. A unique file_id is automatically generated for each document. Optionally specify a folder_id for organization.

```json
{
  "document": "doc1",
  "folder_id": "optional_folder_id", // optional, for organizing documents
  "chunks": ["chunk text 1", "chunk text 2"]
}
```

Response:

```json
{
  "message": "Document chunks processed successfully",
  "file_id": "generated_unique_file_id",
  "folder_id": "optional_folder_id", // only if provided in request
  "chunks": [
    {
      "content": "chunk text 1",
      "context": "context of this chunk",
      "content_embedding": [...],
      "context_embedding": [...],
      "metadata": {
        "document": "doc1",
        "timestamp": "2024-02-05T06:15:21.000Z"
      }
    }
    // ... more chunks
  ]
}
```

#### `POST /v1/retrieve`

Search across stored chunks using hybrid semantic search with reranking. Optionally filter by folder_id.

```json
{
  "query": "your search query",
  "folder_id": "optional_folder_id", // optional, to search within a specific folder
  "top_k": 3, // optional, default: 3
  "threshold": 0.7 // optional, default: 0.0, similarity threshold between 0 and 1
}
```

Response:

```json
{
  "message": "Chunks retrieved successfully",
  "results": [
    {
      "content": "most relevant chunk",
      "context": "context for this chunk",
      "metadata": {
        "file_id": "file_id_of_chunk",
        "folder_id": "folder_id_if_any"
      },
      "scores": {
        "content": 0.95,
        "context": 0.88,
        "combined": 0.92,
        "reranked": 0.96
      }
    }
    // ... more results ordered by relevance
  ]
}
```

The search uses a hybrid approach combining both content and context similarity:

- Content similarity (60% weight): How well the chunk's content matches the query
- Context similarity (40% weight): How well the chunk's context matches the query
- Combined score: Weighted average of content and context similarities
- Reranked score: Cross-encoder reranking applied to initial results

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
  "model": "all-MiniLM-L6-v2.Q4_K_M",
  "type": "embedding" // or "reranker" or "chat"
}
```

#### `POST /v1/models/unload`

Unload a model from memory.

```json
{
  "model": "all-MiniLM-L6-v2.Q4_K_M"
}
```

#### `GET /v1/models`

List all available models.

Response:

```json
[
  {
    "name": "all-MiniLM-L6-v2.Q4_K_M",
    "type": "embedding",
    "loaded": true
  },
  {
    "name": "bge-reranker-v2-m3-Q8_0",
    "type": "reranker",
    "loaded": false
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

### In-Memory RAG with Node.js

```typescript
async function searchChunks(chunks: string[], query: string) {
  const API_URL = "http://localhost:3000/v1";

  // 1. Process chunks and get embeddings
  const chunkResponse = await fetch(`${API_URL}/chunk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      document: "doc1",
      chunks: chunks,
    }),
  });
  const { chunks: processedChunks } = await chunkResponse.json();

  // 2. Search across chunks
  const queryResponse = await fetch(`${API_URL}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      chunks: processedChunks,
      top_k: 3,
      threshold: 0.7, // Only return matches with similarity > 0.7
    }),
  });
  const { results } = await queryResponse.json();

  return results;
}
```

### Database-Backed RAG with Node.js

```typescript
async function storeAndSearch(
  chunks: string[],
  query: string,
  folderId?: string
) {
  const API_URL = "http://localhost:3000/v1";

  // 1. Store chunks in database
  const storeResponse = await fetch(`${API_URL}/store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      document: "doc1",
      folder_id: folderId, // optional
      chunks: chunks,
    }),
  });
  const { file_id } = await storeResponse.json();

  // 2. Search across stored chunks
  const queryResponse = await fetch(`${API_URL}/retrieve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      folder_id: folderId, // optional, to search within the same folder
      top_k: 3,
      threshold: 0.7,
    }),
  });
  const { results } = await queryResponse.json();

  return { results, file_id };
}

// Example: Delete stored chunks
async function deleteStoredChunks(fileId: string) {
  const API_URL = "http://localhost:3000/v1";

  await fetch(`${API_URL}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_id: fileId,
    }),
  });
}
```

### With cURL

```bash
# 1. Store chunks with optional folder_id
curl -X POST http://localhost:3000/v1/store \
  -H "Content-Type: application/json" \
  -d '{
    "document": "doc1",
    "folder_id": "my_folder",
    "chunks": ["chunk 1", "chunk 2"]
  }'

# 2. Search stored chunks within a folder
curl -X POST http://localhost:3000/v1/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "search query",
    "folder_id": "my_folder",
    "top_k": 3,
    "threshold": 0.7
  }'

# 3. Delete chunks using file_id
curl -X POST http://localhost:3000/v1/delete \
  -H "Content-Type: application/json" \
  -d '{
    "file_id": "file_id_from_store_response"
  }'
```

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
