#!/bin/bash
echo "Launching MCP Inspector..."
echo "Once the browser opens:"
echo "1. Change the Transport dropdown to 'SSE'"
echo "2. Enter the URL: http://127.0.0.1:9000/sse"
echo "3. Click Connect"
npx -y @modelcontextprotocol/inspector
