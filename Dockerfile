FROM node:20-slim

WORKDIR /app

# Install pnpm directly
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

ARG PORT=57352
ENV PORT=$PORT
EXPOSE $PORT

# Set permissions for start script
RUN chmod +x start.sh

CMD ["./start.sh"]
