# Design QA

## Evidence

- Source visual truth: `reference/selected-design.png` (853 × 1875 px), the second displayed ideation result selected by the user.
- Normalized source: `qa/home-source-normalized.png` (393 × 852 px).
- Browser-rendered implementation: `qa/home-implementation.png` (393 × 852 px at deviceScaleFactor 1).
- Combined comparison: `qa/home-comparison.png`; source is left, implementation is right.
- CSS viewport: 393 × 852 px, unscaled iPhone screen verified from `[data-testid="device-screen"]`.
- State: signed-out-free prototype home screen; no modal, keyboard, or pressed state.
- Browser: local Google Chrome driven through Playwright against `http://127.0.0.1:4173`.

## Findings

- No actionable P0, P1, or P2 differences remain.
- Typography: the implementation preserves the source's heavy navy display title, smaller gray supporting copy, bold section label, and readable row hierarchy. System Chinese fallbacks replace the mock's unspecified typeface without changing wrapping or emphasis.
- Spacing and layout: page margins, button width, section order, circular icon wells, dividers, and row rhythm match. The implementation appears lower because the protected mobile runtime adds the iOS status area and home indicator; this is expected device chrome, not app-content drift.
- Colors and tokens: navy text, white surface, pale blue icon wells, and saturated blue primary action match. The implementation uses a solid blue instead of the mock's subtle gradient to keep the shipped UI token simple and accessible.
- Image and icon fidelity: the source contains no photographic or custom raster assets. Standard Radix icons preserve the intended camera/library meanings and consistent stroke treatment; exact subject silhouettes are a P3 refinement.
- Copy and content: source headings, supporting copy, call to action, and five library labels match. Counts were removed from the home rows during QA because they were not present in the selected visual; counts remain available inside each library.
- Accessibility and behavior: semantic headings/buttons, visible focus rings, practical tap targets, labeled text areas, back navigation, manual classification, save success, library navigation, answer reveal, and shuffled review are implemented.

## Focused Region Comparison

No separate crop was needed: the combined 393 × 852 comparison keeps the title, primary action, icons, dividers, and all copy legible at 1:1 scale.

## Comparison History

1. Initial capture found a P2 density mismatch from extra question counts on every home row and a browser-console 404 for the implicit favicon.
2. Removed the row counts, added explicit page language/title and a blank favicon, then recaptured at the same viewport and state.
3. Post-fix evidence in `qa/home-comparison.png` shows the row hierarchy now matches and the capture reports no console errors.

## Primary Interactions Tested

- Open camera-first capture flow and return.
- Simulate OCR and open manual target/subject/answer/note confirmation.
- Save a classified wrong question and return home.
- Open a library, start shuffled review, and reveal the answer.

## Follow-up Polish

- P3: replace the first, third, and fourth generic library icons with closer education-specific silhouettes if the icon system expands later.

final result: passed
