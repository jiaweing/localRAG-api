# Local Contextual RAG API Server

A lightweight API server for Contextual Retrieval-Augmented Generation (RAG) operations, supporting document chunking with context generation, multi-embedding semantic search, and reranking.

## Overview

This service provides endpoints for implementing contextual RAG workflows:

1. Chunk documents and generate embeddings with context-awareness:
   - Split documents into chunks
   - Generate contextual descriptions using LLM
   - Create embeddings for both content and context
2. Query chunks using hybrid semantic search (optional context-aware):
   - Match against content embeddings, and context embeddings when available
   - Flexible context generation using OpenAI or local models
   - Weight and combine similarity scores (0.6 content, 0.4 context)
   - Optional cross-encoder reranking
3. Local model management for embedding, reranking, and chat models
4. Optional OpenAI integration for enhanced context generation

## Features

- 🔍 Text chunking with configurable size and overlap
- 🧠 Optional context generation using OpenAI or local models
- 📈 Dual embeddings support for context-aware search
- 🎯 Hybrid semantic search with configurable weights
- 🔄 Cross-encoder reranking for better relevance
- 📊 Highly configurable parameters for all operations
- 🚀 Efficient model management with auto-unloading
- 🔌 Easy OpenAI integration for enhanced context generation

## Setup

1. Clone and set up:

```bash
git clone https://github.com/jiaweing/localRAG-api.git
cd localRAG-api
pnpm install
pnpm build    # Builds to dist/ directory
```

2. Configure environment:

Copy `.env.example` to `.env` and adjust as needed:

```bash
# OpenAI Configuration (optional)
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL_NAME=gpt-4-turbo-preview # or any other OpenAI model
```

3. Place your GGUF models in the appropriate directories under `models/`:

```
localRAG-api/
  ├── models/
  │   ├── embedding/          # Embedding models (e.g., all-MiniLM-L6-v2)
  │   ├── reranker/          # Cross-encoder reranking models (e.g., bge-reranker)
  │   └── chat/              # Chat models for local context generation (e.g., Llama-2)
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

Split a document into chunks with optional context generation and create embeddings.

```json
{
  "text": "Your document text here...",
  "model": "all-MiniLM-L6-v2.Q4_K_M",
  "chunkSize": 500, // optional (default: 500)
  "overlap": 50, // optional (default: 50)
  "generateContexts": true, // optional (default: false)
  "useOpenAI": false // optional (default: false), requires OPENAI_API_KEY
}
```

Response:

```json
{
  "chunks": [
    {
      "content": "Chunk text...",
      "context": "Generated contextual description...",
      "content_embedding": [
        /* vector */
      ],
      "context_embedding": [
        /* vector */
      ],
      "metadata": {
        "start_idx": 0,
        "end_idx": 500,
        "has_context": true
      }
    }
    // ... more chunks
  ]
}
```

### Query Chunks

#### `POST /v1/query`

Find relevant chunks using hybrid semantic search (content + context) with optional reranking.

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
      "context": "Contextual description...",
      "metadata": {
        "start_idx": 0,
        "end_idx": 500,
        "has_context": true
      },
      "scores": {
        "content": 0.92, // Similarity to chunk content
        "context": 0.85, // Similarity to chunk context
        "combined": 0.89 // Weighted combination (0.6 content, 0.4 context)
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
async function searchDocument(text: string, query: string, useOpenAI = false) {
  const API_URL = "http://localhost:23673/v1";

  // 1. Chunk document, generate context, and create embeddings
  const chunkResponse = await fetch(`${API_URL}/chunk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model: "all-MiniLM-L6-v2.Q4_K_M",
      chunkSize: 500,
      overlap: 50,
      generateContexts: true,
      useOpenAI,
    }),
  });
  const { chunks } = await chunkResponse.json();
  console.log(`Generated ${chunks.length} chunks with context and embeddings`);

  // 2. Query chunks using hybrid search
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

  // Results include both content and context, with detailed scores
  results.forEach((r, i) => {
    console.log(`\nResult ${i + 1}:`);
    console.log(`Content: ${r.content}`);
    console.log(`Context: ${r.context}`);
    console.log(`Scores:`, r.scores);
  });

  return results;
}
```

### With cURL

```bash
# 1. Chunk document with context generation
curl -X POST http://localhost:23673/v1/chunk \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Your document text...",
    "model": "all-MiniLM-L6-v2.Q4_K_M",
    "chunkSize": 500,
    "overlap": 50
  }'

# 2. Query chunks with hybrid search
curl -X POST http://localhost:23673/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Your search query",
    "chunks": [...],  # Chunks with content_embedding and context_embedding
    "embeddingModel": "all-MiniLM-L6-v2.Q4_K_M",
    "rerankerModel": "bge-reranker-v2-m3-Q8_0",
    "topK": 4
  }'
```

## Enhanced Search with Context

The API supports two modes of operation:

1. Basic Mode (Default):

   - Simple chunking and embeddings
   - Direct content-based search
   - No context generation

2. Context-Aware Mode:
   - Generates contextual descriptions for chunks
   - Uses dual embeddings for richer search
   - Choice of context generation:
     - Local: Uses Llama-2 model (DEFAULT_CHAT_MODEL)
     - OpenAI: Uses specified model (requires API key)

To enable context-aware search:

1. Set `generateContexts: true` in chunking request
2. Optionally set `useOpenAI: true` for OpenAI-powered context generation

The combined score is weighted:

- 60% content similarity
- 40% context similarity (when available)

## Memory Management

Models are automatically unloaded after 30 minutes of inactivity to manage memory usage. You can:

1. Preload models using `/models/load`
2. Check loaded models with `/models/list`
3. Manually unload models with `/models/unload`
