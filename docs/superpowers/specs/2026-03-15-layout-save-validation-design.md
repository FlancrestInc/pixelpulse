# PixelPulse Layout Save Validation Design

**Date:** 2026-03-15
**Source spec:** [SPEC.md](/mnt/Barnabas/data2/projects/pixelpulse/SPEC.md)
**Goal:** Prevent invalid edit-mode layout data from being persisted by validating save payloads at the backend boundary and surfacing clear failure reasons to the frontend.

---

## 1. Objective

The next reliability-focused slice should make bad layout saves impossible to persist. A layout save request that contains malformed, contradictory, or unreconstructable city state must be rejected before disk write, must leave the last good `layout.yaml` untouched, and must return a useful failure reason to the frontend.

This slice exists to protect the current edit-mode flow, not to redesign the configuration model.

---

## 2. Recommended Approach

Three approaches were considered:

### Approach A: Server-side validation only

Reject invalid `PUT /api/layout` requests at the API boundary and return structured errors.

**Strength:** Reliable and authoritative.

**Limitation:** The UI still allows users to attempt bad saves without much guidance.

### Approach B: Client-side guardrails only

Tighten edit-mode logic so invalid layout states are harder to create.

**Strength:** Better immediate UX.

**Limitation:** Does not protect hand-edited payloads, malformed requests, or future UI regressions.

### Approach C: Backend validation gate plus light frontend messaging

Use backend validation as the source of truth and add only enough frontend feedback to explain rejections.

**Decision:** Use Approach C. The backend gate is the real reliability layer; the frontend work should stay minimal and focused on explaining failures.

---

## 3. Scope

### Included

- Validate `PUT /api/layout` payloads before any file write
- Reject malformed or internally inconsistent layout records
- Preserve the last good `layout.yaml` when validation fails
- Return structured validation errors from the backend
- Surface at least the highest-signal error reason in edit mode
- Add regression tests for accepted and rejected save cases

### Deferred

- Full config/schema overhaul
- Layout versioning or migrations
- Multi-user or concurrent edit handling
- Automatic repair tools for already-bad saved layouts
- Broad UI redesign for save errors

This keeps the slice narrow enough to implement safely and verify thoroughly.

---

## 4. Architecture

The core logic should live in a dedicated backend validation unit rather than inside the API route body.

### Recommended backend shape

- Add a layout validation module under `backend/`
- Keep it responsible only for validating a proposed layout payload
- Call it from `PUT /api/layout` before `_atomic_write_yaml`
- Keep `config_api.py` responsible for request parsing, response formatting, and persistence orchestration

### Data sources for validation

The validator should derive its rules from stable project sources:

- Known plot IDs from the current city plot definition set
- Known building keys from the building registry or a backend-safe equivalent source
- Known signal IDs from `config.yaml`

### Error format

Validation failures should return structured data such as:

- `code`
- `message`
- optional `plot_id`
- optional `field`
- optional `details`

This lets the frontend show a clear error message without scraping raw strings.

### Frontend role

Frontend changes should remain small:

- Save failure toast should include a clearer reason when available
- Edit mode should remain usable after a rejected save
- No large diagnostics UI should be introduced in this slice unless implementation proves it is truly necessary

---

## 5. Validation Rules

The backend should reject a layout save when any of the following are true:

- The payload is not a mapping containing a `plots` list
- A plot entry is not a mapping
- A plot entry is missing `plot_id`
- `plot_id` is duplicated in the request
- `plot_id` is not one of the city’s known plot definitions
- `building` is present but unknown
- `building` is present without `style`
- `style` is present without `building`
- `signal` references an ID not present in backend config
- `valve` is present while `signal` is absent
- `valve` is not a mapping
- `range_min`, `range_max`, or `alert_threshold` are missing when `valve` is present
- `range_min`, `range_max`, or `alert_threshold` are non-numeric
- `range_max <= range_min`
- `alert_threshold` is outside the accepted stored range
- A plot record combines fields in a way the scene cannot safely reconstruct

### Stored-format note

This slice should validate the layout in the format it is currently stored, not introduce a new format. If the current stored valve threshold semantics are mixed or ambiguous, the implementation should pick one clear rule for saved payloads and apply it consistently.

---

## 6. Persistence Behavior

### Success path

- Accept valid payload
- Write `layout.yaml` atomically
- Broadcast or report save success exactly as today

### Failure path

- Reject the request before write
- Return structured validation errors
- Keep the previous `layout.yaml` unchanged
- Broadcast or report save failure in a way the existing frontend can consume without ambiguity

The key guarantee is: invalid save attempts must never replace the last good layout.

---

## 7. Testing Strategy

This slice should be test-driven and backend-heavy.

### Priority automated coverage

- Valid layout save succeeds
- Invalid `plot_id` is rejected
- Unknown `building` is rejected
- Missing `style` for a building is rejected
- Unknown `signal` is rejected
- Malformed valve payload is rejected
- Invalid numeric valve ranges are rejected
- Duplicate plot entries are rejected
- Rejected saves leave the existing `layout.yaml` unchanged

### Frontend verification

Manual verification is sufficient for the UI portion:

- attempt an invalid save through edit mode
- confirm the frontend surfaces a useful error
- confirm edit mode remains active and recoverable
- confirm reload shows the last good layout

---

## 8. Definition of Done

This reliability slice is complete when all of the following are true:

- `PUT /api/layout` validates before writing
- Invalid layouts are rejected with structured error details
- `layout.yaml` remains unchanged after rejected saves
- Valid layouts still save normally
- Backend regression tests cover both accepted and rejected save paths
- Edit mode surfaces at least one clear save-failure reason from the backend

---

## 9. Recommended Build Order

The implementation plan should prioritize work in this order:

1. Add validator tests for accepted and rejected payloads
2. Implement the dedicated backend layout validator
3. Wire validator into `PUT /api/layout`
4. Return structured validation errors on failure
5. Add small frontend messaging updates for save rejection reasons
6. Run regression and manual verification against the last-good-layout guarantee
