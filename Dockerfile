# Use official light-weight Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies if any
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY src/ ./src/

# Expose port
EXPOSE 9000

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=9000

# Start the MCP server using python
CMD ["python", "src/mcp/workspace_server.py"]
