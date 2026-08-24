# Wrongbook Data Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local search, question editing and deletion, full image-inclusive backup import/export, and safely confirmed clear-all operations.

**Architecture:** Keep the existing single IndexedDB `questions` store and extend it with durable CRUD and atomic batch import operations. Add one dependency-free backup codec for the versioned JSON boundary, while the existing React flow owns search, file selection, sharing/downloading, confirmations, and in-memory state updates after transactions complete.

**Tech Stack:** TypeScript 7, React 19, IndexedDB, Blob/File/Web Share APIs, Node test runner, Playwright, Vite, Capacitor 8.

## Global Constraints

- Backup files include every question field and the original image.
- Backup format is UTF-8 JSON with format `cuotiji`, version `1`, and filename suffix `.cuotiji.json`.
- Import and export files are limited to exactly `100 * 1024 * 1024` bytes.
- Existing IDs win: importing an ID already stored locally skips the backup record and never overwrites local edits.
- Batch import is atomic; a request, quota, or transaction failure leaves all new records uncommitted.
- Clear-all requires two confirmations, with the exact question count in the second confirmation.
- Search covers prompt, answer, note, target, subject, and question type, case-insensitively.
- Editing preserves the ID, original image, and creation timestamp.
- No account, cloud sync, backup encryption, recycle bin, semantic duplicate detection, image replacement, native filesystem plugin, or new runtime dependency.
- No network request or protected mobile-runtime modification.

---

### Task 0: Stabilize completed native-shell and classification prerequisites

**Files:**
- Commit existing modifications under `app/`, `README.md`, and `docs/superpowers/plans/`
- Verify protected files listed by `app/scripts/mobile-runtime-lock.json`

**Interfaces:**
- Consumes: current `codex/local-ocr` worktree with completed Capacitor shell and automatic classification changes
- Produces: a clean prerequisite commit so data-management task commits contain only their own changes

- [ ] **Step 1: Confirm protected runtime content is unchanged from the last valid feature base**

Run from the worktree root:

```powershell
git diff 998725d -- app/src/App.tsx app/src/main.tsx app/src/styles.css app/src/mobile app/vite.config.ts
```

Expected: no output. Any output means stop and restore only the accidental protected-file differences before continuing.

- [ ] **Step 2: Run the prerequisite verification set**

```powershell
cd app
pnpm run test:model
pnpm run test:ocr
pnpm run test:native
pnpm run check:runtime
pnpm run test:prototype
pnpm run test:runtime
pnpm run test:sites
pnpm run build
cd ..
git diff --check
```

Expected: every command exits `0`; model reports 10 passing tests, OCR reports 3, native reports 1, protected runtime reports 28 protected files, and both Playwright suites, Sites tests, TypeScript, and production build pass.

- [ ] **Step 3: Commit the completed prerequisite work**

```powershell
git add README.md app docs/superpowers/plans/2026-08-20-capacitor-production-shell.md docs/superpowers/plans/2026-08-20-auto-classification.md
git diff --cached --check
git commit -m "feat: prepare native app and automatic classification"
```

Expected: one commit records the current net native-shell and classification implementation. Do not include the already committed data-management design or this plan.

---

### Task 1: Versioned full-backup codec

**Files:**
- Create: `app/src/wrongbook-backup.ts`
- Create: `app/tests/wrongbook-backup.test.mjs`
- Modify: `app/package.json`

**Interfaces:**
- Consumes: `StoredQuestion`, `QuestionType`, and `questionTypes` from `app/src/wrongbook-model.ts`
- Produces: `MAX_BACKUP_BYTES`, `createBackupBlob(questions, exportedAt?)`, and `parseBackupFile(file)`

- [ ] **Step 1: Add the failing codec tests and test script**

Add `"test:backup": "node --test --test-isolation=none tests/wrongbook-backup.test.mjs"` beside `test:model` and `"typecheck": "tsc --noEmit"` beside `build` in `app/package.json`.

