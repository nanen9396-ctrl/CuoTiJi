import { expect, test } from "@playwright/test";

test("persists an image question across a page reload", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("wrongbook");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }));

  const saved = await page.evaluate(async () => {
    const store = await import("/src/wrongbook-store.ts");
    await store.addQuestion({
      id: "persisted-1",
      prompt: "持久化题目",
      answer: "42",
      target: "考研数学",
      subject: "高等数学",
      note: "测试",
      createdAt: "2026-08-08T00:00:00.000Z",
      image: new Blob(["image"], { type: "image/png" }),
    });
    const [question] = await store.listQuestions();
    return {
      prompt: question.prompt,
      questionType: question.questionType,
      imageType: question.image.type,
      imageText: await question.image.text(),
    };
  });

  expect(saved).toEqual({
    prompt: "持久化题目",
    questionType: "解答题",
    imageType: "image/png",
    imageText: "image",
  });

  await page.reload();
  const count = await page.evaluate(async () => {
    const store = await import("/src/wrongbook-store.ts");
    return (await store.listQuestions()).length;
  });
  expect(count).toBe(1);
});

test("rejects a save when the IndexedDB transaction aborts after the request succeeds", async ({ page }) => {
  await page.goto("/");
  const rejected = await page.evaluate(async () => {
    const store = await import(`/src/wrongbook-store.ts?transaction-abort=${Date.now()}`);
    const openRequest: Record<string, unknown> = {};
    const addRequest: Record<string, unknown> = {};
    const transaction: Record<string, unknown> = {
      error: new DOMException("Quota exceeded", "QuotaExceededError"),
      objectStore: () => ({
        add: () => {
          queueMicrotask(() => {
            (addRequest.onsuccess as (() => void) | undefined)?.();
            setTimeout(() => (transaction.onabort as (() => void) | undefined)?.(), 0);
          });
          return addRequest;
        },
      }),
    };
    const fakeDatabase = {
      close: () => {},
      transaction: () => transaction,
    };
    const originalOpen = indexedDB.open;
    Object.defineProperty(indexedDB, "open", {
      configurable: true,
      value: () => {
        queueMicrotask(() => {
          openRequest.result = fakeDatabase;
          (openRequest.onsuccess as (() => void) | undefined)?.();
        });
        return openRequest;
      },
    });

    try {
      await store.addQuestion({
        id: "aborted-1",
        prompt: "不应成功",
        answer: "",
        target: "考研数学",
        subject: "高等数学",
        questionType: "解答题",
        note: "",
        createdAt: "2026-08-08T00:00:00.000Z",
        image: new Blob(["image"], { type: "image/png" }),
      });
      return false;
    } catch {
      return true;
    } finally {
      Object.defineProperty(indexedDB, "open", { configurable: true, value: originalOpen });
    }
  });

  expect(rejected).toBe(true);
});

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
