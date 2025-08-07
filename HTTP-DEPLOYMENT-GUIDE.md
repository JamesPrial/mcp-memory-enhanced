# HTTP Deployment Guide - MCP Memory Enhanced

## Quick Fix for HTTP Deployment Issues

If your HTTP deployment isn't working, you're likely missing the `TRANSPORT_TYPE=http` environment variable and proper port configuration.

## The Problem

The default Docker deployment uses stdio transport, not HTTP. To enable HTTP transport, you need:
1. Set `TRANSPORT_TYPE=http` environment variable
2. Expose port 3000 (HTTP API port) instead of only 6970
3. Update health checks to use the correct endpoint

## Solution: Use the HTTP-Specific Docker Compose

### Option 1: Use the Dedicated HTTP Docker Compose File

```bash
# Build and run with HTTP transport enabled
docker-compose -f docker-compose.http.yml up -d

# Check if it's working
curl http://localhost:3000/health

# View logs
docker-compose -f docker-compose.http.yml logs -f

# Stop the service
docker-compose -f docker-compose.http.yml down
```

### Option 2: Modify Existing docker-compose.yml

Update your `docker-compose.yml`:

```yaml
services:
  mcp-memory-enhanced:
    # ... other configuration ...
    ports:
      - "3000:3000"     # Add HTTP API port
      - "6970:6970"     # Keep health monitoring port
    environment:
      - TRANSPORT_TYPE=http    # CRITICAL: Enable HTTP transport
      - HTTP_PORT=3000        # HTTP server port
      # ... other environment variables ...
    healthcheck:
      # Update health check for HTTP mode
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
```

### Option 3: Run with Docker CLI

```bash
docker run -d \
  --name mcp-memory-http \
  -p 3000:3000 \
  -v $(pwd)/data:/data \
  -e TRANSPORT_TYPE=http \
  -e HTTP_PORT=3000 \
  -e STORAGE_TYPE=sqlite \
  mcp-memory-enhanced:latest
```

## Testing the HTTP Deployment

### Quick Test
```bash
# 1. Check health
curl http://localhost:3000/health

# 2. Create a session
SESSION_ID=$(curl -s -X POST http://localhost:3000/session | jq -r .sessionId)
echo "Session ID: $SESSION_ID"

# 3. List tools
curl -X POST http://localhost:3000/session/$SESSION_ID/message \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Full Test Suite
```bash
# Run the comprehensive test script
./test-http-deployment.sh
```

## API Endpoints

When running in HTTP mode, these endpoints are available:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/session` | Create a new MCP session |
| POST | `/session/{id}/message` | Send MCP message to session |
| GET | `/session/{id}/events` | SSE endpoint for real-time events |
| DELETE | `/session/{id}` | Close a session |
| GET | `/health` | Health check endpoint |

## Example Client Code

### JavaScript/TypeScript
```javascript
// Create session
const response = await fetch('http://localhost:3000/session', {
  method: 'POST'
});
const { sessionId } = await response.json();

// Call a tool
const result = await fetch(`http://localhost:3000/session/${sessionId}/message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'memory__create_entities',
      arguments: {
        entities: [{
          name: 'Test Entity',
          entityType: 'test',
          observations: ['Created via HTTP']
        }]
      }
    }
  })
});

const data = await result.json();
console.log(data);

// Clean up
await fetch(`http://localhost:3000/session/${sessionId}`, {
  method: 'DELETE'
});
```

### Python
```python
import requests

# Create session
session = requests.post('http://localhost:3000/session')
session_id = session.json()['sessionId']

# Call a tool
response = requests.post(
    f'http://localhost:3000/session/{session_id}/message',
    json={
        'jsonrpc': '2.0',
        'id': 1,
        'method': 'tools/call',
        'params': {
            'name': 'memory__search_nodes',
            'arguments': {
                'query': 'test'
            }
        }
    }
)
print(response.json())

# Clean up
requests.delete(f'http://localhost:3000/session/{session_id}')
```

## Troubleshooting

### Container starts but HTTP endpoints return 404
**Problem**: The server is running in stdio mode, not HTTP mode.
**Solution**: Ensure `TRANSPORT_TYPE=http` is set in environment variables.

### Port 3000 connection refused
**Problem**: Port not exposed or wrong port mapped.
**Solution**: Check docker-compose ports section includes `- "3000:3000"`

### Health check failing
**Problem**: Health check pointing to wrong port.
**Solution**: 
- For HTTP mode: health check should use port 3000
- For stdio mode: health check should use port 6970

### Session not found errors
**Problem**: Sessions expire after 30 minutes of inactivity.
**Solution**: Create a new session if expired.

## Production Deployment

For production, consider:

1. **Use HTTPS**: Deploy behind a reverse proxy (nginx, traefik) with SSL
2. **Add Authentication**: Implement API key or JWT authentication
3. **Rate Limiting**: Prevent abuse with rate limiting
4. **Monitoring**: Use the `/health` endpoint for monitoring
5. **Session Management**: Implement proper session cleanup

Example nginx configuration:
```nginx
server {
    listen 443 ssl http2;
    server_name mcp-memory.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Different Transport Modes

| Transport | Use Case | Port | Protocol |
|-----------|----------|------|----------|
| `stdio` (default) | Direct MCP client integration | 6970 (health only) | Standard I/O |
| `http` | REST API access | 3000 | HTTP/JSON |
| `sse` | Real-time streaming | 3000 | Server-Sent Events |

## Summary

The key to fixing HTTP deployment issues is:
1. Set `TRANSPORT_TYPE=http` environment variable
2. Expose port 3000 for HTTP API
3. Use `docker-compose.http.yml` for easy deployment

For questions or issues, please check the logs:
```bash
docker-compose -f docker-compose.http.yml logs mcp-memory-http
```