Create `app/tests/wrongbook-backup.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

const backup = await import("../src/wrongbook-backup.ts");

const question = {
  id: "question-1",
  prompt: "设 A 为三阶矩阵，证明命题。",
  answer: "证明过程",
  target: "考研数学",
  subject: "线性代数",
  questionType: "证明题",
  note: "复习特征值",
  createdAt: "2026-08-24T00:00:00.000Z",
  image: new Blob([Uint8Array.from([137, 80, 78, 71])], { type: "image/png" }),
};

test("round-trips every question field and original image", async () => {
  const encoded = await backup.createBackupBlob([question], new Date("2026-08-24T01:00:00.000Z"));
  const [restored] = await backup.parseBackupFile(encoded);

  assert.equal(encoded.type, "application/json");
  assert.deepEqual({ ...restored, image: undefined }, { ...question, image: undefined });
  assert.equal(restored.image.type, "image/png");
  assert.deepEqual(new Uint8Array(await restored.image.arrayBuffer()), Uint8Array.from([137, 80, 78, 71]));
});

test("rejects unknown backup versions", async () => {
  const file = new Blob([JSON.stringify({ format: "cuotiji", version: 2, exportedAt: question.createdAt, questions: [] })]);
  await assert.rejects(() => backup.parseBackupFile(file), /不支持的备份版本/);
});

test("rejects invalid question fields without returning partial data", async () => {
  const file = new Blob([JSON.stringify({
    format: "cuotiji",
    version: 1,
    exportedAt: question.createdAt,
    questions: [{ ...question, image: { type: "image/png", base64: "iVBORw==" }, prompt: "" }],
  })]);
  await assert.rejects(() => backup.parseBackupFile(file), /题目数据无效/);
});

test("rejects invalid image MIME types and Base64", async () => {
  const makeFile = (image) => new Blob([JSON.stringify({
    format: "cuotiji",
    version: 1,
    exportedAt: question.createdAt,
    questions: [{ ...question, image }],
  })]);
  await assert.rejects(() => backup.parseBackupFile(makeFile({ type: "text/plain", base64: "aGVsbG8=" })), /图片类型无效/);
  await assert.rejects(() => backup.parseBackupFile(makeFile({ type: "image/png", base64: "not base64" })), /图片数据无效/);
});

test("rejects files and exports over 100 MB before reading image bytes", async () => {
  const oversizedFile = { size: backup.MAX_BACKUP_BYTES + 1, text: () => { throw new Error("must not read"); } };
  await assert.rejects(() => backup.parseBackupFile(oversizedFile), /不能超过 100 MB/);

  const oversizedQuestion = { ...question, image: { size: 79 * 1024 * 1024, type: "image/png" } };
  await assert.rejects(() => backup.createBackupBlob([oversizedQuestion]), /不能超过 100 MB/);
});
```

- [ ] **Step 2: Run the codec tests to verify RED**

```powershell
cd app
pnpm run test:backup
```

Expected: FAIL because `src/wrongbook-backup.ts` does not exist.

- [ ] **Step 3: Implement the minimal codec**

Create `app/src/wrongbook-backup.ts` with these public types and functions:

```ts
import { questionTypes, type QuestionType, type StoredQuestion } from "./wrongbook-model";

export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

type BackupQuestion = Omit<StoredQuestion, "image"> & {
  image: { type: string; base64: string };
};

type BackupDocument = {
  format: "cuotiji";
  version: 1;
  exportedAt: string;
  questions: BackupQuestion[];
};

const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBlob(type: string, value: string): Blob {
  if (!type.startsWith("image/")) fail("备份中的图片类型无效");
  if (!base64Pattern.test(value)) fail("备份中的图片数据无效");
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    fail("备份中的图片数据无效");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type });
}

function parseQuestion(value: unknown): StoredQuestion {
  if (!isRecord(value) || !isRecord(value.image)) fail("备份中的题目数据无效");
  const { id, prompt, answer, target, subject, questionType, note, createdAt, image } = value;
  const strings = [id, prompt, answer, target, subject, note, createdAt];
  if (strings.some((field) => typeof field !== "string") || !(id as string).trim() || !(prompt as string).trim()) {
    fail("备份中的题目数据无效");
  }
  if (!questionTypes.includes(questionType as QuestionType) || Number.isNaN(Date.parse(createdAt as string))) {
    fail("备份中的题目数据无效");
  }
  if (typeof image.type !== "string") fail("备份中的图片类型无效");
  if (typeof image.base64 !== "string") fail("备份中的图片数据无效");
  return {
    id: id as string,
    prompt: prompt as string,
    answer: answer as string,
    target: target as string,
    subject: subject as string,
    questionType: questionType as QuestionType,
    note: note as string,
    createdAt: createdAt as string,
    image: base64ToBlob(image.type, image.base64),
  };
}

export async function createBackupBlob(
  questions: readonly StoredQuestion[],
  exportedAt = new Date(),
): Promise<Blob> {
  const estimatedBase64Bytes = questions.reduce((total, question) => total + 4 * Math.ceil(question.image.size / 3), 0);
  if (estimatedBase64Bytes > MAX_BACKUP_BYTES) fail("备份文件不能超过 100 MB");
  const encodedQuestions: BackupQuestion[] = [];
  for (const question of questions) {
    encodedQuestions.push({
      ...question,
      image: { type: question.image.type, base64: await blobToBase64(question.image) },
    });
  }
  const document: BackupDocument = {
    format: "cuotiji",
    version: 1,
    exportedAt: exportedAt.toISOString(),
    questions: encodedQuestions,
  };
  const blob = new Blob([JSON.stringify(document)], { type: "application/json" });
  if (blob.size > MAX_BACKUP_BYTES) fail("备份文件不能超过 100 MB");
  return blob;
}

export async function parseBackupFile(file: Pick<Blob, "size" | "text">): Promise<StoredQuestion[]> {
  if (file.size > MAX_BACKUP_BYTES) fail("备份文件不能超过 100 MB");
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    fail("备份文件不是有效的 JSON");
  }
  if (!isRecord(value) || value.format !== "cuotiji") fail("不是错题集备份文件");
  if (value.version !== 1) fail("不支持的备份版本");
  if (typeof value.exportedAt !== "string" || Number.isNaN(Date.parse(value.exportedAt)) || !Array.isArray(value.questions)) {
    fail("备份文件结构无效");
  }
  return value.questions.map(parseQuestion);
}
```

