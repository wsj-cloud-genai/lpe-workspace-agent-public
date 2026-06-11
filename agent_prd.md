# Agent Product Requirements Document (PRD)
## Agent Name: Workspace Context Synthesizer (ADK Agent)

---

## 1. Problem Statement
Creative agencies, developers, and marketing teams spend hours manually extracting brand attributes, typography, color tokens, and asset URLs from scattered client sources (Google Docs briefings, rough meeting transcripts, design sheets). 

When these unstructured inputs are fed directly to landing page builders or generative code engines (like our LPE Automation Engineer), they suffer from:
*   **Hallucinations:** Hallucinating components or parameters that do not exist.
*   **Mismatched Aesthetics:** Generating designs that contradict the actual client brand guidelines.
*   **Logical Gaps:** Missing critical context (e.g., CTA targets) that breaks user flows.

We need an upstream autonomous agent that operates in the Google Workspace environment to synthesize these raw materials into a validated, high-fidelity Campaign Brief before any code generation is attempted.

---

## 2. Core Directives & Persona
The agent acts as an **Elite Anomaly-Detecting Agency Coordinator**. 
*   **Tone:** Analytical, precise, detail-oriented, and objective.
*   **Primary Directive:** Ingest unstructured docs and transcripts, identify contradictions or missing design tokens, and build a unified, schema-validated JSON Creative Brief.

---

## 3. Goals & Anti-Goals

### Goals
*   **Autonomous Ingestion:** Connect to specified Google Docs and Google Meet transcripts via the Google ADK and MCP layer.
*   **Conflict & Anomaly Identification:** Programmatically flag contradictions. E.g., if a Google Doc states "Theme: Light & Airy", but a transcribed client conversation says "I want a dark, high-contrast premium theme", the agent must identify this gap.
*   **Self-Correction/User Review Loop:** Publish "Gap Detected" states to the Firestore DB to alert the user on the dashboard, allowing them to clarify contradictions before pipeline execution.
*   **Enriched Payload Handoff:** Compile and schema-validate a structured creative brief JSON payload that maps directly to valid LPE primitives.

### Anti-Goals
*   **No Direct Client Communication:** The agent must **never** email, ping, or chat with the client directly to resolve gaps. Gaps must always be routed through the Agency's React Dashboard for human operator verification.
*   **No Code Compilation:** The agent must **never** attempt to write Python compilation scripts or directly call the `lpe_sdk.py` library. It delegates code generation to the LPE Automation Engineer.
*   **No Autonomous Landing Page Deployment:** The agent cannot trigger a landing page build if there are unresolved "Gap Detected" flags.

---

## 4. User Journey & MVP Target
*   **Phase 1 (MVP):** A marketing manager links a Google Doc containing copy guidelines and uploads a text-based Google Meet transcript. The agent parses both, flags a color palette mismatch, prompts the manager on the dashboard to select the primary color, compiles the creative brief, and passes it to the LPE code generation script.
*   **Phase 2 (Future):** Native Google Workspace add-on package allowing one-click dispatch from within Google Docs.
