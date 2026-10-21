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

# Copy package manifests and Prisma schema for deterministic installation and caching
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies deterministically with lifecycle scripts disabled to prevent unverified script execution (docker:S6505)
RUN npm ci --ignore-scripts

# Explicitly execute only trusted, required build and generation steps
RUN npm rebuild argon2
RUN ./node_modules/.bin/prisma generate

# Copy only required application source code and configuration (replaces recursive blanket copy)
COPY tsconfig.json ./
COPY src ./src/

# Enforce non-root container execution (docker:S6507 / CIS Docker Benchmark)
RUN chown -R node:node /app
USER node

EXPOSE 3001

# Execute using local pinned tsx binary from node_modules
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