- [ ] **Step 4: Run codec tests and TypeScript to verify GREEN**

```powershell
pnpm run test:backup
pnpm run typecheck
```

Expected: 5 tests pass and TypeScript exits `0`.

- [ ] **Step 5: Commit the codec**

```powershell
git add app/package.json app/src/wrongbook-backup.ts app/tests/wrongbook-backup.test.mjs
git diff --cached --check
git commit -m "feat: add full local backup codec"
```

---

### Task 2: Durable CRUD and atomic import

**Files:**
- Modify: `app/src/wrongbook-store.ts`
- Modify: `app/tests/prototype/store.spec.ts`

**Interfaces:**
- Consumes: validated `StoredQuestion[]` from `parseBackupFile`
- Produces: `updateQuestion(question): Promise<void>`, `deleteQuestion(id): Promise<void>`, `clearQuestions(): Promise<void>`, and `importQuestions(questions): Promise<{ added: StoredQuestion[]; skipped: number }>`

- [ ] **Step 1: Add failing browser-boundary tests**

Append tests to `app/tests/prototype/store.spec.ts` that seed the database through `addQuestion`, then assert:

```ts
test("updates, deletes, and clears only after durable transactions", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const store = await import("/src/wrongbook-store.ts");
    const makeQuestion = (id: string) => ({
      id,
      prompt: `题目 ${id}`,
      answer: "",
      target: "考研数学",
      subject: "高等数学",
      questionType: "解答题" as const,
      note: "",
      createdAt: "2026-08-24T00:00:00.000Z",
      image: new Blob([id], { type: "image/png" }),
    });
    await store.clearQuestions();
    await store.addQuestion(makeQuestion("one"));
    await store.addQuestion(makeQuestion("two"));
    await store.updateQuestion({ ...makeQuestion("one"), answer: "更新后的答案" });
    await store.deleteQuestion("two");
    const afterDelete = await store.listQuestions();
    await store.clearQuestions();
    return { afterDelete: afterDelete.map(({ id, answer }) => ({ id, answer })), finalCount: (await store.listQuestions()).length };
  });
  expect(result).toEqual({ afterDelete: [{ id: "one", answer: "更新后的答案" }], finalCount: 0 });
});

test("imports atomically and skips every duplicate ID", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const store = await import("/src/wrongbook-store.ts");
    const makeQuestion = (id: string) => ({
      id,
      prompt: `题目 ${id}`,
      answer: "",
      target: "考研数学",
      subject: "高等数学",
      questionType: "解答题" as const,
      note: "",
      createdAt: "2026-08-24T00:00:00.000Z",
      image: new Blob([id], { type: "image/png" }),
    });
    await store.clearQuestions();
    await store.addQuestion(makeQuestion("existing"));
    const imported = await store.importQuestions([
      { ...makeQuestion("existing"), answer: "不得覆盖" },
      makeQuestion("new"),
      { ...makeQuestion("new"), answer: "备份内重复" },
    ]);
    return {
      added: imported.added.map(({ id }) => id),
      skipped: imported.skipped,
      stored: (await store.listQuestions()).map(({ id, answer }) => ({ id, answer })).sort((a, b) => a.id.localeCompare(b.id)),
    };
  });
  expect(result).toEqual({
    added: ["new"],
    skipped: 2,
    stored: [{ id: "existing", answer: "" }, { id: "new", answer: "" }],
  });
});
```

