# Pinned Debian Bookworm Node 20 LTS base image
FROM node:20.18.0-bookworm-slim

WORKDIR /app

# Install openssl for Prisma and build tools for native addons (argon2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install tsx pinned to exact version matching package-lock.json devDependencies
RUN npm install -g tsx@4.20.6

# Copy package manifests and Prisma schema for deterministic installation and caching
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies deterministically using npm ci
RUN npm ci

# Generate Prisma client using local prisma binary
RUN ./node_modules/.bin/prisma generate

# Copy only required application source code and configuration (replaces recursive blanket copy)
COPY tsconfig.json ./
COPY src ./src/

EXPOSE 3001

# Execute using pinned tsx binary
CMD ["tsx", "src/server.ts"]
