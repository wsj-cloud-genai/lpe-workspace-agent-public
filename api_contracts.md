# Decoupled Campaign Intent Schema & API Contracts
## Agent Name: Workspace Context Synthesizer (ADK Agent)

This document specifies the decoupled JSON data contract exchanged between the **Workspace Context Synthesizer (ADK Agent)** and the **LPE Automation Engineer**.

---

## 1. Architectural Decoupling: Client Intent vs. Layout Compilation

To avoid tight coupling between the upstream Google Workspace agent and the downstream frontend rendering capabilities, we enforce a strict separation of concerns:

```text
┌─────────────────────────────────┐
│     ADK Agent (Upstream)        │  <── Focus: Extracting Client Reality
│   "What does the client want?"  │      - Ingests raw Doc copy and Meet conversation
│                                 │      - Highlights color & style contradictions
└────────────────┬────────────────┘
                 │
                 ▼ (WorkspaceCampaignIntent JSON - Unconstrained & Brand-Agnostic)
┌─────────────────────────────────┐
│ LPE Preprocessor (Downstream)   │  <── Focus: Mapping Reality to Layout Rules
│   "How do I render this?"       │      - Truncates long feature lists to fit design
│                                 │      - Maps descriptive fonts to supported enums
└────────────────┬────────────────┘
                 │
                 ▼ (Technical SDK Primitives - MD3 colors, Montserrat/Inter, Max 4 reviews)
┌─────────────────────────────────┐
│     React Frontend / Showcase   │  <── Focus: Visual Presentation
└─────────────────────────────────┘
```

### Expected Agent Input & Output Flow
*   **Raw Inputs (Natural Language Ingestion)**: Unstructured text data fetched via Google Docs and Google Drive transcripts (fetched in code using the helper methods inside [src/google_workspace.py](src/google_workspace.py)).
    *   *Google Doc*: Campaign brief, slogan, color hex codes, font preferences, copywriting lists.
    *   *Google Meet Transcript*: Verbally recorded client pivots, theme preferences, layout request statements.
*   **Agent Output (WorkspaceCampaignIntent JSON)**: A single structured JSON object representing the client's campaign intent (Scenario B) OR a list of anomalies/conflicts requiring operator intervention (Scenario A). This ingestion, translation, and validation logic is implemented in [src/adk_agent.py](src/adk_agent.py) and evaluated in [src/test_adk.py](src/test_adk.py).

### Rationale: Why represent Intent in JSON instead of Raw Text?
Although LPE is a natural-language-driven compiler, we enforce this intermediate structured representation because:
1.  **Operator Dashboard UI**: The React Governance Dashboard requires structured parameters (e.g. `brand.primary_color`, `hero.headline`) to populate editable text fields and color pickers. This allows operators to perform manual overrides before generating layouts.
2.  **Semantic Anomaly Detection**: Comparing written guidelines and verbal transcripts is significantly more reliable when the agent maps them to key-value parameters to run focused contradiction checks.
3.  **Media Asset Resolution**: Dedicated GCS video/image URLs must be preserved. Passing them inside a structured `media_assets` array guarantees they are correctly processed downstream instead of getting lost in natural language.
4.  **Token Containment**: Feeding a concise structured intent to the code generator instead of 20 pages of raw transcript text prevents model distractions and lowers generation cost.

---

## 2. Campaign Intent Payload Structure (`WorkspaceCampaignIntent`)

On successful validation (Scenario B), the ADK Agent (implemented in [src/adk_agent.py](src/adk_agent.py)) compiles the raw client intent into a structured, unconstrained JSON payload. This output format is tested and validated using [src/test_adk.py](src/test_adk.py).

### Good Example (Valid Campaign Intent Payload - Scenario B)
This payload is unconstrained (e.g., custom theme mode, color descriptions, more features than the visual layout limit) but contains all essential properties needed by the dashboard:

```json
{
  "status": "VALIDATED",
  "brief": {
    "company_name": "BoltDelivery",
    "brand": {
      "theme_mode": "Modern glassmorphism with sleek dark gradients",
      "primary_color": "indigo",
      "secondary_color": "#10B981",
      "font_family": "Outfit Sans"
    },
    "hero": {
      "headline": "Deliveries in minutes, not hours.",
      "subheadline": "The fastest local courier service for retail stores.",
      "cta_label": "Book Courier",
      "cta_href": "https://boltdelivery.com/book",
      "image_url": "https://firebasestorage.googleapis.com/v0/b/.../media_logo.png"
    },
    "features": [
      { "title": "Real-time Tracking", "desc": "Track your driver with live GPS map coordinates." },
      { "title": "Flat Rate Pricing", "desc": "No surge prices, no hidden fees." },
      { "title": "Instant Insurance", "desc": "Every package is insured up to $10,000 automatically." },
      { "title": "Eco-Friendly Fleets", "desc": "Deliveries made via 100% electric cargo bikes." }
    ],
    "reviews": [
      { "name": "Alice", "business": "Acme Corp", "text": "Incredible speed, daily use.", "rating": 5, "source": "custom" },
      { "name": "Bob", "business": "Vertex Ltd", "text": "Highly recommend.", "rating": 5, "source": "google" }
    ],
    "media_assets": [
      "https://firebasestorage.googleapis.com/v0/b/.../video_bg.mp4"
    ],
    "metadata": {
      "onboarding_doc_id": "google_doc_123",
      "meet_transcript_id": "google_drive_456",
      "context_enriched_at": "2026-05-28T17:00:00Z",
      "gaps_resolved": true
    }
  }
}
```

### Bad Example (Anomalous Intent Payload - Triggers Scenario A)
If any of these omissions or violations occur, the ADK Agent **must not** produce a `VALIDATED` status. It must instead output **Scenario A (GAP_DETECTED)** listing the anomalies, forcing the operator to resolve them in the dashboard. 

This example illustrates what is flagged as anomalous (omitting critical fields, or attempting to specify layout-coupled React component code):

```json
{
  "status": "GAP_DETECTED",
  "anomalies": [
    {
      "parameter": "company_name",
      "doc_value": "missing",
      "transcript_value": "missing",
      "justification": "The client company name is completely missing from both the Google Doc and the transcript."
    },
    {
      "parameter": "brand.font_family",
      "doc_value": "missing",
      "transcript_value": "missing",
      "justification": "No typography font family preferences were specified in the brand guidelines."
    },
    {
      "parameter": "hero.subheadline",
      "doc_value": "missing",
      "transcript_value": "missing",
      "justification": "The hero section requires a subheadline copy, but none was provided."
    },
    {
      "parameter": "features",
      "doc_value": "coupled_props_error",
      "transcript_value": "coupled_props_error",
      "justification": "The features array attempted to pass layout-coupled React components ('type' and 'props') instead of raw client business benefits ('title' and 'desc')."
    }
  ]
}
```

---

## 3. Downstream LPE Translation & Prompt Synthesis

In the code, there is no python preprocessing script doing color conversions or truncating arrays. Instead, the backend endpoint in `api/routes/adl.py` calls `synthesize_prompt_from_brief(brief)` defined in `api/services/prompt_service.py`, which simply interpolates the JSON fields into a plain text prompt string (e.g. *"Brand primary accent color is gold"*). This string is then passed directly to Gemini inside `scripts/ai/generate_ai_fulfillment.py`.

**The LLM does the mapping**: The Gemini model itself reads the prompt and uses its own intelligence to write the Python SDK calls (like selecting testimonials, choosing a Hex code, or appending interactive widgets). 

### Visual Compilation Use Cases (How Natural Language Maps to Tools)

Below are three expected end-to-end execution paths showing how natural language requests are parsed into standard `WorkspaceCampaignIntent` properties and then mapped by the LLM into interactive SDK layout primitives:

#### Use Case 1: The Interactive SaaS ROI Calculator
*   **Natural Language Ingestion** (Fetched by [src/google_workspace.py](src/google_workspace.py) and ingested by [src/adk_agent.py](src/adk_agent.py)): *"We want a dark-themed page. The hero should tell stores they can deliver Courier packages in minutes. Also, we want an interactive savings calculator tool where clients can simulate their courier delivery savings."*
*   **WorkspaceCampaignIntent JSON (ADK Output)** (Parsed/Synthesized by [src/adk_agent.py](src/adk_agent.py) and verified by [src/test_adk.py](src/test_adk.py)):
    *   *The ADK Agent extracts the copy into the standard `hero` object and maps the calculator request as a campaign feature benefit:*
    ```json
    {
      "status": "VALIDATED",
      "brief": {
        "company_name": "BoltDelivery",
        "brand": {
          "theme_mode": "dark",
          "primary_color": "#4F46E5",
          "font_family": "Outfit"
        },
        "hero": {
          "headline": "Deliveries in minutes, not hours.",
          "subheadline": "The fastest local courier service for retail stores.",
          "cta_label": "Calculate Savings",
          "cta_href": "#roi"
        },
        "features": [
          { "title": "Interactive ROI", "desc": "Calculate your business delivery savings instantly on our live calculator." }
        ],
        "metadata": {
          "context_enriched_at": "2026-05-28T17:00:00Z",
          "gaps_resolved": true
        }
      }
    }
    ```
