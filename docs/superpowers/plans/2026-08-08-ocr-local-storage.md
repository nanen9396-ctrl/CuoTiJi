# OCR and Local Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static capture demo and sample questions with real browser OCR, editable results, and IndexedDB-backed wrong-question review.

**Architecture:** Keep the protected mobile runtime unchanged. Add one Tesseract.js adapter and one native IndexedDB module, then let `Prototype.tsx` own loaded questions through a small in-file React context so every FlowStack screen sees current data.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Tesseract.js 7, native IndexedDB/File/Blob APIs, Node test runner, Playwright.

## Global Constraints

- Edit app-owned UI only in `app/src/Prototype.tsx` and `app/src/prototype.css`; do not edit protected runtime files.
- Use separate camera and gallery file inputs; camera uses `capture="environment"`, gallery does not.
- Accept only `image/*` files up to 10 MB.
- Run OCR locally with `createWorker(["chi_sim", "eng"], 1, { logger })`, where engine mode `1` is LSTM-only in the current official API; always terminate the worker.
- Store the original image Blob and structured fields in IndexedDB; do not use Base64 or localStorage.
- Do not add auth, cloud sync, LaTeX conversion, image understanding, review algorithms, or analytics.
- Every production behavior follows a red-green test cycle.

---

### Task 1: Make the question model data-driven

**Files:**
- Modify: `app/src/wrongbook-model.ts`
- Modify: `app/tests/wrongbook-model.test.mjs`

**Interfaces:**
- Produces: `StoredQuestion`, `questionsForGroup(questions, groupId)`, `libraryGroupsWithCounts(questions)` and existing `makeReviewQueue`.
- Consumes: no browser storage or UI state.

- [ ] **Step 1: Write failing model tests**

Add tests that construct two records and assert exact group filtering and derived counts:

```js
const questions = [
  { id: "1", prompt: "A", answer: "1", target: "考研数学", subject: "高等数学", note: "", createdAt: "2026-08-08T00:00:00.000Z", image: new Blob(["a"], { type: "image/png" }) },
  { id: "2", prompt: "B", answer: "2", target: "高中课程", subject: "物理", note: "", createdAt: "2026-08-08T01:00:00.000Z", image: new Blob(["b"], { type: "image/png" }) },
];

test("filters persisted questions by library and includes all questions", () => {
  assert.deepEqual(model.questionsForGroup(questions, "postgraduate-math").map(({ id }) => id), ["1"]);
  assert.deepEqual(model.questionsForGroup(questions, "all").map(({ id }) => id), ["1", "2"]);
});

test("derives library counts from persisted questions", () => {
  const groups = model.libraryGroupsWithCounts(questions);
  assert.equal(groups.find(({ id }) => id === "postgraduate-math").count, 1);
  assert.equal(groups.find(({ id }) => id === "all").count, 2);
});
```

- [ ] **Step 2: Run the model test and verify RED**

Run: `pnpm run test:model`

Expected: FAIL because `questionsForGroup` and `libraryGroupsWithCounts` do not exist.

- [ ] **Step 3: Implement the minimum model**

Replace static counts/sample questions with:

```ts
export type StoredQuestion = {
  id: string;
  prompt: string;
  answer: string;
  target: string;
  subject: string;
  note: string;
  createdAt: string;
  image: Blob;
};

const groupTargets: Record<string, string> = {
  "postgraduate-math": "考研数学",
  "civil-service": "公务员考试",
  "high-school": "高中课程",
  university: "大学课程",
};

export function questionsForGroup(questions: readonly StoredQuestion[], groupId: string) {
  return groupId === "all" ? [...questions] : questions.filter(({ target }) => target === groupTargets[groupId]);
}

export function libraryGroupsWithCounts(questions: readonly StoredQuestion[]): LibraryGroup[] {
  return libraryGroups.map((group) => ({ ...group, count: questionsForGroup(questions, group.id).length }));
}
```

Set base group counts to `0` and keep `makeReviewQueue` unchanged.

- [ ] **Step 4: Run the model test and verify GREEN**

Run: `pnpm run test:model`

Expected: all model tests pass.

---

### Task 2: Persist questions with native IndexedDB

**Files:**
- Create: `app/src/wrongbook-store.ts`
- Create: `app/tests/prototype/store.spec.ts`

**Interfaces:**
- Consumes: `StoredQuestion` from `wrongbook-model.ts`.
- Produces: `listQuestions(): Promise<StoredQuestion[]>` and `addQuestion(question): Promise<void>`.

- [ ] **Step 1: Write the failing browser storage test**

