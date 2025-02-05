#!/bin/bash

# Create model directories if they don't exist
mkdir -p models/chat
mkdir -p models/embedding
mkdir -p models/reranker

echo "Downloading recommended models..."

# Download chat model
echo "Downloading chat model..."
curl -L "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf" -o "models/chat/Llama-3.2-1B-Instruct-Q4_K_M.gguf"

# Download embedding model
echo "Downloading embedding model..."
curl -L "https://huggingface.co/leliuga/all-MiniLM-L6-v2-GGUF/resolve/main/all-MiniLM-L6-v2.Q4_K_M.gguf" -o "models/embedding/all-MiniLM-L6-v2.Q4_K_M.gguf"

# Download reranker model
echo "Downloading reranker model..."
curl -L "https://huggingface.co/klnstpr/bge-reranker-v2-m3-Q8_0-GGUF/resolve/main/bge-reranker-v2-m3-q8_0.gguf" -o "models/reranker/bge-reranker-v2-m3-q8_0.gguf"

echo "All models downloaded successfully!"
