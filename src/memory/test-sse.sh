#!/bin/bash

# Test SSE endpoint
echo "Testing SSE connection..."

# First create a session
SESSION_ID=$(curl -s -X POST http://localhost:6970/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}' \
  -D - | grep -i x-session-id | cut -d' ' -f2 | tr -d '\r\n')

echo "Session ID: $SESSION_ID"

# Connect to SSE stream
echo "Connecting to SSE stream..."
curl -N -H "X-Session-Id: $SESSION_ID" \
  -H "Accept: text/event-stream" \
  http://localhost:6970/mcp