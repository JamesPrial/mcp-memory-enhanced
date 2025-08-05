# Multi-stage Dockerfile for Enhanced MCP Memory Server
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite-dev

# Copy package files from memory subdirectory
COPY src/memory/package.json ./

# Install dependencies
RUN npm install

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy root tsconfig
COPY tsconfig.json ../
# Copy memory server source files
COPY src/memory/ ./

# Build the application
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache sqlite-libs dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy necessary files
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

# Create data directory with proper permissions
RUN mkdir -p /data && \
    chown -R nodejs:nodejs /data && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Environment variables
ENV NODE_ENV=production
ENV STORAGE_TYPE=sqlite
ENV STORAGE_PATH=/data
ENV PORT=6970

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:6970/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Expose port
EXPOSE 6970

# Volume for persistent data
VOLUME ["/data"]

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the server
CMD ["node", "dist/index.js"]