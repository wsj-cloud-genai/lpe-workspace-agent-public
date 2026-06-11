# Agent Golden Dataset (Ground Truth)
## Agent Name: Workspace Context Synthesizer (ADK Agent)

This dataset contains mock inputs and expected ground truth outputs to programmatically evaluate and QA test the Workspace Context Synthesizer.

---

## Test Case 1: Design Aesthetics Conflict (Expected Result: `GAP_DETECTED`)

### Mock Inputs:
*   **Google Doc Content:**
    ```text
    Project: AquaLife Water Filters Landing Page.
    Brand Guidelines: Use a clean, light mode design. White background, thin grey card borders, and primary brand color is baby blue (#87CEEB). 
    Font: Google Font Roboto.
    ```
*   **Google Meet Transcript:**
    ```text
    Client: "No, actually, I want to pivot the brand slightly for this campaign. Let's make it feel extremely luxury, high-end, premium. We should definitely go with a sleek, dark mode aesthetic. Let's do gold highlights on a black or deep space-grey background. Yes, gold is definitely the key color."
    ```

### Expected Output:
```json
{
  "status": "GAP_DETECTED",
  "anomalies": [
    {
      "parameter": "theme_mode",
      "doc_value": "light",
      "transcript_value": "dark",
      "justification": "The Google Doc specifies a light mode design with a white background, but the Meet transcript records the client verbally pivoting to a sleek, dark mode luxury aesthetic."
    },
    {
      "parameter": "primary_color",
      "doc_value": "#87CEEB",
      "transcript_value": "gold",
      "justification": "The Google Doc lists the brand primary color as baby blue, but the client explicitly requested gold highlights in the meeting."
    }
  ]
}
```

---

## Test Case 2: Missing Core CTA Context (Expected Result: `GAP_DETECTED`)

### Mock Inputs:
*   **Google Doc Content:**
    ```text
    Company: Apex Cyber Security.
    Headline: Secure your cloud infrastructure with automated penetration testing.
    Features:
    1. Fast scanning in under 5 minutes.
    2. Zero false positives guarantee.
    ```
*   **Google Meet Transcript:**
    ```text
    Client: "We want a bento grid showcasing the features. Let's highlight compliance and ease of installation."
    ```

### Expected Output:
```json
{
  "status": "GAP_DETECTED",
  "anomalies": [
    {
      "parameter": "hero.cta_label",
      "doc_value": null,
      "transcript_value": null,
      "justification": "No call-to-action button text (e.g., 'Book a Demo' or 'Sign Up') is specified in either the Google Doc or the meeting transcript."
    },
    {
      "parameter": "hero.cta_href",
      "doc_value": null,
      "transcript_value": null,
      "justification": "No conversion target URL or href target is provided in the onboarding assets."
    }
  ]
}
```

---

## Test Case 3: Harmonized Campaign Setup (Expected Result: `VALIDATED`)

### Mock Inputs:
*   **Google Doc Content:**
    ```text
    Company: BoltDelivery
    Theme: Modern glassmorphism. Primary brand color: #4F46E5 (Indigo). Font: Outfit.
    Copy Requirements:
    Hero Headline: "Deliveries in minutes, not hours."
    Hero Subheadline: "The fastest local courier service for retail stores."
    CTA Label: "Book Courier"
    CTA Target: "https://boltdelivery.com/book"
    Feature 1: "Real-time Tracking" - Track your driver with precise live GPS map coordinates.
    Feature 2: "Flat Rate Pricing" - No surge prices, no hidden fees.
    Review 1: "Alice" from "Acme Corp" rating 5 - "Incredible speed, we use them daily."
    ```
*   **Google Meet Transcript:**
    ```text
    Client: "The doc is accurate. The primary CTA must say 'Book Courier' and link to boltdelivery.com/book. Make sure the font is Outfit to match our mobile app. The features are correct. We want Indigo as our brand color."
    ```

### Expected Output:
```json
{
  "status": "VALIDATED",
  "brief": {
    "company_name": "BoltDelivery",
    "brand": {
      "theme_mode": "glassmorphism",
      "primary_color": "#4F46E5",
      "font_family": "Outfit"
    },
    "hero": {
      "headline": "Deliveries in minutes, not hours.",
      "subheadline": "The fastest local courier service for retail stores.",
      "cta_label": "Book Courier",
      "image_url": null
    },
    "features": [
      {
        "title": "Real-time Tracking",
        "desc": "Track your driver with precise live GPS map coordinates."
      },
      {
        "title": "Flat Rate Pricing",
        "desc": "No surge prices, no hidden fees."
      }
    ],
    "reviews": [
      {
        "name": "Alice",
        "business": "Acme Corp",
        "text": "Incredible speed, we use them daily.",
        "rating": 5,
        "source": "custom"
      }
    ]
  }
}
```
