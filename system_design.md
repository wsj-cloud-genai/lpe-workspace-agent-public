
# Hackathon System Design Blueprint

This document outlines the architecture, flow control, and data boundaries of the Workspace Context Synthesizer integration, highlighting how it extends the existing LPE ecosystem.

---

## 1. Ecosystem Extension Map
The diagram below illustrates how this sprint's Track 1 additions (gold/yellow) sit upstream of and extend our existing BAU LPE compilation pipeline (gray).

```mermaid
graph TD
    classDef existing fill:#eeeeee,stroke:#9e9e9e,stroke-width:2px,color:#616161
    classDef extension fill:#fff9c4,stroke:#fbc02d,stroke-width:2px,color:#5d4037
    classDef database fill:#e0f2f1,stroke:#00796b,stroke-width:2px,color:#004d40

    %% Existing Ecosystem (BAU)
    subgraph BAU ["Existing BAU LPE Ecosystem"]
        RD[React Web Dashboard]:::existing
        API[Flask Backend API]:::existing
        LA[LPE Automation Engineer<br/>Gemini Code Gen]:::existing
        RUN[LPE Sandbox Runner<br/>Cloud Run Sandbox]:::existing
    end

    %% Database
    DB[(Cloud Firestore)]:::database

    %% New Extension Layer
    subgraph SPRINT ["Sprint Extensions (Track 1)"]
        GW[Google Workspace Add-ons<br/>Docs / Meets]:::extension
        TA[Workspace Context Synthesizer<br/>Google AI ADK & MCP]:::extension
        UI_GAP[Dashboard Gap Alert Banner]:::extension
    end

    %% Interactions
    GW -.->|Sends raw context| API
    API -->|Triggers context check| TA
    TA -->|Detects gaps & writes flags| DB
    DB -->|Real-time update| UI_GAP
    RD -->|User resolves gaps| API
    TA -->|Compiles creative brief| DB
    API -->|Triggers code gen| LA
    LA -->|Writes script| DB
    API -->|Dispatches compile| RUN
```

---

## 2. Commentary & Rationale

*   **Upstream Guardrail (Triage):** In the existing ecosystem, users would write prompts directly in the React Dashboard. If their prompts were incomplete or contradicted the brand guidelines, the LPE generator would produce broken code or mismatched components. This sprint introduces an **upstream guardrail** (the Workspace Context Synthesizer) to validate user and meeting inputs *before* code generation is triggered.
*   **Omni-channel Ingestion:** Instead of forcing agency coordinators to manually type campaign specifications, they can now trigger landing page builds directly from where they gather details (Google Docs and Google Meet transcripts) using Google API and MCP integrations.
*   **Human-in-the-loop (HITL) Refinement:** The extension establishes a real-time Firestore database listener. If the synthesis agent detects conflicting style instructions (e.g. Doc vs. transcript), it flags the contradiction and notifies the React Dashboard. This allows the human operator to resolve design gaps visually before calling the LPE code generator.

---

## 3. ADK + MCP Architecture (Core Hackathon Components)

This section details the two primary frameworks used in this hackathon submission: **Google Agent Development Kit (ADK)** for agent orchestration and **Model Context Protocol (MCP)** for secure, standardized tool access.

### MCP Server — Tool Layer

The MCP Server (`src/mcp/workspace_server.py`) is deployed to **Cloud Run** and exposes Google Workspace APIs as standardized MCP tools over **SSE (Server-Sent Events)** transport:

```mermaid
graph LR
    classDef mcp fill:#e8eaf6,stroke:#3f51b5,stroke-width:2px,color:#000
    classDef tool fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:#000
    classDef api fill:#fce4ec,stroke:#c62828,stroke-width:2px,color:#000
    classDef transport fill:#e0f7fa,stroke:#00838f,stroke-width:2px,color:#000

    subgraph "MCP Server (Cloud Run)"
        direction TB
        SSE["SSE Transport<br/>http://host:9000/sse"]:::transport
        
        subgraph "Exposed MCP Tools"
            T1["fetch_doc_content<br/>Read Google Doc body text"]:::tool
            T2["fetch_tab_content<br/>Read named Doc tab (e.g. Transcript)"]:::tool
            T3["mark_mismatch<br/>Highlight + tag mismatched fields"]:::tool
            T4["stage_proposals<br/>Write proposals to Proposal tab"]:::tool
            T5["clear_document_decorations<br/>Remove existing highlights/tags"]:::tool
            T6["list_files_in_folder<br/>List Drive folder contents"]:::tool
        end
    end

    subgraph "Google Workspace APIs"
        DOCS["Google Docs API v1"]:::api
        DRIVE["Google Drive API v3"]:::api
    end

    SSE --> T1 & T2 & T3 & T4 & T5 & T6
    T1 & T2 & T3 & T4 & T5 --> DOCS
    T6 --> DRIVE
```

### ADK Agent — Orchestration Layer

The **Mismatch Analyze Agent** (`src/agents/analyze_agent.py`) uses the Google ADK with **Gemini 2.5 Flash** and **Pydantic structured output** to cross-reference brief documents against meeting transcripts:

