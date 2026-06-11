# Hackathon Documentation Index & Checklist

This index lists the completed product, architectural, and evaluation specifications for the Google AI Agents Hackathon (Track 1).

---

## 1. Foundational Strategy
*   [x] **[Product Requirements Document](./agent_prd.md):** Defines target audience, goals, and anti-goals.

## 2. The Agent Specification (The "Brain")
*   [x] **[Persona & System Instructions Charter](./system_prompt_charter.md):** System prompts and edge-case instructions for contradiction handling.
*   [x] **[Tooling & MCP Manifest](./mcp_manifest.md):** Google Docs/Meet API scopes and database write permissions.
*   [x] **[Decision Tree & State Machine](./decision_flow.md):** Ingestion flow chart and loop controls.

## 3. Evaluation & Quality (The "Report Card")
*   [x] **[Golden Dataset](./golden_dataset.md):** Ground-truth test inputs and contradiction examples.
*   [x] **[Evaluation Metrics & KPIs](./eval_metrics.md):** Quantitative and qualitative speed/accuracy measures.

## 4. Engineering Blueprint
*   [x] **[System Architecture Blueprint](./system_design.md):** System diagrams and explanation of Cloud Run vs. ADK roles.
*   [x] **[Data Schemas & API Contracts](./api_contracts.md):** Detailed JSON structures passed between agents and APIs.
*   [x] **[Input Inflow Options](./input_handling_options.md):** API integration preprocessor options.
*   [x] **[Onboarding Slide Deck Blueprint](./onboarding_presentation.md):** Presentation structure and speaker notes.