Add this third test using the existing fake IndexedDB pattern. It proves the API does not report a partially successful import:

```ts
test("rejects when a batch import transaction aborts", async ({ page }) => {
  await page.goto("/");
  const rejected = await page.evaluate(async () => {
    const store = await import(`/src/wrongbook-store.ts?batch-abort=${Date.now()}`);
    const openRequest: Record<string, unknown> = {};
    const keysRequest: Record<string, unknown> = {};
    const addRequest: Record<string, unknown> = {};
    const transaction: Record<string, unknown> = {
      error: new DOMException("Quota exceeded", "QuotaExceededError"),
      objectStore: () => ({
        getAllKeys: () => {
          queueMicrotask(() => {
            keysRequest.result = [];
            (keysRequest.onsuccess as (() => void) | undefined)?.();
          });
          return keysRequest;
        },
        add: () => {
          queueMicrotask(() => {
            (addRequest.onsuccess as (() => void) | undefined)?.();
            setTimeout(() => (transaction.onabort as (() => void) | undefined)?.(), 0);
          });
          return addRequest;
        },
      }),
    };
    const originalOpen = indexedDB.open;
    Object.defineProperty(indexedDB, "open", {
      configurable: true,
      value: () => {
        queueMicrotask(() => {
          openRequest.result = { close: () => {}, transaction: () => transaction };
          (openRequest.onsuccess as (() => void) | undefined)?.();
        });
        return openRequest;
      },
    });
    try {
      await store.importQuestions([{
        id: "batch-item",
        prompt: "不应报告成功",
        answer: "",
        target: "考研数学",
        subject: "高等数学",
        questionType: "解答题",
        note: "",
        createdAt: "2026-08-24T00:00:00.000Z",
        image: new Blob(["image"], { type: "image/png" }),
      }]);
      return false;
    } catch {
      return true;
    } finally {
      Object.defineProperty(indexedDB, "open", { configurable: true, value: originalOpen });
    }
  });
  expect(rejected).toBe(true);
});
```

- [ ] **Step 2: Run the store tests to verify RED**

```powershell
cd app
pnpm run test:prototype --grep "updates, deletes, and clears|imports atomically|batch import transaction"
```

Expected: FAIL because the four new store functions are undefined.

- [ ] **Step 3: Implement the durable operations**

Add to `app/src/wrongbook-store.ts`:

```ts
async function runWrite(requestFactory: (store: IDBObjectStore) => IDBRequest): Promise<void> {
  const db = await database();
  try {
    const transaction = db.transaction("questions", "readwrite");
    await Promise.all([
      requestResult(requestFactory(transaction.objectStore("questions"))),
      transactionResult(transaction),
    ]);
  } finally {
    db.close();
  }
}

export function updateQuestion(question: StoredQuestion): Promise<void> {
  return runWrite((store) => store.put(question));
}

export function deleteQuestion(id: string): Promise<void> {
  return runWrite((store) => store.delete(id));
}

export function clearQuestions(): Promise<void> {
  return runWrite((store) => store.clear());
}

export async function importQuestions(
  questions: readonly StoredQuestion[],
): Promise<{ added: StoredQuestion[]; skipped: number }> {
  const db = await database();
  try {
    const transaction = db.transaction("questions", "readwrite");
    const complete = transactionResult(transaction);
    const store = transaction.objectStore("questions");
    const existing = new Set(await requestResult(store.getAllKeys()));
    const added: StoredQuestion[] = [];
    let skipped = 0;
    const writes: Promise<unknown>[] = [];
    for (const question of questions) {
      if (existing.has(question.id)) {
        skipped += 1;
        continue;
      }
      existing.add(question.id);
      added.push(question);
      writes.push(requestResult(store.add(question)));
    }
    await Promise.all([...writes, complete]);
    return { added, skipped };
  } finally {
    db.close();
  }
}
```

Replace `addQuestion`'s duplicated transaction body with `return runWrite((store) => store.add(question));`.

