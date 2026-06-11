# Agent Evaluation Metrics (Evals)
## Agent Name: Workspace Context Synthesizer (ADK Agent)

This document establishes the key performance indicators (KPIs) and evaluation matrices to measure the reliability, speed, and accuracy of the agent.

---

## 1. Quantitative Metrics (The Performance Thresholds)

### A. Latency (Pipeline Execution Speed)
*   **Definition:** Time elapsed from the user linking Google Workspace inputs to the agent completing validation (either returning a brief or raising a gap flag).
*   **Measurement:** Milliseconds between backend trigger time and Firestore write time.
*   **Targets:**
    *   *Ideal:* < 10 seconds.
    *   *Target:* < 15 seconds.
    *   *SLA Maximum:* 30 seconds.

### B. Schema Validation Rate (Strict Formatting)
*   **Definition:** Percentage of outputs that successfully compile to standard JSON matching the schemas defined in `api_contracts.md`.
*   **Measurement:** Running output briefs through a JSON Schema validator.
*   **Target:** **100%**. Any malformed JSON parsing error represents a direct failure.

---

## 2. Qualitative Metrics (The Accuracy Evals)

To measure the cognitive accuracy of the agent's cross-referencing capabilities, we evaluate it against our **Golden Dataset** using two standard metrics:

### A. Anomaly Recall (Catching the Gaps)
*   **Definition:** The agent's ability to find all actual contradictions in the source material.
*   **Formula:** `Recall = True Gaps Detected / (True Gaps Detected + Missed Gaps)`
*   **Target:** **> 95%**. The agent must almost never miss a contradiction that would later break the design or copy.

### B. Anomaly Precision (Avoiding False Alarms)
*   **Definition:** The agent's ability to avoid flagging standard or complementary guidelines as conflicts.
*   **Formula:** `Precision = True Gaps Detected / (True Gaps Detected + False Gaps Flagged)`
*   **Target:** **> 90%**. Over-flagging non-existent gaps frustrates operators and slows down the onboarding journey.

### C. Asset Hallucination Rate
*   **Definition:** Percentage of generated image, font, and brand parameters that are fabricated by the LLM (e.g. inventing a logo URL that doesn't exist, using standard hex codes when not requested, or referencing missing assets).
*   **Measurement:** Scanning URL and style attributes in the output brief.
*   **Target:** **0%**. If an asset URL is not explicitly found in the Google Doc or Meet transcript, it must either be set to `null` (utilizing LPE's default fallback logic) or flagged as a gap.

---

## 3. Continuous Evaluation Process
Before code commits are merged to the main branch:
1.  **Test Suite Run:** An automated Python test script runs the ADK Agent against the mock scenarios in the `golden_dataset.md`.
2.  **Pass Criteria:** 100% of the golden test cases must achieve matching state resolutions (`GAP_DETECTED` vs `VALIDATED`) and validate against the JSON schemas.
