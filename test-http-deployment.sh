#!/bin/bash

# Test script for MCP Memory Enhanced HTTP deployment
# This script verifies that the HTTP transport is working correctly

set -e

echo "=== MCP Memory Enhanced HTTP Deployment Test ==="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
HTTP_HOST="${HTTP_HOST:-localhost}"
HTTP_PORT="${HTTP_PORT:-3000}"
BASE_URL="http://${HTTP_HOST}:${HTTP_PORT}"

# Helper function to make HTTP requests
make_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    if [ -z "$data" ]; then
        curl -s -X "$method" "${BASE_URL}${endpoint}" \
            -H "Content-Type: application/json"
    else
        curl -s -X "$method" "${BASE_URL}${endpoint}" \
            -H "Content-Type: application/json" \
            -d "$data"
    fi
}

# Test 1: Health Check
echo "1. Testing health endpoint..."
HEALTH=$(make_request GET "/health")
if echo "$HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✓${NC} Health check passed"
    echo "   Response: $HEALTH"
else
    echo -e "${RED}✗${NC} Health check failed"
    echo "   Response: $HEALTH"
    exit 1
fi
echo ""

# Test 2: Create Session
echo "2. Creating a new session..."
SESSION_RESPONSE=$(make_request POST "/session")
SESSION_ID=$(echo "$SESSION_RESPONSE" | grep -o '"sessionId":"[^"]*' | cut -d'"' -f4)

if [ -n "$SESSION_ID" ]; then
    echo -e "${GREEN}✓${NC} Session created successfully"
    echo "   Session ID: $SESSION_ID"
else
    echo -e "${RED}✗${NC} Failed to create session"
    echo "   Response: $SESSION_RESPONSE"
    exit 1
fi
echo ""

# Test 3: List Tools
echo "3. Listing available tools..."
TOOLS_REQUEST='{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
}'
TOOLS_RESPONSE=$(make_request POST "/session/$SESSION_ID/message" "$TOOLS_REQUEST")

if echo "$TOOLS_RESPONSE" | grep -q "memory__create_entities"; then
    echo -e "${GREEN}✓${NC} Tools listed successfully"
    TOOL_COUNT=$(echo "$TOOLS_RESPONSE" | grep -o "memory__" | wc -l)
    echo "   Found $TOOL_COUNT memory tools"
else
    echo -e "${RED}✗${NC} Failed to list tools"
    echo "   Response: $TOOLS_RESPONSE"
    exit 1
fi
echo ""

# Test 4: Create Entity
echo "4. Creating a test entity..."
CREATE_ENTITY_REQUEST='{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
        "name": "memory__create_entities",
        "arguments": {
            "entities": [{
                "name": "HTTP Test Entity",
                "entityType": "test",
                "observations": ["Created via HTTP transport", "Test timestamp: '"$(date -Iseconds)"'"]
            }]
        }
    }
}'
CREATE_RESPONSE=$(make_request POST "/session/$SESSION_ID/message" "$CREATE_ENTITY_REQUEST")

if echo "$CREATE_RESPONSE" | grep -q "HTTP Test Entity"; then
    echo -e "${GREEN}✓${NC} Entity created successfully"
else
    echo -e "${RED}✗${NC} Failed to create entity"
    echo "   Response: $CREATE_RESPONSE"
    exit 1
fi
echo ""

# Test 5: Search for Entity
echo "5. Searching for the created entity..."
SEARCH_REQUEST='{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
        "name": "memory__search_nodes",
        "arguments": {
            "query": "HTTP Test Entity"
        }
    }
}'
SEARCH_RESPONSE=$(make_request POST "/session/$SESSION_ID/message" "$SEARCH_REQUEST")

if echo "$SEARCH_RESPONSE" | grep -q "HTTP Test Entity"; then
    echo -e "${GREEN}✓${NC} Entity found successfully"
else
    echo -e "${RED}✗${NC} Failed to find entity"
    echo "   Response: $SEARCH_RESPONSE"
    exit 1
fi
echo ""

# Test 6: Delete Entity
echo "6. Cleaning up test entity..."
DELETE_REQUEST='{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
        "name": "memory__delete_entities",
        "arguments": {
            "entityNames": ["HTTP Test Entity"]
        }
    }
}'
DELETE_RESPONSE=$(make_request POST "/session/$SESSION_ID/message" "$DELETE_REQUEST")

if echo "$DELETE_RESPONSE" | grep -q "result"; then
    echo -e "${GREEN}✓${NC} Entity deleted successfully"
else
    echo -e "${YELLOW}⚠${NC} Could not verify deletion"
fi
echo ""

# Test 7: Close Session
echo "7. Closing session..."
CLOSE_RESPONSE=$(make_request DELETE "/session/$SESSION_ID")

if echo "$CLOSE_RESPONSE" | grep -q "closed"; then
    echo -e "${GREEN}✓${NC} Session closed successfully"
else
    echo -e "${YELLOW}⚠${NC} Could not verify session closure"
fi
echo ""

# Summary
echo "=== Test Summary ==="
echo -e "${GREEN}All HTTP deployment tests passed!${NC}"
echo ""
echo "The MCP Memory Enhanced server is working correctly over HTTP transport."
echo "You can now use the HTTP API at: $BASE_URL"
echo ""
echo "To deploy with Docker:"
echo "  docker-compose -f docker-compose.http.yml up -d"
echo ""
echo "API Endpoints:"
echo "  POST   /session                       - Create a new session"
echo "  POST   /session/{id}/message         - Send MCP message"
echo "  GET    /session/{id}/events          - SSE endpoint for real-time events"
echo "  DELETE /session/{id}                 - Close a session"
echo "  GET    /health                       - Health check"