- [ ] **Step 4: Run store tests and TypeScript to verify GREEN**

```powershell
pnpm run test:prototype --grep "persists an image question|transaction aborts|updates, deletes, and clears|imports atomically|batch import transaction"
pnpm run typecheck
```

Expected: every selected test passes and TypeScript exits `0`.

- [ ] **Step 5: Commit the store operations**

```powershell
git add app/src/wrongbook-store.ts app/tests/prototype/store.spec.ts
git diff --cached --check
git commit -m "feat: add durable wrongbook data operations"
```

---

### Task 3: Library search and question editing/deletion

**Files:**
- Modify: `app/src/Prototype.tsx`
- Modify: `app/src/prototype.css`
- Modify: `app/tests/prototype/home.spec.ts`

**Interfaces:**
- Consumes: `updateQuestion` and `deleteQuestion` from Task 2
- Produces: searchable library UI, editable question detail screen, and session methods `editQuestion` and `removeQuestion`

- [ ] **Step 1: Add failing end-to-end tests**

Add this reusable helper to `home.spec.ts`; it imports the store in the page and inserts a complete `StoredQuestion`:

```ts
async function seedQuestion(page: Page, overrides: Record<string, string>) {
  await page.goto("/");
  await page.evaluate(async (values) => {
    const store = await import("/src/wrongbook-store.ts");
    await store.addQuestion({
      id: values.id,
      prompt: values.prompt,
      answer: "",
      target: "考研数学",
      subject: "高等数学",
      questionType: "解答题",
      note: "",
      createdAt: "2026-08-24T00:00:00.000Z",
      image: new Blob([values.id], { type: "image/png" }),
      ...values,
    });
  }, overrides);
}
```

Add three tests:

```ts
test("searches every approved question field within the current library", async ({ page }) => {
  await seedQuestion(page, { id: "matrix", prompt: "矩阵题", note: "特征值易错", subject: "线性代数" });
  await seedQuestion(page, { id: "physics", prompt: "小球运动", answer: "速度为 2", target: "高中课程", subject: "物理" });
  await page.reload();
  await page.getByRole("button", { name: "全部错题" }).click();
  await page.getByRole("searchbox", { name: "搜索错题" }).fill("特征值");
  await expect(page.getByRole("button", { name: /矩阵题/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /小球运动/ })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "搜索错题" }).fill("物理");
  await expect(page.getByRole("button", { name: /小球运动/ })).toBeVisible();
});

test("edits a question while preserving its image identity fields", async ({ page }) => {
  await seedQuestion(page, { id: "edit-me", prompt: "原题", createdAt: "2026-08-20T00:00:00.000Z" });
  await page.reload();
  await page.getByRole("button", { name: "全部错题" }).click();
  await page.getByRole("button", { name: /原题/ }).click();
  await page.getByLabel("题目文字").fill("修改后的题目");
  await page.getByLabel("正确答案").fill("修改后的答案");
  await page.getByRole("button", { name: "线性代数", exact: true }).click();
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  const stored = await page.evaluate(async () => (await (await import("/src/wrongbook-store.ts")).listQuestions())[0]);
  expect({ id: stored.id, prompt: stored.prompt, createdAt: stored.createdAt, imageType: stored.image.type }).toEqual({
    id: "edit-me",
    prompt: "修改后的题目",
    createdAt: "2026-08-20T00:00:00.000Z",
    imageType: "image/png",
  });
});

test("requires confirmation before deleting one question", async ({ page }) => {
  await seedQuestion(page, { id: "delete-me", prompt: "待删除题目" });
  await page.reload();
  await page.getByRole("button", { name: "全部错题" }).click();
  await page.getByRole("button", { name: /待删除题目/ }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "删除错题" }).click();
  await expect(page.getByRole("heading", { name: "错题详情" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除错题" }).click();
  await expect(page.getByText("还没有错题，先拍照录入一道吧")).toBeVisible();
});
```

- [ ] **Step 2: Run the new tests to verify RED**

```powershell
pnpm run test:prototype --grep "searches every approved|edits a question|requires confirmation"
```

Expected: FAIL because the search field, interactive rows, detail screen, and session mutations do not exist.

- [ ] **Step 3: Add session mutations and shared choice constants**

In `Prototype.tsx`, import `updateQuestion` and `deleteQuestion`. Hoist the existing target and subject arrays into `targetChoices` and `subjectChoices` constants so confirm and edit screens use the same values.

