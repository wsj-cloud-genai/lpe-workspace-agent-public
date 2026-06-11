#!/bin/bash
set -e

PROJECT_ID="${GCP_PROJECT:-<YOUR_GCP_PROJECT_ID>}"
REGION="us-central1"
SERVICE_NAME="lpe-workspace-mcp"
SERVICE_ACCOUNT_EMAIL="${MCP_SERVICE_ACCOUNT:-<YOUR_SERVICE_ACCOUNT_EMAIL>}"

echo "==================================================="
echo "Deploying Workspace MCP Server to Cloud Run"
echo "Project:      $PROJECT_ID"
echo "Service Name: $SERVICE_NAME"
echo "Region:       $REGION"
echo "Service Acct: $SERVICE_ACCOUNT_EMAIL"
echo "==================================================="

# Trigger Source-based Cloud Run deployment using the Dockerfile
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --allow-unauthenticated \
  --service-account="$SERVICE_ACCOUNT_EMAIL" \
  --set-env-vars="MCP_TRANSPORT=sse,MCP_HOST=0.0.0.0"

echo "==================================================="
echo "[SUCCESS] Workspace MCP Server deployed successfully."
echo "==================================================="