```mermaid
graph TD
    classDef adk fill:#fff8e1,stroke:#ffa000,stroke-width:3px,color:#000
    classDef mcp fill:#e8eaf6,stroke:#3f51b5,stroke-width:2px,color:#000
    classDef gemini fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#000
    classDef output fill:#fce4ec,stroke:#c62828,stroke-width:2px,color:#000

    subgraph "Google ADK Agent"
        direction TB
        AGENT["Mismatch Analyze Agent<br/>(google.adk.Agent)"]:::adk
        RUNNER["ADK Runner<br/>(google.adk.Runner)"]:::adk
        SESSION["InMemorySessionService"]:::adk
        SCHEMA["Pydantic Output Schema<br/>ProposalAnalysis"]:::adk
    end

    subgraph "MCP Client Connection"
        MCP_CLIENT["MCP ClientSession<br/>(SSE Transport)"]:::mcp
        FETCH_BRIEF["fetch_doc_content()"]:::mcp
        FETCH_TRANS["fetch_tab_content()"]:::mcp
        MARK["mark_mismatch()"]:::mcp
        STAGE["stage_proposals()"]:::mcp
    end

    LLM["Gemini 2.5 Flash<br/>Cross-Reference Analysis"]:::gemini

    OUTPUT["Structured Proposals<br/>PROP-1, PROP-2, ..."]:::output

    MCP_CLIENT --> FETCH_BRIEF & FETCH_TRANS
    FETCH_BRIEF -->|Brief text| AGENT
    FETCH_TRANS -->|Transcript text| AGENT
    AGENT --> RUNNER
    RUNNER --> LLM
    LLM --> SCHEMA
    SCHEMA --> OUTPUT
    OUTPUT --> MARK & STAGE
```

### ADK + MCP Integration Flow

```mermaid
sequenceDiagram
    autonumber
    participant ADDON as Google Workspace Add-on
    participant API as Flask Backend API
    participant MCP as MCP Server (Cloud Run)
    participant ADK as ADK Mismatch Agent
    participant GEMINI as Gemini 2.5 Flash
    participant DOCS as Google Docs API
    participant FS as Cloud Firestore

    ADDON->>API: POST /analyze (brief_id, transcript_id)
    API->>ADK: Trigger analyze_transcript_and_brief()
    ADK->>MCP: Connect via SSE (ClientSession)
    ADK->>MCP: call_tool("fetch_doc_content", brief_id)
    MCP->>DOCS: docs.documents.get()
    DOCS-->>MCP: Raw brief text
    MCP-->>ADK: Brief content
    ADK->>MCP: call_tool("fetch_tab_content", transcript_id)
    MCP->>DOCS: docs.documents.get(tab="Transcript")
    DOCS-->>MCP: Raw transcript text
    MCP-->>ADK: Transcript content

    rect rgb(255, 248, 225)
    Note over ADK, GEMINI: ADK Agent Execution
    ADK->>GEMINI: Prompt: Compare brief vs transcript
    GEMINI-->>ADK: ProposalAnalysis (structured JSON)
    end

    ADK->>MCP: call_tool("clear_document_decorations")
    ADK->>MCP: call_tool("mark_mismatch") × N proposals
    ADK->>MCP: call_tool("stage_proposals")
    MCP->>DOCS: batchUpdate (highlights + Proposal tab)
    ADK-->>API: Return proposals[]
    API->>FS: Write gap flags + proposals
```

---

## 4. Sequence Diagram (The Validation Loop)


```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant GW as Google Workspace Add-on
    participant RD as React Dashboard
    participant BO as Flask Backend API
    participant DB as Cloud Firestore
    participant TA as Workspace Context Synthesizer (ADK Agent)
    participant LA as LPE Automation Engineer (Gemini Agent)
    participant RUN as LPE Sandbox Runner (Cloud Run)

    U->>GW: Input Docs & Meet Transcripts
    GW->>BO: Send raw context via API
    BO->>DB: Store raw context
    BO->>TA: Trigger ADK Synthesis (MCP)
    
    rect rgb(255, 240, 240)
    Note over TA, RD: The "Wow Factor" Loop (Real-Time Gaps)
    TA->>TA: Cross-reference data
    alt Gap Detected
        TA-->>DB: Publish "Gap Detected" flag
        DB-->>RD: Real-time document listener updates UI
        RD-->>U: Display Alert on UI
        U->>RD: Input Clarification
        RD->>BO: Update State & DB
        BO->>TA: Re-trigger ADK evaluation
    end
    end
    
    TA->>DB: Write Enriched Creative Brief (JSON)
    BO->>LA: Trigger LPE Automation Agent
    LA->>LA: Generate LPE SDK Script
    LA->>DB: Persist SDK Script (raw_python_script)
    BO->>RUN: Dispatch Runner Job (Cloud Run)
    RUN->>RUN: Execute python compile script
    RUN->>DB: Save compiled JSON pagespec
    DB-->>RD: Real-time update renders landing page live
```

---

## 5. Architecture Block Diagram