Extend `WrongbookSession` and the provider with:

```ts
editQuestion: async (question) => {
  await updateQuestion(question);
  setQuestions((current) => current.map((item) => item.id === question.id ? question : item));
},
removeQuestion: async (id) => {
  await deleteQuestion(id);
  setQuestions((current) => current.filter((item) => item.id !== id));
},
```

Memoize these callbacks with `useCallback` and include them in the session `useMemo` dependencies.

- [ ] **Step 4: Implement search and the question detail flow**

In `LibraryView`, add `const [query, setQuery] = useState("")` and derive:

```ts
const normalizedQuery = query.trim().toLocaleLowerCase();
const visibleQuestions = currentQuestions.filter((question) => !normalizedQuery || [
  question.prompt,
  question.answer,
  question.note,
  question.target,
  question.subject,
  question.questionType,
].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
```

Render a labeled `<input type="search" aria-label="搜索错题">`. Render each visible question as a real button whose click calls `flow.push(questionScreen(question))`. When the query has no matches, show `没有找到匹配的错题`; retain the original empty-library copy only when the group itself is empty.

Add these rules to `prototype.css` so the existing visual layout remains intact on the accessible button and search input:

```css
.library-search {
  width: 100%;
  margin-top: 18px;
  padding: 13px 14px;
  border: 1px solid #dde4f0;
  border-radius: 14px;
  box-sizing: border-box;
  color: #15213b;
  background: #ffffff;
  font: inherit;
}

.library-search:focus {
  outline: 3px solid rgba(36, 100, 235, 0.16);
  border-color: #2464eb;
}

button.question-row {
  width: 100%;
  border-top: 0;
  border-right: 0;
  border-left: 0;
  text-align: left;
  background: transparent;
  font: inherit;
  cursor: pointer;
}
```

Add `QuestionDetail` and `questionScreen`. `QuestionDetail` owns editable state initialized from the stored question, keeps `id`, `image`, and `createdAt` unchanged, validates a non-empty prompt, and builds the updated object exactly as follows:

```ts
const updated: StoredQuestion = {
  ...question,
  prompt: prompt.trim(),
  answer: answer.trim(),
  target,
  subject,
  questionType,
  note: note.trim(),
};
await editQuestion(updated);
setStatus("已保存");
```

The delete handler uses `window.confirm(\`确定删除“${question.prompt.slice(0, 24)}”吗？\`)`. On acceptance it awaits `removeQuestion(question.id)` and then calls `flow.pop()`. On rejection it does nothing. Store failures set `role="alert"` copy and keep the screen open.

- [ ] **Step 5: Run focused tests, accessibility selectors, and TypeScript**

```powershell
pnpm run test:prototype --grep "searches every approved|edits a question|requires confirmation"
pnpm run typecheck
```

Expected: 3 tests pass and TypeScript exits `0`.

- [ ] **Step 6: Commit search and editing**

```powershell
git add app/src/Prototype.tsx app/src/prototype.css app/tests/prototype/home.spec.ts
git diff --cached --check
git commit -m "feat: search and manage saved questions"
```

---

### Task 4: Backup import/export and clear-all screen

**Files:**
- Modify: `app/src/Prototype.tsx`
- Modify: `app/src/prototype.css`
- Modify: `app/tests/prototype/home.spec.ts`

**Interfaces:**
- Consumes: `createBackupBlob` and `parseBackupFile` from Task 1; `importQuestions` and `clearQuestions` from Task 2
- Produces: home `数据管理` entry, share/download export, validated file import, and double-confirmed clear

- [ ] **Step 1: Add failing data-management tests**

Add tests that seed questions and verify:

Add this helper near `seedQuestion` so consecutive native confirmation dialogs are answered in order:

```ts
function answerDialogs(page: Page, answers: readonly boolean[]): Promise<string[]> {
  return new Promise((resolve, reject) => {
    let index = 0;
    const messages: string[] = [];
    const handler = async (dialog: import("@playwright/test").Dialog) => {
      try {
        messages.push(dialog.message());
        if (answers[index]) await dialog.accept();
        else await dialog.dismiss();
        index += 1;
        if (index === answers.length) {
          page.off("dialog", handler);
          resolve(messages);
        }
      } catch (reason) {
        page.off("dialog", handler);
        reject(reason);
      }
    };
    page.on("dialog", handler);
  });
}
```

