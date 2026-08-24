# Automatic Question Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Infer a saved question's target, subject, and question type locally from OCR text, while keeping every inferred value editable before save.

**Architecture:** Add a deterministic, dependency-free classifier to `wrongbook-model.ts`. It uses a short ordered keyword table for subjects/targets and structural text patterns for choice, fill-in, proof, and solution questions. The confirmation form initializes from the classifier, renders an editable question-type chip group, and persists `questionType`; old IndexedDB rows normalize to `解答题` on read.

**Tech Stack:** TypeScript, React, native regular expressions, Node test runner, Playwright.

## Global Constraints

- Classification runs locally and adds no network request or dependency.
- User corrections always override inferred values.
- Existing saved questions without `questionType` remain readable.
- Unknown text falls back to `考研数学 / 高等数学 / 解答题`.

---

### Task 1: Classifier model

**Files:**
- Modify: `app/src/wrongbook-model.ts`
- Modify: `app/tests/wrongbook-model.test.mjs`

- [x] **Step 1: Write failing tests**

Add cases for matrix/proof, physics/multiple-choice, chemistry/fill-in, English/multiple-choice, civil-service target, and unknown-text fallback. Assert exact `{ target, subject, questionType }` objects.

- [x] **Step 2: Verify RED**

Run: `pnpm run test:model`

Expected: FAIL because `classifyQuestion` is undefined.

- [x] **Step 3: Implement minimal classifier**

Export `questionTypes`, `QuestionType`, `QuestionClassification`, and `classifyQuestion(text)`. Check specific subject/target patterns before the default; detect question type in the order choice, proof, fill-in, solution.

- [x] **Step 4: Verify GREEN**

Run: `pnpm run test:model`

Expected: all model tests pass.

---

### Task 2: Persist and edit question type

**Files:**
- Modify: `app/src/wrongbook-model.ts`
- Modify: `app/src/wrongbook-store.ts`
- Modify: `app/src/Prototype.tsx`
- Modify: `app/tests/prototype/store.spec.ts`

- [x] **Step 1: Extend the persistence expectation**

Update the legacy-row browser assertion to expect `questionType: "解答题"` even though its inserted fixture omits the field.

- [ ] **Step 2: Verify RED**

Run: `pnpm run test:prototype --grep "persists an image question"`

Expected: FAIL because list results do not yet normalize `questionType`.

- [x] **Step 3: Implement model, migration, and form changes**

Add `questionType: QuestionType` to `StoredQuestion`; normalize missing values in `listQuestions`; initialize the confirmation states from `classifyQuestion(recognizedText)`; render chips from `questionTypes`; include the selected type on save and in library/review metadata.

- [ ] **Step 4: Verify persistence GREEN**

Run the targeted persistence test and TypeScript build. Expected: both pass.

---

### Task 3: Verify automatic UI classification and correction

**Files:**
- Modify: `app/tests/prototype/home.spec.ts`

- [x] **Step 1: Write failing browser test**

Stub OCR with matrix proof text, run recognition, assert `考研数学`, `线性代数`, and `证明题` are pressed, then select `大学课程` and `解答题` and assert the corrected choices are pressed.

- [ ] **Step 2: Verify RED before UI implementation and GREEN afterward**

Run: `pnpm run test:prototype --grep "automatically classifies"`.

Expected final result: 1 test passed.

- [ ] **Step 3: Run regression**

Run model, prototype, runtime, OCR, native, Sites, build, protected-runtime integrity, and whitespace checks. Commit when Git writes are available.

## Plan Self-Review

- Spec coverage: inferred target, inferred subject, inferred type, manual correction, persistence, legacy rows, and regression are covered.
- Placeholder scan: no TBD or undefined implementation step remains.
- Type consistency: every saved record uses `QuestionType`; the fallback and migration both use `解答题`.
