# Hackathon Input Ingestion & Inflow Options

This document outlines how the existing LPE Engine integration (`generate_ai_fulfillment.py`) can be updated to consume the structured Creative Brief JSON output by the new Workspace Context Synthesizer (ADK Agent).

---

## Current Setup (Business as Usual)
Currently, the orchestrator triggers the generation script like this:
```bash
python3 scripts/ai/generate_ai_fulfillment.py --prompt "$BUSINESS_INTENT" --request-id "$REQUEST_ID"
```
Inside `generate_ai_fulfillment.py`, the `--prompt` (raw string) is injected into a template code block. Gemini reads the prompt and drafts a Python script, dynamically replacing template values like theme colors, font families, headlines, and component blocks.

---

## Option A: The "API Preprocessor" (Zero Script Changes - Recommended)

### How it works:
Instead of changing the command-line arguments or the system prompt of `generate_ai_fulfillment.py`, the backend Flask API (`api/routes/catalyst.py` or `adl.py`) fetches the validated **Creative Brief JSON** from Firestore, formats it into a highly descriptive prompt string, and passes it to the existing `--prompt` argument.

### Prompt Translation Example:
If the ADK Agent writes the following JSON to Firestore:
```json
{
  "company_name": "BoltDelivery",
  "brand": { "theme_mode": "glassmorphism", "primary_color": "#4F46E5", "font_family": "Outfit" },
  "hero": { "headline": "Deliveries in minutes", "subheadline": "Fast couriers", "cta_label": "Book Courier", "cta_href": "https://bolt.com/book" }
}
```
The backend API preprocessor automatically translates it into:
```text
Create a modern landing page for BoltDelivery. 
Brand Guidelines: Theme style must be modern glassmorphism. Brand primary color is #4F46E5. Title and body font family is Outfit.
Hero Section: Headline is "Deliveries in minutes". Subheadline is "Fast couriers". Primary CTA label is "Book Courier" linking to "https://bolt.com/book".
```

### Code Impact:
*   **`generate_ai_fulfillment.py`:** **0 lines of code changed.**
*   **Flask Backend API:** ~25 lines of python code in the router to read the JSON from Firestore, concatenate keys/values into the structured prompt string, and execute the existing subprocess call.

### Trade-offs:
*   **Pros:** Safe and low-risk. Keeps all the existing prompt engineering, negative-prompt rules, and template validations intact. Guaranteed not to break existing code.
*   **Cons:** Relying on the LLM to translate a written prompt into code parameters (like hex values and font strings) is slightly less deterministic than directly injecting the variables.

---

## Option B: The "Dual-Input Orchestrator" (Script-Level Integration)

### How it works:
We modify `generate_ai_fulfillment.py` to accept a new command-line argument (`--brief-json`) or have it fetch the JSON brief directly from Firestore. We then inject the brief as a structured markdown code block into the Gemini System Instructions.

### Prompt Modification:
We update the System Prompt template in `generate_ai_fulfillment.py` to include:
```markdown
### STRIPED BRAND BRIEF:
Use the exact variables below to configure your LPEPage layout components:
- Company Name: {{brief.company_name}}
- Brand Font: {{brief.brand.font_family}}
- Primary Hex Color: {{brief.brand.primary_color}}
- Theme Mode: {{brief.brand.theme_mode}}
...
```

### Code Impact:
*   **`generate_ai_fulfillment.py`:** Update `argparse` to accept `--brief-json` or load the JSON string, and update the string formatter for the system prompt.
*   **Flask Backend API:** Passes the raw JSON or the Firestore path to the generator script.

### Trade-offs:
*   **Pros:** Highly deterministic. Gemini gets direct, key-value access to the variables (e.g. it knows exactly to output `theme=create_md3_theme("#4F46E5", ...)` instead of parsing it from a sentence).
*   **Cons:** Requires modifying the core generation script and prompt template, which requires re-running evaluation tests to ensure code formatting remains stable.