```ts
test("exports an image-inclusive backup after the privacy confirmation", async ({ page }) => {
  await seedQuestion(page, { id: "backup-me", prompt: "备份题目" });
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: undefined }));
  await page.reload();
  await page.getByRole("button", { name: "数据管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出完整备份" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^cuotiji-\d{4}-\d{2}-\d{2}\.cuotiji\.json$/);
});

test("imports valid records and reports skipped duplicate IDs", async ({ page }) => {
  await seedQuestion(page, { id: "existing", prompt: "本机题目" });
  await page.reload();
  await page.getByRole("button", { name: "数据管理" }).click();
  const document = {
    format: "cuotiji",
    version: 1,
    exportedAt: "2026-08-24T00:00:00.000Z",
    questions: [
      { id: "existing", prompt: "不得覆盖", answer: "", target: "考研数学", subject: "高等数学", questionType: "解答题", note: "", createdAt: "2026-08-24T00:00:00.000Z", image: { type: "image/png", base64: tinyPng.toString("base64") } },
      { id: "imported", prompt: "导入题目", answer: "", target: "高中课程", subject: "物理", questionType: "选择题", note: "", createdAt: "2026-08-24T00:00:00.000Z", image: { type: "image/png", base64: tinyPng.toString("base64") } },
    ],
  };
  await page.getByTestId("backup-input").setInputFiles({ name: "backup.cuotiji.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.getByRole("status")).toContainText("新增 1 道，跳过 1 道");
});

test("rejects invalid imports and double-confirms clear-all", async ({ page }) => {
  await seedQuestion(page, { id: "keep-until-confirmed", prompt: "清空测试题" });
  await page.reload();
  await page.getByRole("button", { name: "数据管理" }).click();
  await page.getByTestId("backup-input").setInputFiles({ name: "bad.cuotiji.json", mimeType: "application/json", buffer: Buffer.from("not json") });
  await expect(page.getByRole("alert")).toContainText("不是有效的 JSON");
  const cancelledClear = answerDialogs(page, [true, false]);
  await page.getByRole("button", { name: "清空全部题库" }).click();
  const cancelledMessages = await cancelledClear;
  expect(cancelledMessages[1]).toContain("1 道");
  await expect(page.getByText("当前共 1 道错题")).toBeVisible();
  const confirmedClear = answerDialogs(page, [true, true]);
  await page.getByRole("button", { name: "清空全部题库" }).click();
  await confirmedClear;
  await expect(page.getByText("当前共 0 道错题")).toBeVisible();
});
```

- [ ] **Step 2: Run the data-management tests to verify RED**

```powershell
pnpm run test:prototype --grep "exports an image-inclusive|imports valid records|rejects invalid imports"
```

Expected: FAIL because the home entry and data-management screen do not exist.

- [ ] **Step 3: Add provider methods for import and clear**

Import the Task 2 functions with aliases that avoid collision with provider method names. Extend `WrongbookSession` with:

```ts
importQuestionBatch: (questions: readonly StoredQuestion[]) => Promise<{ added: number; skipped: number }>;
clearAllQuestions: () => Promise<void>;
```

Implement callbacks:

```ts
const importQuestionBatch = useCallback(async (incoming: readonly StoredQuestion[]) => {
  const result = await importQuestions(incoming);
  setQuestions((current) => [...result.added, ...current].sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
  return { added: result.added.length, skipped: result.skipped };
}, []);

const clearAllQuestions = useCallback(async () => {
  await clearQuestions();
  setQuestions([]);
}, []);
```

- [ ] **Step 4: Implement `DataManagement` and its flow screen**

The screen displays `当前共 ${questions.length} 道错题`, the privacy warning, a hidden file input with `data-testid="backup-input"`, and three buttons.

Export handler:

```ts
if (!window.confirm("备份包含原题照片和个人笔记，且未加密。继续导出吗？")) return;
const blob = await createBackupBlob(questions);
const date = new Date().toISOString().slice(0, 10);
const file = new File([blob], `cuotiji-${date}.cuotiji.json`, { type: "application/json" });
const shareData = { files: [file], title: "错题集完整备份" };
if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
  try {
    await navigator.share(shareData);
  } catch (reason) {
    if (!(reason instanceof DOMException && reason.name === "AbortError")) throw reason;
  }
} else {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

Import handler resets the input value, calls `parseBackupFile(file)`, awaits `importQuestionBatch`, then sets `role="status"` copy to `导入完成：新增 ${added} 道，跳过 ${skipped} 道`. It maps thrown `Error.message` to `role="alert"` without changing current questions.

Clear handler:

```ts
if (!window.confirm("确定要清空全部题库吗？")) return;
if (!window.confirm(`将永久删除 ${questions.length} 道错题，此操作无法撤销。继续吗？`)) return;
await clearAllQuestions();
setStatus("题库已清空");
```

Add `dataManagementScreen` with a standard back header. Add a home button named `数据管理` that pushes the screen.

Reuse the existing `detail-page`, `detail-content`, `detail-summary`, `primary-button`, and `secondary-button` styles. Add only the destructive and stacked-action rules to `prototype.css`:

```css
.management-actions {
  margin-top: 18px;
  display: grid;
  gap: 12px;
}

