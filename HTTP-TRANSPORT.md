# HTTP/SSE Transport for MCP Memory Server

This document describes the HTTP and Server-Sent Events (SSE) transport implementation for the enhanced MCP memory server.

## Overview

The HTTP transport allows the MCP memory server to be accessed over HTTP/HTTPS instead of stdio, enabling:
- Remote access from anywhere
- Multiple concurrent sessions
- Integration with web services
- Docker/container deployments
- Load balancing and scaling

## Architecture

### Transport Types

1. **HTTP Transport** - Request/response model for simple interactions
2. **SSE Transport** - Server-Sent Events for real-time streaming updates

### Endpoints

- `POST /mcp` - Initialize sessions and handle JSON-RPC requests
- `GET /mcp` - Establish SSE connections for streaming
- `DELETE /mcp` - Terminate sessions cleanly
- `GET /health` - Health check endpoint

### Session Management

Each client gets a unique session ID (`X-Session-Id` header) that maintains:
- Dedicated MCP server instance
- Isolated storage connection
- Independent state management

Sessions timeout after 30 minutes of inactivity.

## Usage

### Starting the Server

#### Standalone
```bash
# HTTP mode
TRANSPORT_TYPE=http node dist/index.js

# With custom port
TRANSPORT_TYPE=http PORT=8080 node dist/index.js
```

#### Docker
```bash
# Using docker-compose
docker-compose -f docker-compose-http.yml up -d

# Or with docker run
docker run -d \
  -p 6970:6970 \
  -e TRANSPORT_TYPE=http \
  -e STORAGE_TYPE=sqlite \
  -v ./data:/data \
  mcp-memory-enhanced:http
```

### Connecting with Claude Code

#### SSE Transport (Recommended)
```bash
# Local connection
claude mcp add --transport sse memory-enhanced http://localhost:6970/mcp

# Remote connection
claude mcp add --transport sse memory-enhanced https://your-server.com:6970/mcp
```

#### HTTP Transport
```bash
# Local connection
claude mcp add --transport http memory-enhanced http://localhost:6970/mcp
```

### API Examples

#### Create Session and List Tools
```bash
curl -X POST http://localhost:6970/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

#### Create Entity
```bash
SESSION_ID="your-session-id"
curl -X POST http://localhost:6970/mcp \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "memory__create_entities",
      "arguments": {
        "entities": [{
          "name": "Example Entity",
          "entityType": "Concept",
          "observations": ["This is a test entity"]
        }]
      }
    },
    "id": 2
  }'
```

#### Connect to SSE Stream
```bash
curl -N -H "X-Session-Id: $SESSION_ID" \
  -H "Accept: text/event-stream" \
  http://localhost:6970/mcp
```

#### Terminate Session
```bash
curl -X DELETE http://localhost:6970/mcp \
  -H "X-Session-Id: $SESSION_ID"
```

## Configuration

### Environment Variables

- `TRANSPORT_TYPE` - Set to `http` or `sse` to enable HTTP transport
- `PORT` - HTTP server port (default: 6970)
- `STORAGE_TYPE` - Storage backend: `json` or `sqlite` (default: sqlite)
- `SQLITE_PATH` - Path to SQLite database (default: ./data/memory.db)

### CORS Configuration

By default, CORS is disabled for security. To enable cross-origin requests, set:
```bash
CORS_ORIGIN=https://your-app.com
```

## Security Considerations

### Current Implementation
- No authentication (designed for trusted environments)
- Session-based isolation
- Input validation with Zod schemas

### Production Recommendations
1. Always use HTTPS in production
2. Place behind a reverse proxy (nginx, Caddy)
3. Implement authentication (OAuth, API keys)
4. Enable rate limiting
5. Monitor session usage

### Example Nginx Configuration
```nginx
server {
    listen 443 ssl http2;
    server_name memory.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /mcp {
        proxy_pass http://localhost:6970;
        proxy_http_version 1.1;
        
        # For SSE support
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://localhost:6970;
    }
}
```

## Performance

### Benchmarks
- HTTP transport adds ~5-10ms latency vs stdio
- Supports 100+ concurrent sessions
- Memory usage: ~50MB base + 10MB per session

### Optimization Tips
1. Use connection pooling for clients
2. Enable HTTP/2 for multiplexing
3. Set appropriate session timeouts
4. Monitor memory usage

## Troubleshooting

### Common Issues

1. **Session not found**
   - Ensure X-Session-Id header is included
   - Check if session timed out (30 min default)

2. **SSE connection drops**
   - Check proxy buffering settings
   - Verify keep-alive configuration

3. **High memory usage**
   - Reduce session timeout
   - Limit max concurrent sessions

### Debug Mode
```bash
DEBUG=mcp:* TRANSPORT_TYPE=http node dist/index.js
```

## Migration from stdio

Existing stdio clients can migrate gradually:

1. Deploy HTTP server alongside stdio
2. Test with HTTP clients
3. Migrate clients one by one
4. Decommission stdio server

The HTTP transport maintains full compatibility with all 10 MCP memory tools.