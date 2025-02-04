# Local RAG API Server

A lightweight API server for Retrieval-Augmented Generation (RAG) operations, supporting document chunking, embedding generation, and semantic search with reranking.

## Overview

This service provides endpoints for implementing RAG workflows:

1. Chunk documents and generate embeddings
2. Query chunks using semantic search and cross-encoder reranking
3. Local model management for embeddings and reranking

## Features

- 🔍 Text chunking with configurable size and overlap
- 📈 Embedding generation for chunks and queries
- 🎯 Semantic search using cosine similarity
- 🔄 Cross-encoder reranking for better relevance
- 📊 Configurable number of results and reranking options
- 🚀 Efficient model management with auto-unloading

## Setup

1. Clone and set up:

```bash
git clone https://github.com/jiaweing/localRAG-api.git
cd localRAG-api
pnpm install
pnpm build    # Builds to dist/ directory
```

2. Place your GGUF models in the appropriate directories under `models/`:

```
localRAG-api/
  ├── models/
  │   ├── embedding/          # Embedding models (e.g., all-MiniLM-L6-v2)
  │   └── reranker/          # Cross-encoder reranking models (e.g., bge-reranker)
```

3. Run the service:

Development mode:

```bash
pnpm dev
```

Production mode:

```bash
pnpm start
```

The service will start on port 23673.

## API Endpoints

### Document Chunking

#### `POST /v1/chunk`

Split a document into chunks and generate embeddings.

```json
{
  "text": "Your document text here...",
  "model": "all-MiniLM-L6-v2.Q4_K_M",
  "chunkSize": 500, // optional (default: 500)
  "overlap": 50 // optional (default: 50)
}
```

Response:

```json
{
  "chunks": [
    {
      "content": "Chunk text...",
      "embedding": [
        /* vector */
      ],
      "metadata": {
        "start_idx": 0,
        "end_idx": 500
      }
    }
    // ... more chunks
  ]
}
```

### Query Chunks

#### `POST /v1/query`

Find relevant chunks for a query using semantic search with optional reranking.

```json
{
  "query": "Your search query",
  "chunks": [
    /* array of chunks from /chunk endpoint */
  ],
  "embeddingModel": "all-MiniLM-L6-v2.Q4_K_M",
  "rerankerModel": "bge-reranker-v2-m3-Q8_0", // optional
  "topK": 4, // optional (default: 4)
  "shouldRerank": true // optional (default: true)
}
```

Response:

```json
{
  "results": [
    {
      "content": "Most relevant chunk...",
      "score": 0.95,
      "metadata": {
        "start_idx": 0,
        "end_idx": 500
      }
    }
    // ... more chunks ordered by relevance
  ]
}
```

### Model Management

#### `POST /v1/models/load`

Pre-load a model into memory.

```json
{
  "model": "all-MiniLM-L6-v2.Q4_K_M",
  "type": "embedding" // or "reranker"
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
  "error": {
    "message": "Error description",
    "type": "server_error",
    "param": null,
    "code": null
  }
}
```

## Example Usage

### With Node.js

```typescript
async function searchDocument(text: string, query: string) {
  const API_URL = "http://localhost:23673/v1";

  // 1. Chunk document and generate embeddings
  const chunkResponse = await fetch(`${API_URL}/chunk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model: "all-MiniLM-L6-v2.Q4_K_M",
      chunkSize: 500,
      overlap: 50,
    }),
  });
  const { chunks } = await chunkResponse.json();

  // 2. Query chunks
  const queryResponse = await fetch(`${API_URL}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      chunks,
      embeddingModel: "all-MiniLM-L6-v2.Q4_K_M",
      rerankerModel: "bge-reranker-v2-m3-Q8_0",
      topK: 4,
    }),
  });
  const { results } = await queryResponse.json();
  return results;
}
```

### With cURL

```bash
# 1. Chunk document
curl -X POST http://localhost:23673/v1/chunk \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Your document text...",
    "model": "all-MiniLM-L6-v2.Q4_K_M"
  }'

# 2. Query chunks
curl -X POST http://localhost:23673/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Your search query",
    "chunks": [...],  # Chunks from previous response
    "embeddingModel": "all-MiniLM-L6-v2.Q4_K_M",
    "rerankerModel": "bge-reranker-v2-m3-Q8_0"
  }'
```

## Memory Management

Models are automatically unloaded after 30 minutes of inactivity to manage memory usage. You can:

1. Preload models using `/models/load`
2. Check loaded models with `/models/list`
3. Manually unload models with `/models/unload`
