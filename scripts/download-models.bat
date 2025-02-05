@echo off
mkdir models\chat models\embedding models\reranker 2>nul
echo Downloading recommended models...

echo Downloading chat model...
curl -L -o models/chat/Llama-3.2-1B-Instruct-Q4_K_M.gguf https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf

echo Downloading embedding model...
curl -L -o models/embedding/all-MiniLM-L6-v2.Q4_K_M.gguf https://huggingface.co/leliuga/all-MiniLM-L6-v2-GGUF/resolve/main/all-MiniLM-L6-v2.Q4_K_M.gguf

echo Downloading reranker model...
curl -L -o models/reranker/bge-reranker-v2-m3-q8_0.gguf https://huggingface.co/klnstpr/bge-reranker-v2-m3-Q8_0-GGUF/resolve/main/bge-reranker-v2-m3-q8_0.gguf

echo All models downloaded successfully!