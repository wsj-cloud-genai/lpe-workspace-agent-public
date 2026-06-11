# Hackathon Onboarding: Google Slides Presentation Blueprint
### Presentation Title: Upstream Context Synthesis Integration
### Audience: Founding Engineer (9-Day Dev Sprint)

This document contains the slide outline, speaker notes, and **Gemini in Slides Prompts** to generate the presentation deck automatically.

---

## Slide 1: Title & Sprint Objective
*   **Slide Type:** Title Slide
*   **Layout Description:** Clean, professional tech style with a dark blue background and sharp contrasting gold accents. Large header text.
*   **Slide Content:**
    *   *Title:* AI Discovery Layer (ADL) Upstream Integration
    *   *Subtitle:* Extending LPE with the Google Agent SDK (ADK) in a 9-Day Sprint
*   **Speaker Notes:**
    "Welcome to the kickoff for our Google AI Agents Hackathon project. Our main objective over the next 9 days is to build the Workspace Context Synthesizer, an upstream agent utilizing Google's new Agent Development Kit. This presentation outlines the architecture, data flow, and how this new agent extends our existing Landing Page Engine."
*   **Gemini Slides Prompt:**
    ```text
    Create a title slide for a technical presentation about AI agent architecture. The title should be "AI Discovery Layer (ADL) Upstream Integration" and the subtitle should be "Extending LPE with the Google Agent SDK (ADK) in a 9-Day Sprint". Use a sleek dark blue theme with premium gold/yellow accents and clean typography.
    ```

---

## Slide 2: The Core Problem: Garbage-In, Garbage-Out
*   **Slide Type:** 2-Column Split
*   **Layout Description:** Split screen. Left column highlights "The Legacy Input Problem", right column shows "The Downstream Impact".
*   **Slide Content:**
    *   *Left Column:*
        *   Loose, unvalidated client prompts entered directly into the dashboard.
        *   Contradictions between source documents (e.g. Google Docs) and verbal meeting transcripts (e.g. Meets).
    *   *Right Column:*
        *   LLM compiling incorrect page layout code.
        *   Frequent pipeline execution crashes due to color, font, or component parameters failing downstream schema validation.
*   **Speaker Notes:**
    "Right now, our Landing Page Engine is a powerhouse, but it suffers from a garbage-in, garbage-out problem. When users enter loose, unvalidated prompts or provide conflicting parameters from Docs and meetings, the downstream LPE generator attempts to compile them, leading to visual errors or crash states."
*   **Gemini Slides Prompt:**
    ```text
    Create a 2-column slide explaining a software engineering problem. Title: "The Core Problem: Garbage-In, Garbage-Out". Left column title: "The Legacy Input Problem" with bullet points about loose client prompts and meeting transcript contradictions. Right column title: "The Downstream Impact" with bullet points about LLM compiling incorrect code and execution crashes. Use a clean white background with red warnings indicators.
    ```

---

## Slide 3: The Solution: Upstream Ingestion & Synthesizer
*   **Slide Type:** Focus Highlight
*   **Layout Description:** A central highlight box with 3 key benefit cards.
*   **Slide Content:**
    *   *Title:* Upstream Agent Triage (Workspace Context Synthesizer)
    *   *Core Pillars:*
        *   **Context Ingestion:** Reads client source files directly from Google Docs and Meet transcripts using Google APIs.
        *   **Conflict Resolution:** Cross-references style instructions and flags anomalies *before* code generation begins.
        *   **Structured Output:** Generates a unified, schema-validated Creative Brief JSON payload.
*   **Speaker Notes:**
    "Our solution is the Workspace Context Synthesizer. This is the ADK Agent we are building for Track 1. It operates upstream as an automated triage layer. It pulls details directly from Google Workspace, checks for anomalies, and outputs a clean, structured Creative Brief JSON payload."
*   **Gemini Slides Prompt:**
    ```text
    Create a slide about a software architecture solution. Title: "The Solution: Upstream Ingestion & Synthesizer". Show three key pillars: Context Ingestion, Conflict Resolution, and Structured Output. Make the layout look like modern modular card blocks with a light gray background and corporate blue borders.
    ```

---

