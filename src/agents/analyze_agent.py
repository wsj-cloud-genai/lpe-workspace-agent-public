import os
import sys
import re
import asyncio
import json
import logging
from pydantic import BaseModel, Field
from mcp import ClientSession
from mcp.client.sse import sse_client
from google.adk import Agent, Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.genai import types

# Setup logging
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("analyze-agent")

# Resolve relative paths
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
LPE_ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..")) # lpe-workspace-agent/src
WORKSPACE_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "../..")) # lpe-workspace-agent

if LPE_ROOT_DIR not in sys.path:
    sys.path.append(LPE_ROOT_DIR)
if WORKSPACE_ROOT not in sys.path:
    sys.path.append(WORKSPACE_ROOT)


# Setup Gemini API key
api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
if api_key:
    os.environ["GEMINI_API_KEY"] = api_key
else:
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(WORKSPACE_ROOT, ".env"))
        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if api_key:
            os.environ["GEMINI_API_KEY"] = api_key
    except ImportError:
        pass

# Ensure credentials environment variable is set
if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
    key_path = os.path.join(WORKSPACE_ROOT, "service-account-key.json")
    if os.path.exists(key_path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = key_path


# 1. Define Proposal structured schema
class ProposalItem(BaseModel):
    id: str = Field(description="Proposal ID, e.g. PROP-1, PROP-2")
    type: str = Field(description="Type of modification, must be: 'replace', 'add', or 'remove'")
    label: str = Field(description="The exact text label in the briefing doc matching the field (e.g. 'Primary Accent Color (HEX): ', 'CTA Action Label: ')")
    old_value: str = Field(description="The current value inside the briefing doc (or empty if it's an addition)")
    new_value: str = Field(description="The proposed new value based on the transcript")
    insert_after_label: str = Field(description="For 'add' types, the exact heading or label in the briefing doc after which this new field should be inserted. Leave empty for 'replace' and 'remove'.")
    reason: str = Field(description="A short justification summarizing what they said in the transcript. Do not include timestamps.")

class ProposalAnalysis(BaseModel):
    proposals: list[ProposalItem] = Field(description="List of proposed changes to resolve mismatches between brief doc and transcript")


# Python controller function called by backend
def run_adk_agent_analysis(raw_brief_text: str, raw_transcript_text: str) -> list:
    log.info("Executing Google ADK Agent analysis...")
    instruction = """
You are the Mismatch Analyze Agent. Your task is to compare the branding/copywriting parameters inside a Google Doc Brief with a Google Meet transcript.
Your goal is to detect any mismatches, contradictions, additions, or removals, and output them as a structured list of proposals.

### RULES:
1. **Mismatches (Replace)**: If a value in the brief (e.g. primary color is blue) differs from what the client said in the transcript (e.g. "let's use gold instead"), generate a 'replace' proposal.
2. **Missing Information (Add)**: If the client requested something in the transcript that is completely missing from the brief, generate an 'add' proposal.
3. **Unwanted Information (Remove)**: If the brief contains a feature or guideline that the client explicitly rejected or asked to remove in the transcript, generate a 'remove' proposal.
4. **PROP-x format**: Assign IDs sequentially starting from PROP-1, PROP-2, etc.
5. **No Timestamps**: The reason field should explain what was said in the transcript but must NOT contain any timestamps (e.g. 00:00:00).
6. **Transcript Dialog format**: The transcript is raw dialog. The speaker names indicate who said it.
7. **Ideal Placement (insert_after_label)**: For additions, carefully analyze the transcript to see if the client mentions where it should be placed in the document (e.g. "in the product features" maps to the heading "3. Product Features"). Set the `insert_after_label` field to the exact text of the heading or label in the brief document after which this new field should be inserted. Leave it empty for replacements or removals.
"""
    
    agent = Agent(
        name="mismatch_analyze_agent",
        instruction=instruction,
        model="gemini-2.5-flash",
        output_schema=ProposalAnalysis
    )
    
    runner = Runner(
        agent=agent,
        session_service=InMemorySessionService(),
        app_name="lpe_proposals_app",
        auto_create_session=True
    )
    
    prompt = f"""
Compare the following Brief Document guidelines and the Google Meet transcript. 
Identify all mismatches (replace), missing fields (add), or rejected fields (remove).
Generate a ProposalAnalysis structured output with proposals.

### BRIEF DOCUMENT CONTENT:
---
{raw_brief_text}
---

### TRANSCRIPT CONTENT:
---
{raw_transcript_text}
---
"""
    
    user_content = types.Content(parts=[types.Part(text=prompt)])
    events = []
    
    for event in runner.run(user_id="analyst_user", session_id="comparison_session", new_message=user_content):
        events.append(event)
        
    proposals_data = []
    for e in events:
        if e.output:
            try:
                parsed = json.loads(e.output)
                if "proposals" in parsed:
                    proposals_data = parsed["proposals"]
                    break
            except Exception:
                pass
                
    if not proposals_data:
        for e in events:
            if e.content and e.content.parts:
                for part in e.content.parts:
                    if part.text:
                        try:
                            match = re.search(r'\{.*\}', part.text, re.DOTALL)
                            if match:
                                parsed = json.loads(match.group(0))
                                if "proposals" in parsed:
                                    proposals_data = parsed["proposals"]
                                    break
                        except Exception:
                            pass
                            
    log.info(f"Agent found {len(proposals_data)} mismatch proposals.")
    return proposals_data


def analyze_transcript_and_brief(brief_id: str, transcript_id: str, access_token: str = None):
    return asyncio.run(analyze_transcript_and_brief_async(brief_id, transcript_id, access_token))


async def analyze_transcript_and_brief_async(brief_id: str, transcript_id: str, access_token: str = None):
    log.info("Starting Mismatch Analyze Agent with connection fallback options...")
    
    if not brief_id or not transcript_id:
        raise ValueError("Invalid brief_id or transcript_id.")
        
    log.info(f"Brief Doc ID: {brief_id}")
    log.info(f"Transcript Doc ID: {transcript_id}")
    
    # Try connecting to remote MCP server
    mcp_server_url = os.getenv("MCP_SERVER_URL", "http://127.0.0.1:9000/sse")
    log.info(f"Attempting to connect to remote MCP server via SSE: {mcp_server_url}")
    
    try:
        client_context = sse_client(mcp_server_url)
        async with client_context as (read, write):
            async with ClientSession(read, write) as session:
                await asyncio.wait_for(session.initialize(), timeout=5.0)
                log.info("MCP Session initialized successfully.")
                
                # Fetch contents via MCP server tools
                res_brief = await session.call_tool("fetch_doc_content", arguments={
                    "document_id": brief_id,
                    "access_token": access_token
                })
                raw_brief_text = res_brief.content[0].text
                
                res_trans = await session.call_tool("fetch_tab_content", arguments={
                    "document_id": transcript_id,
                    "tab_name": "Transcript",
                    "access_token": access_token
                })
                raw_transcript_text = res_trans.content[0].text
                
                log.info(f"--- FETCHED BRIEF CONTENT VIA MCP (len: {len(raw_brief_text)}) ---")
                log.info(f"--- FETCHED TRANSCRIPT CONTENT VIA MCP (len: {len(raw_transcript_text)}) ---")
                
                proposals_data = run_adk_agent_analysis(raw_brief_text, raw_transcript_text)
                
                log.info("Applying highlights and staging proposals via MCP tools...")
                # A. Clean up existing highlight styling and [PROP-x] tags
                await session.call_tool("clear_document_decorations", arguments={
                    "document_id": brief_id,
                    "access_token": access_token
                })
                
                # B. Add new highlights and markers to the briefing document body
                for prop in proposals_data:
                    await session.call_tool("mark_mismatch", arguments={
                        "document_id": brief_id,
                        "label": prop.get("label", ""),
                        "prop_id": prop.get("id", ""),
                        "access_token": access_token
                    })
                
                # C. Handle the "Proposal" tab (clean and rewrite)
                await session.call_tool("stage_proposals", arguments={
                    "document_id": brief_id,
                    "proposals": proposals_data,
                    "access_token": access_token
                })
                
                return proposals_data
                
    except Exception as e:
        log.warning(f"MCP server interaction failed or connection refused ({e}). Falling back to in-process execution...")
        
        # Local Imports
        import src.google_workspace as gw
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        
        def get_local_google_service(service_name: str, version: str, token: str = None):
            if token:
                creds = Credentials(token=token)
            else:
                creds = gw.get_service_account_creds()
            return build(service_name, version, credentials=creds)
            
        docs_service = get_local_google_service('docs', 'v1', access_token)
        
        # Fetch contents directly
        raw_brief_text = gw.fetch_google_doc(brief_id, docs_service=docs_service)
        raw_transcript_text = gw.fetch_transcript_tab_text(transcript_id, tab_name="Transcript", docs_service=docs_service)
        
        log.info(f"--- FETCHED BRIEF CONTENT IN-PROCESS (len: {len(raw_brief_text)}) ---")
        log.info(f"--- FETCHED TRANSCRIPT CONTENT IN-PROCESS (len: {len(raw_transcript_text)}) ---")
        
        # Run analysis
        proposals_data = run_adk_agent_analysis(raw_brief_text, raw_transcript_text)
        
        # Modify Doc directly
        log.info("Applying highlights and staging proposals in-process...")
        gw.clear_existing_proposals(docs_service, brief_id)
        
        for prop in proposals_data:
            proposal = {"label": prop.get("label", ""), "id": prop.get("id", "")}
            gw.apply_highlights_and_markers(docs_service, brief_id, [proposal])
            
        gw.write_proposal_tab(docs_service, brief_id, proposals_data)
        
        return proposals_data


if __name__ == "__main__":
    mock_brief_id = os.getenv("TEST_BRIEF_DOC_ID", "<YOUR_BRIEF_DOC_ID>")
    mock_trans_id = os.getenv("TEST_TRANSCRIPT_DOC_ID", "<YOUR_TRANSCRIPT_DOC_ID>")
        
    print(f"Running Mismatch Analyze Agent:\nBrief ID: {mock_brief_id}\nTranscript ID: {mock_trans_id}")
    results = analyze_transcript_and_brief(mock_brief_id, mock_trans_id)
    print("\nSUCCESS! Mismatches found and written to Briefing document tab 'Proposal':")
    print(json.dumps(results, indent=2))