```mermaid
graph TD
    %% Define Styles
    classDef frontend fill:#e1f5fe,stroke:#0288d1,stroke-width:2px,color:#000
    classDef backend fill:#eeeeee,stroke:#616161,stroke-width:2px,color:#000
    classDef newAgent fill:#fff8e1,stroke:#ffa000,stroke-width:2px,color:#000
    classDef oldAgent fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#000
    classDef db fill:#e0f2f1,stroke:#00796b,stroke-width:2px,color:#000
    classDef runner fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#000

    %% Frontend Layer
    subgraph "Omni-Channel Entry Layer"
        GW[Google Workspace Add-ons<br/>Docs / Meets]:::frontend
        RD[React Web Dashboard<br/>Command Center]:::frontend
    end

    %% Backend Layer
    subgraph "Orchestration & State"
        API[Flask Backend API<br/>Python / api/routes/adl.py]:::backend
        DB[(Cloud Firestore)]:::db
    end

    %% AI & Execution Layer
    subgraph "AI & Execution Stack"
        TA[Workspace Context Synthesizer<br/>Google AI ADK & MCP]:::newAgent
        LA[LPE Automation Engineer<br/>Gemini Code Gen Agent]:::oldAgent
        RUN[LPE Sandbox Runner<br/>Cloud Run Sandbox]:::runner
    end

    %% Relationships
    GW -- Authenticates & Sends Context --> API
    RD -- Manages State & Fixes Gaps --> API
    API -- Reads/Writes --> DB
    
    API -- Triggers Analysis --> TA
    TA -. Publishes Gap Flags .-> DB
    DB -. Real-time Listeners .-> RD
    
    TA -- Writes Enriched Brief --> DB
    API -- Triggers Generation --> LA
    LA -- Writes python_script --> DB
    API -- Dispatches execution --> RUN
    RUN -- Writes pagespec JSON --> DB
    DB -. Real-time updates .-> RD
```

---

## 6. Ingestion vs. Execution: The Role of Cloud Run & GHA Runners

One common point of confusion is whether the new **Google Agent Development Kit (ADK)** eliminates the need for **Cloud Run** and **GitHub Actions Runners**. 

**They are both absolutely required**, because they operate at completely different layers of the platform:

| Dimension | Upstream Layer (Sprint Extensions) | Downstream Layer (Existing BAU Platform) |
|---|---|---|
| **Responsible Component** | **Workspace Context Synthesizer (ADK Agent)** | **LPE Sandbox Runner (Cloud Run / GHA)** |
| **Primary Framework** | Google Agent SDK / ADK | Python Executor & `lpe_sdk.py` |
| **Role & Purpose** | Context Ingestion, Anomaly Triage, and Structured Brief Synthesis. | Sandboxed Python Code Execution, Layout Rendering, and Asset Commits. |
| **Output Type** | Structured Creative Brief (JSON payload in Firestore). | Compiled Layout Pagespec (JSON layout tree saved to Firestore). |
| **Why it's needed** | Prevents garbage-in-garbage-out. Translates loose client language into a validated parameters structure. | Runs arbitrary Python script generation safely without exposing core LPE IP or risking host OS compromise. |

### Technical Synergy:
1. The **ADK Agent** resides in the Workspace/Onboarding environment. It runs on Gemini to read files, compare them, resolve style conflicts, and write a validated *Brief* to Firestore.
2. The Flask API takes this Brief and hands it to the **LPE Automation Engineer** to generate a Python script.
3. The Flask API then dispatches this script to the **Cloud Run Sandbox / GitHub Runner**.
4. The **Runner** executes the script, producing the actual rendered CSS/HTML layout structure (pagespec) and updating the Showcase in real-time.

---

## 7. Calendar-Based Deterministic Meeting-to-Client Mapping

To avoid flaky heuristic matching (such as matching domain names from generic emails like `@gmail.com`), we enforce **explicit operator control** when mapping meetings to clients.

### Flow Architecture

1. **Meeting Creation (Google Calendar Add-on)**:
   * The operator schedules a meeting or opens an existing event inside the **Google Calendar sidebar**.
   * The Calendar Add-on queries the `LPE Client Registry` (Google Sheet or Firestore) and presents a **Client Selection Dropdown** in the sidebar.
   * The operator selects the specific client (e.g. `"Acme Corp"`) and clicks **Link Meeting**.
   * Under the hood, the Add-on extracts the Google Meet conference code (e.g. `meet.google.com/zpq-mst-abc`) and writes a deterministic mapping record to the `Meetings` registry:
     ```json
     {
       "meet_id": "zpq-mst-abc",
       "client_id": "acme-corp"
     }
     ```

2. **Automated Transcript Processing (Post-Meeting)**:
   * When the meeting ends, Google Drive saves the transcript document (containing the Meet ID `zpq-mst-abc` in its metadata).
   * The background router queries the database for the Meet ID `zpq-mst-abc`.
   * The database returns `client_id: acme-corp` based on the operator's prior explicit association.
   * The router moves the transcript document straight to `LPE Client Onboarding / Acme Corp / Transcripts /` with 100% routing precision.