## Slide 4: Decoupled Integration via Firestore
*   **Slide Type:** Flowchart / Process Diagram
*   **Layout Description:** Horizontal 3-step process block diagram showing data handoff.
*   **Slide Content:**
    *   *Title:* Asynchronous State Handoff
    *   *Step 1 (ADK Agent):* Validates Google Docs and Meet text inputs ➔ Writes Creative Brief JSON to Firestore ➔ Sets status to `validated`.
    *   *Step 2 (Flask Backend):* Listens to Firestore ➔ Translates JSON brief to a rich prompt string ➔ Launches `generate_ai_fulfillment.py`.
    *   *Step 3 (Sandbox Runner):* Executes the Python SDK script ➔ Saves compiled layout pagespec to Firestore ➔ Updates React Showcase UI live.
*   **Speaker Notes:**
    "A key architectural detail is that our new agent does NOT speak directly to the legacy code generator. They are entirely decoupled via Firestore. The ADK Agent writes a Creative Brief to the DB, the Flask API picks it up, translates it into a prompt string, and fires the executor runner."
*   **Gemini Slides Prompt:**
    ```text
    Create a process slide representing a 3-step pipeline. Title: "Decoupled Integration via Firestore". Step 1 is "ADK Agent" writing to Firestore. Step 2 is "Flask Backend" triggering the generator script. Step 3 is "Sandbox Runner" compiling the visual layout pagespec. Use horizontal flow arrows connecting three gray cards with blue text.
    ```

---

## Slide 5: The "Wow Factor" Loop (Real-Time Gaps)
*   **Slide Type:** 2-Column Focus
*   **Layout Description:** Left side outlines the loop logic, right side shows a mockup/wireframe placeholder of the React dashboard alert.
*   **Slide Content:**
    *   *Left Side (The Loop):*
        *   ADK Agent detects styling or brand contradictions (e.g. Doc states Red theme, Transcript states Blue theme).
        *   Agent flags the anomaly and writes a `gap_detected` status to Firestore.
        *   The React Dashboard intercepts this state in real-time, displays a resolution banner to the agency coordinator, and halts compilation until resolved.
*   **Speaker Notes:**
    "The 'Wow Factor' for the hackathon judges is this real-time reflection loop. When the ADK agent flags a styling anomaly, it immediately pauses the compile process and displays a banner on the React Dashboard. The human agency operator can resolve it on the UI in seconds, which automatically re-triggers the compilation pipeline."
*   **Gemini Slides Prompt:**
    ```text
    Create a slide explaining a real-time validation loop. Title: "The 'Wow Factor' Loop (Real-Time Gaps)". Split layout. The left column details how the agent detects contradictions and flags them in Firestore, halting compilation. The right column should feature a clean visual outline representing a dashboard UI warning alert. Use yellow warning colors and clean card containers.
    ```

---

## Slide 6: Ingestion vs. Execution (Why we still need Cloud Run)
*   **Slide Type:** Comparison Table
*   **Layout Description:** Clean comparison matrix comparing the ADK Agent role with the Cloud Run Sandbox.
*   **Slide Content:**
    *   *Title:* Upstream Synthesis vs. Downstream Execution
    *   *Table Columns:* Component, Framework, Role, Output.
    *   *Row 1 (ADK Agent):* Upstream / Google Agent SDK / Context & Anomaly Triage / Creative Brief JSON.
    *   *Row 2 (Sandbox Runner):* Downstream / Python Executor / Executing script & Rendering layout / Compiled Pagespec JSON.
*   **Speaker Notes:**
    "To clarify the division of labor: Google's ADK handles context ingestion, anomaly checking, and data synthesis. The existing Cloud Run Sandbox is still responsible for running the generated Python scripts and rendering the HTML/CSS layouts. One is the cognitive brain; the other is the execution environment."
*   **Gemini Slides Prompt:**
    ```text
    Create a comparison slide comparing two server roles. Title: "Ingestion vs. Execution". Create a table comparing "Workspace Context Synthesizer (ADK Agent)" and "LPE Sandbox Runner (Cloud Run)". Show fields for: Layer, Framework, Primary Role, and Output Type. Use a minimalist, light gray grid theme with clean headers.
    ```