*   **Expected Gemini Output (Synthesized SDK Code)**:
    *   *Gemini reads the "Interactive ROI" feature benefit and decides to compile it into the specialized `saas-roi-calculator` widget instead of a standard text block:*
    ```python
    page.sections.append({
        "id": "roi",
        "type": "saas-roi-calculator",
        "className": "bg-slate-950 text-white p-8 rounded-2xl border border-white/10"
    })
    ```

#### Use Case 2: Onboarding Kickoff Calendar & Booking Form
*   **Natural Language Ingestion** (Fetched by [src/google_workspace.py](src/google_workspace.py) and ingested by [src/adk_agent.py](src/adk_agent.py)): *"Helix Ventures needs an onboarding booking form on our landing page where companies can submit their email, select their target integrations, and schedule a sandbox kickoff meeting."*
*   **WorkspaceCampaignIntent JSON (ADK Output)** (Parsed/Synthesized by [src/adk_agent.py](src/adk_agent.py) and verified by [src/test_adk.py](src/test_adk.py)):
    *   *The ADK Agent sets the primary CTA target to `#booking` and maps the custom form request as a feature:*
    ```json
    {
      "status": "VALIDATED",
      "brief": {
        "company_name": "Helix Ventures",
        "brand": {
          "theme_mode": "glassmorphism",
          "primary_color": "#3B82F6",
          "font_family": "Inter"
        },
        "hero": {
          "headline": "Onboard in seconds",
          "subheadline": "Initialize your agentic developer sandbox.",
          "cta_label": "Request Sandbox",
          "cta_href": "#booking"
        },
        "features": [
          { "title": "Sandbox Request Form", "desc": "Submit email, select target integrations, and book your sandbox loop kickoff." }
        ],
        "metadata": {
          "context_enriched_at": "2026-05-28T17:00:00Z",
          "gaps_resolved": true
        }
      }
    }
    ```
*   **Expected Gemini Output (Synthesized SDK Code)**:
    *   *Gemini maps the "Sandbox Request Form" feature and `#booking` anchor link to a container form containing target integration choices:*
    ```python
    page.sections.append({
        "id": "booking",
        "type": "form",
        "className": "space-y-6 bg-white/5 border border-white/10 p-8 rounded-2xl",
        "action": "/api/submit",
        "method": "POST",
        "children": [
            {"type": "input", "inputType": "email", "name": "email", "placeholder": "you@company.com"},
            {"type": "select", "name": "integration", "options": [
                {"value": "gworkspace", "label": "Google Workspace"},
                {"value": "slack", "label": "Slack"}
            ]},
            {"type": "input", "inputType": "submit", "name": "submit", "value": "Initialize Sandbox Loop"}
        ]
    })
    ```

#### Use Case 3: Real-Time Execution Telemetry Grid
*   **Natural Language Ingestion** (Fetched by [src/google_workspace.py](src/google_workspace.py) and ingested by [src/adk_agent.py](src/adk_agent.py)): *"We want the page to show our active crawler and agent statuses. Let's make it look like a live control room with a grid showing job IDs, status badges like complete or executing, and duration."*
*   **WorkspaceCampaignIntent JSON (ADK Output)** (Parsed/Synthesized by [src/adk_agent.py](src/adk_agent.py) and verified by [src/test_adk.py](src/test_adk.py)):
    *   *The ADK Agent maps the telemetry grid request as a feature:*
    ```json
    {
      "status": "VALIDATED",
      "brief": {
        "company_name": "AURA.AI",
        "brand": {
          "theme_mode": "dark",
          "primary_color": "#3B82F6",
          "font_family": "Montserrat"
        },
        "features": [
          { "title": "Live Status Grid", "desc": "Telemetry grid showing active crawler job IDs, status badges, and duration." }
        ],
        "metadata": {
          "context_enriched_at": "2026-05-28T17:00:00Z",
          "gaps_resolved": true
        }
      }
    }
    ```
*   **Expected Gemini Output (Synthesized SDK Code)**:
    *   *Gemini maps the "Live Status Grid" feature directly to the interactive data grid component, injecting columns and mock data:*
    ```python
    page.sections.append({
        "type": "interactive-data-grid",
        "title": "Active Agent Logs",
        "columns": [
            {"key": "jobId", "label": "Job ID", "sortable": True},
            {"key": "status", "label": "Status", "sortable": True}
        ],
        "data": [
            {"id": "JOB-1", "jobId": "JOB-1", "status": "complete"},
            {"id": "JOB-2", "jobId": "JOB-2", "status": "executing"}
        ]
    })
    ```