.management-actions .primary-button,
.management-actions .secondary-button {
  margin-top: 0;
}

.danger-button {
  min-height: 52px;
  border: 1px solid #f0c7c7;
  border-radius: 15px;
  color: #b42318;
  background: #fff7f7;
  font: inherit;
  font-weight: 750;
}
```

- [ ] **Step 5: Run focused tests and TypeScript to verify GREEN**

```powershell
pnpm run test:backup
pnpm run test:prototype --grep "exports an image-inclusive|imports valid records|rejects invalid imports"
pnpm run typecheck
```

Expected: backup tests and all 3 data-management tests pass; TypeScript exits `0`.

- [ ] **Step 6: Commit the data-management screen**

```powershell
git add app/src/Prototype.tsx app/src/prototype.css app/tests/prototype/home.spec.ts
git diff --cached --check
git commit -m "feat: import export and clear wrongbook data"
```

---

### Task 5: Documentation and complete regression

**Files:**
- Modify: `README.md`
- Verify: all source, tests, native projects, and protected runtime files

**Interfaces:**
- Consumes: completed Tasks 1-4
- Produces: documented user-visible data guarantees and release-ready verification evidence

- [ ] **Step 1: Document data ownership and backup limits**

Add a concise `数据管理` section to `README.md` stating:

```md
## 数据管理

- 搜索覆盖题目、答案、笔记、考试目标、科目和题型。
- 可编辑或删除单道错题；编辑保留原图和录入时间。
- `.cuotiji.json` 完整备份包含原题图片，最大 100 MB，仅在本地生成和解析。
- 导入不会覆盖相同 ID 的本机题目；批量写入失败时整体回滚。
- 备份未加密，可能包含照片和个人笔记，请妥善保管。
```

- [ ] **Step 2: Run every focused and regression check from a fresh command**

```powershell
cd app
pnpm run test:model
pnpm run test:backup
pnpm run test:ocr
pnpm run test:native
pnpm run test:prototype
pnpm run test:runtime
pnpm run test:sites
pnpm run typecheck
pnpm run build
pnpm run native:sync
pnpm run check:runtime
cd ..
git diff --check
```

Expected: all commands exit `0`; no test is skipped; Android and iOS Capacitor sync complete; protected runtime reports 28 protected files; the production and native web directories are generated successfully; whitespace check has no output.

- [ ] **Step 3: Verify the final diff does not modify protected runtime content**

```powershell
git diff 998725d -- app/src/App.tsx app/src/main.tsx app/src/styles.css app/src/mobile app/vite.config.ts
```

Expected: no output.

- [ ] **Step 4: Commit documentation**

```powershell
git add README.md
git diff --cached --check
git commit -m "docs: explain wrongbook data management"
```

- [ ] **Step 5: Review branch state before pushing**

```powershell
git status --short
git log --oneline --decorate -10
git diff origin/codex/local-ocr...HEAD --stat
```

Expected: worktree is clean, the task commits are present in order, and the PR diff contains only the intended native app, automatic classification, data management, tests, and documentation changes.

## Plan Self-Review

- Spec coverage: search, edit, single delete, complete image backup, privacy warning, share/download fallback, 100 MB limit, strict validation, duplicate skipping, atomic import, double-confirmed clear, durable success boundaries, accessibility, and regression checks each map to a task and runnable test.
- Type consistency: Tasks 1-4 consistently use `StoredQuestion`, `createBackupBlob`, `parseBackupFile`, `updateQuestion`, `deleteQuestion`, `clearQuestions`, and `importQuestions` with the signatures declared in their interface blocks.
- Scope: image replacement, encryption, recycle bin, cloud sync, semantic deduplication, native filesystem plugins, and database-store migration remain explicitly excluded.
