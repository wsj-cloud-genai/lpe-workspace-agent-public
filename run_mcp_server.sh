#!/bin/bash
# Automatically activate the virtual environment if it exists
if [ -d ".venv" ]; then
  source .venv/bin/activate
fi

export MCP_TRANSPORT=sse
export MCP_HOST=127.0.0.1
export MCP_PORT=9000

echo "Starting Google Workspace MCP Server in SSE mode on http://$MCP_HOST:$MCP_PORT/sse ..."
python src/mcp/workspace_server.py
