import sys
import os
from mcp.server.fastmcp import FastMCP
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# Resolve and add project root directory to sys.path to guarantee clean imports
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "../.."))
if WORKSPACE_ROOT not in sys.path:
    sys.path.append(WORKSPACE_ROOT)

from mcp.server.transport_security import TransportSecuritySettings
import src.google_workspace as gw

# Initialize FastMCP Server with disabled DNS rebinding protection for Cloud Run compatibility
security = TransportSecuritySettings(enable_dns_rebinding_protection=False)
mcp = FastMCP("Google Workspace MCP Server", transport_security=security)

def get_google_service(service_name: str, version: str, access_token: str = None):
    """
    Returns an authorized Google API service instance.
    Uses user OAuth access_token if provided, otherwise falls back to local service account credentials.
    """
    if access_token:
        creds = Credentials(token=access_token)
    else:
        creds = gw.get_service_account_creds()
    return build(service_name, version, credentials=creds)

@mcp.tool()
def fetch_doc_content(document_id: str, access_token: str | None = None) -> str:
    """
    Reads the main text content of the first tab of a Google Document.
    Optionally accepts a user access_token for user-scoped authentication.
    """
    docs_service = get_google_service('docs', 'v1', access_token)
    return gw.fetch_google_doc(document_id, docs_service=docs_service)

@mcp.tool()
def fetch_tab_content(document_id: str, tab_name: str = "Transcript", access_token: str | None = None) -> str:
    """
    Reads the text content of a specific named tab in a Google Document.
    Optionally accepts a user access_token for user-scoped authentication.
    """
    docs_service = get_google_service('docs', 'v1', access_token)
    return gw.fetch_transcript_tab_text(document_id, tab_name=tab_name, docs_service=docs_service)

@mcp.tool()
def clear_document_decorations(document_id: str, access_token: str | None = None) -> str:
    """
    Deletes existing [PROP-x] markers and clears yellow background highlights in the Google Doc.
    Optionally accepts a user access_token for user-scoped authentication.
    """
    docs_service = get_google_service('docs', 'v1', access_token)
    gw.clear_existing_proposals(docs_service, document_id)
    return "Cleared decorations successfully."

@mcp.tool()
def mark_mismatch(document_id: str, label: str, prop_id: str, access_token: str | None = None) -> str:
    """
    Highlights a specific label's value in yellow and appends a [PROP-x] marker to the Google Doc.
    Optionally accepts a user access_token for user-scoped authentication.
    """
    docs_service = get_google_service('docs', 'v1', access_token)
    proposal = {"label": label, "id": prop_id}
    gw.apply_highlights_and_markers(docs_service, document_id, [proposal])
    return f"Successfully marked mismatch {prop_id}."

@mcp.tool()
def stage_proposals(document_id: str, proposals: list, access_token: str | None = None) -> str:
    """
    Creates or rewrites the 'Proposal' tab in the Google Doc with serialized staging lines.
    Optionally accepts a user access_token for user-scoped authentication.
    """
    docs_service = get_google_service('docs', 'v1', access_token)
    gw.write_proposal_tab(docs_service, document_id, proposals)
    return f"Successfully staged {len(proposals)} proposals in the tab."

if __name__ == "__main__":
    # Start the Google Workspace MCP Server in persistent SSE mode
    # Default to 0.0.0.0 for containerized/cloud environments (e.g. Cloud Run)
    host = os.getenv("MCP_HOST", "0.0.0.0")
    # Cloud Run injects PORT environment variable dynamically
    port = int(os.getenv("PORT", os.getenv("MCP_PORT", "9000")))
    mcp.settings.host = host
    mcp.settings.port = port
    # In SSE mode, the endpoints will be /sse and /messages/
    print(f"Starting Google Workspace MCP Server in SSE mode at http://{host}:{port}/sse")
    mcp.run(transport="sse")