```ts
import { expect, test } from "@playwright/test";

test("persists an image question across a page reload", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const store = await import("/src/wrongbook-store.ts");
    const record = {
      id: "persisted-1",
      prompt: "持久化题目",
      answer: "42",
      target: "考研数学",
      subject: "高等数学",
      note: "测试",
      createdAt: "2026-08-08T00:00:00.000Z",
      image: new Blob(["image"], { type: "image/png" }),
    };
    await store.addQuestion(record);
    return (await store.listQuestions())[0];
  });
  expect(result.prompt).toBe("持久化题目");
  await page.reload();
  expect(await page.evaluate(async () => (await (await import("/src/wrongbook-store.ts")).listQuestions()).length)).toBe(1);
});
```

- [ ] **Step 2: Run the storage test and verify RED**

Run: `pnpm exec playwright test -c playwright.prototype.config.ts tests/prototype/store.spec.ts`

Expected: FAIL because `wrongbook-store.ts` does not exist.

- [ ] **Step 3: Implement the IndexedDB module**

```ts
import type { StoredQuestion } from "./wrongbook-model";

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function database() {
  const request = indexedDB.open("wrongbook", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("questions", { keyPath: "id" });
  return requestResult(request);
}

export async function listQuestions(): Promise<StoredQuestion[]> {
  const db = await database();
  return requestResult(db.transaction("questions").objectStore("questions").getAll());
}

export async function addQuestion(question: StoredQuestion): Promise<void> {
  const db = await database();
  await requestResult(db.transaction("questions", "readwrite").objectStore("questions").add(question));
}
```

- [ ] **Step 4: Run the storage test and verify GREEN**

Run: `pnpm exec playwright test -c playwright.prototype.config.ts tests/prototype/store.spec.ts`

Expected: 1 test passes.

---

### Task 3: Add the real OCR adapter

**Files:**
- Modify: `app/package.json`
- Modify: `app/pnpm-lock.yaml`
- Create: `app/src/ocr.ts`
- Create: `app/tests/ocr.test.mjs`

**Interfaces:**
- Consumes: `File`, progress callback, and optional `OcrWorkerFactory`.
- Produces: `recognizeQuestion(image, onProgress, createWorker?) => Promise<string>`.

- [ ] **Step 1: Install the single OCR dependency**

Run: `pnpm add tesseract.js@7.0.0`

Expected: package and lockfile add Tesseract.js 7 without other direct dependencies.

- [ ] **Step 2: Write failing OCR lifecycle tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { recognizeQuestion } from "../src/ocr.ts";

test("returns trimmed OCR text and terminates its worker", async () => {
  let terminated = false;
  const text = await recognizeQuestion(
    new File(["image"], "question.png", { type: "image/png" }),
    () => {},
    async () => ({
      recognize: async () => ({ data: { text: "  题目内容\n" } }),
      terminate: async () => { terminated = true; },
    }),
  );
  assert.equal(text, "题目内容");
  assert.equal(terminated, true);
});

test("terminates its worker after recognition fails", async () => {
  let terminated = false;
  await assert.rejects(() => recognizeQuestion(new File(["x"], "x.png", { type: "image/png" }), () => {}, async () => ({
    recognize: async () => { throw new Error("OCR failed"); },
    terminate: async () => { terminated = true; },
  })));
  assert.equal(terminated, true);
});
```

- [ ] **Step 3: Run the OCR test and verify RED**

Run: `node --test --test-isolation=none tests/ocr.test.mjs`

Expected: FAIL because `ocr.ts` does not exist.

- [ ] **Step 4: Implement the adapter**

```ts
import { createWorker, type LoggerMessage } from "tesseract.js";

export type OcrProgress = { status: string; progress: number };
export type OcrWorker = { recognize(image: File): Promise<{ data: { text: string } }>; terminate(): Promise<unknown> };
export type OcrWorkerFactory = (onProgress: (progress: OcrProgress) => void) => Promise<OcrWorker>;

const defaultFactory: OcrWorkerFactory = (onProgress) => createWorker(["chi_sim", "eng"], 1, {
  logger: (message: LoggerMessage) => onProgress({ status: message.status, progress: message.progress }),
});

