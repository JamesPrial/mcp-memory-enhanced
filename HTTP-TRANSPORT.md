# HTTP/SSE Transport for MCP Memory Server

This enhanced MCP memory server now supports HTTP and Server-Sent Events (SSE) transports in addition to the standard stdio transport. This enables remote access, multi-session support, and integration with web applications.

## Quick Start

### Running with HTTP Transport

```bash
# Using environment variable
TRANSPORT_TYPE=http npm start

# Or use the npm script
npm run start:http
```

### Running with SSE Transport

```bash
# Using environment variable
TRANSPORT_TYPE=sse npm start

# Or use the npm script
npm run start:sse
```

By default, the HTTP server runs on port 3000. You can change this with the `HTTP_PORT` environment variable:

```bash
HTTP_PORT=8080 TRANSPORT_TYPE=http npm start
```

## API Reference

### Create Session

Creates a new MCP session and returns a session ID.

```http
POST /session
```

**Response:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Send Message (HTTP Transport)

Send an MCP message to a session and receive the response.

```http
POST /session/{sessionId}/message
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [...]
  }
}
```

### Subscribe to Events (SSE Transport)

Subscribe to server-sent events for real-time communication.

```http
GET /session/{sessionId}/events
```

**Response:** Server-Sent Events stream
```
data: {"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}

data: {"jsonrpc":"2.0","method":"notification","params":{...}}
```

### Close Session

Explicitly close a session when done.

```http
DELETE /session/{sessionId}
```

**Response:**
```json
{
  "message": "Session closed"
}
```

### Health Check

Check server health and active sessions.

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "sessions": 5,
  "timestamp": "2025-08-05T12:00:00.000Z"
}
```

## Usage Examples

### JavaScript/TypeScript Client

```typescript
// Create a session
const sessionResponse = await fetch('http://localhost:3000/session', {
  method: 'POST'
});
const { sessionId } = await sessionResponse.json();

// List available tools
const toolsResponse = await fetch(`http://localhost:3000/session/${sessionId}/message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list'
  })
});
const tools = await toolsResponse.json();

// Call a tool
const createEntityResponse = await fetch(`http://localhost:3000/session/${sessionId}/message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'memory__create_entities',
      arguments: {
        entities: [{
          name: 'John Doe',
          entityType: 'person',
          observations: ['Software engineer', 'Lives in San Francisco']
        }]
      }
    }
  })
});

// Clean up
await fetch(`http://localhost:3000/session/${sessionId}`, {
  method: 'DELETE'
});
```

### Using Server-Sent Events

```javascript
const eventSource = new EventSource(`http://localhost:3000/session/${sessionId}/events`);

eventSource.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

eventSource.onerror = (error) => {
  console.error('SSE Error:', error);
  eventSource.close();
};
```

### Python Client Example

```python
import requests
import json

# Create session
session_resp = requests.post('http://localhost:3000/session')
session_id = session_resp.json()['sessionId']

# List tools
tools_resp = requests.post(
    f'http://localhost:3000/session/{session_id}/message',
    json={
        'jsonrpc': '2.0',
        'id': 1,
        'method': 'tools/list'
    }
)
print(tools_resp.json())

# Create an entity
create_resp = requests.post(
    f'http://localhost:3000/session/{session_id}/message',
    json={
        'jsonrpc': '2.0',
        'id': 2,
        'method': 'tools/call',
        'params': {
            'name': 'memory__create_entities',
            'arguments': {
                'entities': [{
                    'name': 'Python Client',
                    'entityType': 'application',
                    'observations': ['HTTP client example', 'Uses requests library']
                }]
            }
        }
    }
)
print(create_resp.json())

# Clean up
requests.delete(f'http://localhost:3000/session/{session_id}')
```

## Docker Deployment

The HTTP transport is fully compatible with Docker:

```dockerfile
FROM ghcr.io/jamesprial/mcp-memory-enhanced:latest

ENV TRANSPORT_TYPE=http
ENV HTTP_PORT=3000
ENV STORAGE_TYPE=sqlite

EXPOSE 3000

# Health check for HTTP transport
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

Docker Compose example:

```yaml
services:
  mcp-memory-http:
    image: ghcr.io/jamesprial/mcp-memory-enhanced:latest
    environment:
      - TRANSPORT_TYPE=http
      - HTTP_PORT=3000
      - STORAGE_TYPE=sqlite
      - STORAGE_PATH=/data
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 3s
      retries: 3
```

## Session Management

- Sessions are automatically created when you POST to `/session`
- Each session maintains its own MCP server instance
- Sessions timeout after 30 minutes of inactivity
- You can have multiple concurrent sessions
- Sessions are automatically cleaned up on disconnect or timeout

## Security Considerations

When using HTTP transport in production:

1. **Always use HTTPS** - Deploy behind a reverse proxy with SSL/TLS
2. **Implement authentication** - Add authentication middleware
3. **Rate limiting** - Prevent abuse with rate limiting
4. **CORS configuration** - Configure CORS appropriately for your use case
5. **Network isolation** - Don't expose directly to the internet without proper security

Example nginx configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name mcp-memory.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=mcp_limit:10m rate=10r/s;
    limit_req zone=mcp_limit burst=20 nodelay;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        
        # For SSE support
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        
        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Performance Considerations

- HTTP transport adds network latency compared to stdio
- Each session maintains its own storage connection
- Consider connection pooling for high-traffic scenarios
- SSE transport keeps connections open - monitor resource usage
- Session cleanup runs every minute to prevent memory leaks

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Use a different port
   HTTP_PORT=8080 TRANSPORT_TYPE=http npm start
   ```

2. **Session not found errors**
   - Sessions expire after 30 minutes
   - Create a new session if expired

3. **SSE connection drops**
   - Normal behavior - clients should reconnect
   - Check proxy/firewall timeout settings

4. **Memory usage growing**
   - Monitor active sessions with `/health`
   - Ensure clients properly close sessions

## Integration with MCP Clients

While MCP clients typically use stdio transport, you can create an HTTP-to-stdio bridge:

```javascript
// http-bridge.js
const { spawn } = require('child_process');
const axios = require('axios');

// Create MCP session
const session = await axios.post('http://localhost:3000/session');
const sessionId = session.data.sessionId;

// Bridge stdio to HTTP
process.stdin.on('data', async (data) => {
  try {
    const message = JSON.parse(data);
    const response = await axios.post(
      `http://localhost:3000/session/${sessionId}/message`,
      message
    );
    process.stdout.write(JSON.stringify(response.data) + '\n');
  } catch (error) {
    process.stderr.write(`Bridge error: ${error.message}\n`);
  }
});
```

This enables using the HTTP transport with any MCP-compatible client.