#### Use Case 4: Component Visual Assets Binding
*   **Natural Language Ingestion** (Fetched by [src/google_workspace.py](src/google_workspace.py) and ingested by [src/adk_agent.py](src/adk_agent.py)): *"The page should show the walkthrough demo video uploaded to our drive folder."*
*   **WorkspaceCampaignIntent JSON (ADK Output)** (Parsed/Synthesized by [src/adk_agent.py](src/adk_agent.py) and verified by [src/test_adk.py](src/test_adk.py)):
    *   *The ADK Agent maps the uploaded Drive video into the media assets array:*
    ```json
    {
      "status": "VALIDATED",
      "brief": {
        "company_name": "Helix Ventures",
        "brand": {
          "theme_mode": "dark",
          "primary_color": "#3B82F6",
          "font_family": "Inter"
        },
        "metadata": {
          "context_enriched_at": "2026-05-28T17:00:00Z",
          "gaps_resolved": true
        }
      },
      "media_assets": [
        "https://firebasestorage.googleapis.com/v0/b/.../walkthrough_bg.mp4"
      ]
    }
    ```
*   **Expected Gemini Output (Synthesized SDK Code)**:
    *   *Gemini binds the GCS walkthrough `.mp4` CDN link directly to the video background component:*
    ```python
    page.add_hero_video_bg(
        headline="Deliveries in minutes",
        subheadline="...",
        video_src="https://firebasestorage.googleapis.com/v0/b/.../walkthrough_bg.mp4"
    )
    ```

---

## 4. REST API Handoff Contract & Integration Triggers

In the production layout generation pipeline, there is no standalone Python script dispatching HTTP calls. Instead, the handoff between Google Workspace (client-side) and the LPE page builder is handled through two client workflows that hit our Flask backend routes in `api/routes/adl.py`:

### 🔑 Authentication & API Credentials
All backend API endpoints require authentication via the `X-Api-Key` HTTP header. For detailed instructions on provisioning API keys, configuring Google Cloud service account JSON keys, and setting up local `.env` environment variables, please refer to the setup documents:
*   **In the Workspace Agent Standalone Repository**: Refer to [local_agent_setup.md](./local_agent_setup.md).
*   **In the LPE Monorepo**: Refer to [developer_onboarding_guide.md](./developer_onboarding_guide.md).

---

### Flow A: Automated Workspace Add-on Trigger
This flow runs automatically when an operator schedules or initiates compilation from the Google Doc.

*   **Trigger Event**: Operator clicks **Build Page** inside the Google Docs sidebar panel.
*   **Initiator File**: [google-addon/Onboarding.gs](google-addon/Onboarding.gs) (specifically the Apps Script function `onboardAndCompileActiveDoc(overrideClientId)`).
*   **Execution Sequence**:
    1.  **Ingestion & ADK Scan**: The Add-on posts to the `/api/adl/onboard` endpoint:
        *   **Endpoint**: `POST /api/adl/onboard`
        *   **Payload**: `{ "docId": "<Doc_ID>", "clientId": "<Client_ID>" }`
        *   **Action**: Handled by `onboard_workspace()` in `api/routes/adl.py`. It downloads Doc content, fetches transcripts via [src/google_workspace.py](src/google_workspace.py), runs conflict checking via [src/adk_agent.py](src/adk_agent.py), and stores the result in Firestore.
    2.  **Immediate Compilation (If Valid)**: If the scan returns `status: "validated"` (no gaps detected), the Add-on immediately fires a POST request to compile the page layout:
        *   **Endpoint**: `POST /api/adl/requests/<request_id>/generate`
        *   **Action**: Handled by `generate_page()` in `api/routes/adl.py`. It synthesizes the prompt and runs the script compiler in-process.

---

### Flow B: Operator Governance Dashboard Reconcile Flow
This flow runs if the ADK scan flags contradictions, requiring manual reconciliation.

*   **Trigger Event**: Operator clicks **Compile Landing Page** inside the Governance Console.
*   **Initiator File**: `src/components/dashboard/AdlGovernance.tsx` (specifically the frontend event handler `handleCompilePage()`).
*   **Execution Sequence**:
    1.  **Resolve Gaps**: The dashboard posts resolved settings and brand overrides:
        *   **Endpoint**: `POST /api/adl/requests/<request_id>/resolve-gaps`
        *   **Payload**: `{ "enriched_brief": { ... }, "resolved_gaps": { ... } }`
    2.  **Generate Page**: The dashboard triggers layout generation:
        *   **Endpoint**: `POST /api/adl/requests/<request_id>/generate`
        *   **Action**: Handled by `generate_page()` in `api/routes/adl.py`. It calls the preprocessor, creates a prompt, and executes `generate_ai_fulfillment.py` to compile the final pagespec draft.
