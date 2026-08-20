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
    return { prompt: question.prompt, imageType: question.image.type, imageText: await question.image.text() };
  });

  expect(saved).toEqual({ prompt: "持久化题目", imageType: "image/png", imageText: "image" });

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