export async function recognizeQuestion(image: File, onProgress: (progress: OcrProgress) => void, createWorkerFactory = defaultFactory) {
  const worker = await createWorkerFactory(onProgress);
  try {
    return (await worker.recognize(image)).data.text.trim();
  } finally {
    await worker.terminate();
  }
}
```

- [ ] **Step 5: Run the OCR test and verify GREEN**

Run: `node --test --test-isolation=none tests/ocr.test.mjs`

Expected: 2 tests pass.

---

### Task 4: Connect capture, editing, saving, and review UI

**Files:**
- Modify: `app/src/Prototype.tsx`
- Modify: `app/src/prototype.css`
- Modify: `app/tests/prototype/home.spec.ts`

**Interfaces:**
- Consumes: `recognizeQuestion`, `listQuestions`, `addQuestion`, model filtering/count helpers.
- Produces: camera/gallery capture, progress/error states, editable OCR text, persistent library lists, empty states, and real review queues.

- [ ] **Step 1: Replace simulated-flow tests with failing real-flow tests**

Use a tiny PNG fixture created through Playwright `setInputFiles`, choose “手动录入” after preview to avoid network in automated tests, fill recognized text, save, reload, and assert the record remains:

```ts
await page.getByRole("button", { name: "从相册选择" }).click();
await page.locator('input[data-testid="gallery-input"]').setInputFiles({
  name: "question.png",
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2Y+WQAAAABJRU5ErkJggg==", "base64"),
});
await expect(page.getByAltText("待识别题目")).toBeVisible();
await page.getByRole("button", { name: "手动录入" }).click();
await page.getByLabel("识别结果").fill("设函数 f(x)=x²，求导数。");
await page.getByRole("button", { name: "保存错题" }).click();
await page.getByRole("button", { name: "返回首页" }).click();
await page.reload();
await page.getByRole("button", { name: "考研数学" }).click();
await expect(page.getByText("设函数 f(x)=x²，求导数。")).toBeVisible();
```

Add separate assertions for invalid MIME, files larger than 10 MB, empty-library disabled review buttons, and shuffled review using the saved record.

- [ ] **Step 2: Run the prototype tests and verify RED**

Run: `pnpm run test:prototype`

Expected: FAIL because the simulated button/static records are still present.

- [ ] **Step 3: Implement the minimum connected UI**

In `Prototype.tsx`:

- Define an in-file context `{ questions, addSavedQuestion }`; load `listQuestions()` once in `Prototype` and update state only after `addQuestion()` succeeds.
- Change `homeScreen` and `LibraryView` to use `libraryGroupsWithCounts` and `questionsForGroup`.
- Render a clear empty state and disable both review buttons when the selected group has no records.
- Replace the simulated capture action with hidden camera/gallery inputs and visible “拍照”/“从相册选择” buttons.
- Validate `file.type.startsWith("image/")` and `file.size <= 10 * 1024 * 1024` before creating a Blob URL.
- Show image preview, “开始识别”, “手动录入”, progress percentage, and recoverable errors.
- Pass `{ image, recognizedText }` into the confirmation screen; render recognized text with `KeyboardTextarea aria-label="识别结果"`.
- On save, create `StoredQuestion` with `crypto.randomUUID()` and `new Date().toISOString()`, await IndexedDB, then navigate to success. Do not clear the form on failure.
- Use the selected group’s persisted questions for sequential and shuffled review.

In `prototype.css`, add only styles needed for `.scan-input`, `.scan-preview`, `.scan-actions`, `.scan-progress`, `.form-error`, and `.empty-library`; keep the selected visual’s blue/white hierarchy.

- [ ] **Step 4: Run the prototype tests and verify GREEN**

Run: `pnpm run test:prototype`

Expected: all capture, save, reload, library, error, and review tests pass.

---

### Task 5: Verify the complete local product

**Files:**
- Modify: `README.md`
- Modify: `app/design-qa.md` only if the connected UI changes the documented interaction list.

**Interfaces:**
- Consumes: completed implementation.
- Produces: verified build and accurate user-facing setup/limitations.

- [ ] **Step 1: Update documentation**

Document real browser OCR, IndexedDB persistence, first-run language download, 10 MB image limit, and the continued absence of cloud sync.

- [ ] **Step 2: Run all automated checks**

Run, in order:

```powershell
pnpm run check:runtime
pnpm run test:model
node --test --test-isolation=none tests/ocr.test.mjs
pnpm run test:prototype
pnpm run build
pnpm run test:sites
```

Expected: protected runtime passes, all tests pass, TypeScript/Vite build succeeds, and Sites worker packaging tests pass.

- [ ] **Step 3: Run one real OCR browser check**

Open the local preview, select a clear Chinese printed-question image under 10 MB, wait for OCR completion, verify editable non-empty text, save it, reload, and confirm the record and original image remain. Confirm no unhandled browser console errors.

- [ ] **Step 4: Check and commit the implementation**

Run:

```powershell
git diff --check
git status --short
git add README.md app/package.json app/pnpm-lock.yaml app/src app/tests app/design-qa.md docs/superpowers/plans/2026-08-08-ocr-local-storage.md
git commit -m "feat: add local OCR and persistent wrong questions"
```

Expected: one intentional feature commit and a clean worktree.
