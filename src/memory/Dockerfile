FROM node:22.12-alpine AS builder

COPY src/memory /app
COPY tsconfig.json /tsconfig.json

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm npm install

RUN --mount=type=cache,target=/root/.npm-production npm ci --ignore-scripts --omit-dev

FROM node:22-alpine AS release

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

ENV NODE_ENV=production
ENV TRANSPORT_TYPE=stdio
ENV PORT=6970

WORKDIR /app

RUN npm ci --ignore-scripts --omit-dev

# Expose port for HTTP transport
EXPOSE 6970

ENTRYPOINT ["node", "dist/index.js"]