---

## Slide 7: Targets & Data Contract Schemas
*   **Slide Type:** Code / Technical Layout
*   **Layout Description:** Left side shows the Firestore Request Schema, right side shows the Enriched Brief Schema.
*   **Slide Content:**
    *   *Title:* Standardized Developer API Interfaces
    *   *Firestore request document structure (`adl_requests`):* Contains status tracking (`pending`, `gap_detected`, `validated`), Google document paths, and gap descriptions.
    *   *Creative Brief schema:* Enforces JSON types for company name, brand configuration (primary color, theme, font), hero, features, and reviews arrays.
*   **Speaker Notes:**
    "Here are the exact data schemas your code needs to read and write. The adl_requests collection manages the pipeline status. The Creative Brief schema is a strict JSON contract that defines the brand parameters our preprocessor will map into the LPE compile script."
*   **Gemini Slides Prompt:**
    ```text
    Create a technical slide about API schemas. Title: "Targets & Data Contract Schemas". Use a split-column design. Left column: "Request State Schema" representing database properties like status and metadata. Right column: "Creative Brief Schema" listing brand, hero, and features parameters. Use monospaced font styles for key names and schema tags.
    ```

## Slide 8: The 9-Day Sprint: Building Iterative Slices (MVP-First)
*   **Slide Type:** Split Comparison / Progress Flow
*   **Layout Description:** Two horizontal paths: the top path labeled "NOT LIKE THIS (Component Silos)" showing isolated stages that only work at the very end; the bottom path labeled "LIKE THIS! (Iterative Value Slices)" showing a testable end-to-end MVP at every stage (skateboard to race car).
*   **Slide Content:**
    *   *Title:* Sprint Roadmap: Iterative Value Slices (Kniberg MVP Style)
    *   *Not Like This (Siloed Approach):*
        *   Phase 1: Isolated APIs ➔ Phase 2: Isolated Agent Prompts ➔ Phase 3: Isolated UI Elements ➔ Day 9: Big Bang Integration (High Crash Risk)
    *   *Like This (Iterative Value Slices):*
        *   **Slice 1 (Day 1-2: Skateboard):** End-to-End hardcoded mock data. Ingest static text ➔ generate simple prompt ➔ trigger compiler ➔ render page. (Entire pipeline is working on Day 2).
        *   **Slice 2 (Day 3-4: Scooter):** Swap hardcoded inputs with real Google Docs API ingestion.
        *   **Slice 3 (Day 5-6: Bicycle):** Add Google Meet transcripts and ADK Agent contradiction checks.
        *   **Slice 4 (Day 7-8: Motorcycle):** Add dashboard Gap Resolution Alerts UI and backend preprocessor.
        *   **Slice 5 (Day 9: Race Car):** Final polish, schema validation, and Golden Dataset hardening.
*   **Speaker Notes:**
    "Instead of building components in isolation and praying they work together on Day 9, we are adopting Henrik Kniberg's MVP slicing methodology. By Day 2, we will have a 'skateboard'—a crude but fully functional end-to-end pipeline with mocked data. From there, we iteratively swap mocks for real OAuth ingestion, add Meet transcripts, build the UI gap alerts, and finally polish the system. This ensures we have a working, testable product every single day."
*   **Gemini Slides Prompt:**
    ```text
    Create a progress roadmap slide with two horizontal flow paths. Title: "Sprint Roadmap: Iterative Value Slices". Label the top path "NOT LIKE THIS (Siloed Approach)" showing isolated phases (APIs, Prompts, UI) ending in a high-risk Day 9 merge. Label the bottom path "LIKE THIS! (Iterative Slices)" with 5 stages: Slice 1 (Day 1-2: Skateboard - Mock End-to-End), Slice 2 (Day 3-4: Scooter - Google Doc fetch), Slice 3 (Day 5-6: Bicycle - ADK Anomaly check), Slice 4 (Day 7-8: Motorcycle - Dashboard Gap Resolution UI), and Slice 5 (Day 9: Race Car - Polish & Evals). Make it look highly visual and clean, with a clear contrast between the two approaches. Use chronological nodes connected by paths.
    ```
