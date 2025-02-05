# Local Contextual RAG API Server

[Previous content remains the same until Database Schema section]

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

[Previous In-Memory RAG Operations section remains the same]

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

[Rest of the documentation remains the same]

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

[Rest of the documentation remains the same]
