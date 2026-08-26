import { expect, test, type Page } from "@playwright/test";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2Y+WQAAAABJRU5ErkJggg==",
  "base64",
);

async function stubOcr(page: Page, implementation: string) {
  await page.route("**/src/ocr.ts*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `export async function recognizeQuestion(image, onProgress, createWorkerFactory, signal) { ${implementation} }`,
  }));
}

async function openManualEntry(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "拍照录入" }).click();
  await page.getByTestId("gallery-input").setInputFiles({
    name: "question.png",
    mimeType: "image/png",
    buffer: tinyPng,
  });
  await expect(page.getByAltText("待识别题目")).toBeVisible();
  await page.getByRole("button", { name: "手动录入" }).click();
}

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

async function installControlledStoreWrite(page: Page) {
  await page.evaluate(async () => {
    const existingKeys = (await (await import("/src/wrongbook-store.ts")).listQuestions()).map(({ id }) => id);
    const originalOpen = indexedDB.open;
    const events: string[] = [];
    const openRequest: Record<string, unknown> = {};
    const keysRequest: Record<string, unknown> = {};
    const writeRequest: Record<string, unknown> = {};
    let writeMethod = "";
    let writeValue: unknown;
    const transaction: Record<string, unknown> = {
      error: new DOMException("Quota exceeded", "QuotaExceededError"),
      objectStore: () => ({
        getAllKeys: () => {
          queueMicrotask(() => {
            keysRequest.result = existingKeys;
            (keysRequest.onsuccess as (() => void) | undefined)?.();
          });
          return keysRequest;
        },
        add: (value: unknown) => startWrite("add", value),
        put: (value: unknown) => startWrite("put", value),
        delete: (value: unknown) => startWrite("delete", value),
        clear: () => startWrite("clear", undefined),
      }),
    };
    const startWrite = (method: string, value: unknown) => {
      writeMethod = method;
      writeValue = value;
      events.push(method);
      queueMicrotask(() => {
        events.push("request-success");
        (writeRequest.onsuccess as (() => void) | undefined)?.();
      });
      return writeRequest;
    };
    const restore = () => Object.defineProperty(indexedDB, "open", { configurable: true, value: originalOpen });
    const control = {
      events,
      complete: async () => {
        restore();
        const store = await import("/src/wrongbook-store.ts");
        if (writeMethod === "add") await store.addQuestion(writeValue as Parameters<typeof store.addQuestion>[0]);
        if (writeMethod === "put") await store.updateQuestion(writeValue as Parameters<typeof store.updateQuestion>[0]);
        if (writeMethod === "delete") await store.deleteQuestion(writeValue as string);
        if (writeMethod === "clear") await store.clearQuestions();
        events.push("transaction-complete");
        (transaction.oncomplete as (() => void) | undefined)?.();
      },
      abort: () => {
        events.push("transaction-abort");
        restore();
        (transaction.onabort as (() => void) | undefined)?.();
      },
    };
    (window as typeof window & { __storeWriteControl?: typeof control }).__storeWriteControl = control;
    Object.defineProperty(indexedDB, "open", {
      configurable: true,
      value: () => {
        events.push("open");
        queueMicrotask(() => {
          openRequest.result = {
            close: () => events.push("close"),
            transaction: () => transaction,
          };
          (openRequest.onsuccess as (() => void) | undefined)?.();
        });
        return openRequest;
      },
    });
  });
}

async function installControlledQuestionLoad(page: Page) {
  await page.addInitScript(() => {
    const openRequest: Record<string, unknown> = {};
    const getAllRequest: Record<string, unknown> = {};
    const database = {
      close: () => {},
      transaction: () => ({ objectStore: () => ({ getAll: () => getAllRequest }) }),
    };
    const control = {
      succeed: () => {
        getAllRequest.result = [];
        (getAllRequest.onsuccess as (() => void) | undefined)?.();
      },
      fail: () => {
        getAllRequest.error = new DOMException("Load failed", "UnknownError");
        (getAllRequest.onerror as (() => void) | undefined)?.();
      },
    };
    (window as typeof window & { __questionLoadControl?: typeof control }).__questionLoadControl = control;
    Object.defineProperty(indexedDB, "open", {
      configurable: true,
      value: () => {
        queueMicrotask(() => {
          openRequest.result = database;
          (openRequest.onsuccess as (() => void) | undefined)?.();
        });
        return openRequest;
      },
    });
  });
}

async function settleQuestionLoad(page: Page, result: "succeed" | "fail") {
  await page.evaluate((settlement) => {
    const control = (
      window as typeof window & { __questionLoadControl?: { succeed: () => void; fail: () => void } }
    ).__questionLoadControl;
    if (!control) throw new Error("Controlled question load is not installed");
    control[settlement]();
  }, result);
}

async function controlledStoreEvents(page: Page) {
  return page.evaluate(() => (
    window as typeof window & { __storeWriteControl?: { events: string[] } }
  ).__storeWriteControl?.events ?? []);
}

async function settleControlledStoreWrite(page: Page, result: "complete" | "abort") {
  await page.evaluate(async (settlement) => {
    const control = (
      window as typeof window & { __storeWriteControl?: { complete: () => Promise<void>; abort: () => void } }
    ).__storeWriteControl;
    if (!control) throw new Error("Controlled store write is not installed");
    await control[settlement]();
  }, result);
}

test("shows the camera-first wrong-question library home", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "错题集" })).toBeVisible();
  await expect(page.getByRole("button", { name: "拍照录入" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "我的题库" })).toBeVisible();
  for (const title of ["考研数学", "公务员考试", "高中课程", "大学课程", "全部错题"]) {
    await expect(page.getByRole("button", { name: title })).toBeVisible();
  }
});

test("generates then downloads an image-inclusive backup in two direct clicks", async ({ page }) => {
  await seedQuestion(page, { id: "backup-me", prompt: "备份题目" });
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: undefined }));
  await page.reload();
  await page.getByRole("button", { name: "数据管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "生成完整备份" }).click();
  await expect(page.getByRole("status")).toContainText("完整备份已生成");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "分享或下载" }).click();
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

test("locks question edits while clear-all is awaiting transaction completion", async ({ page }) => {
  await seedQuestion(page, { id: "clear-race", prompt: "清空竞态题目" });
  await page.reload();
  await page.getByRole("button", { name: "数据管理" }).click();
  await installControlledStoreWrite(page);
  const confirmations = answerDialogs(page, [true, true]);
  await page.getByRole("button", { name: "清空全部题库" }).click();
  await confirmations;
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "clear", "request-success"]);

  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: "全部错题" }).click();
  await page.getByRole("button", { name: /清空竞态题目/ }).click();
  const detail = page.getByTestId("flow-current");
  await expect(detail.getByLabel("题目文字")).toBeDisabled();
  await expect(detail.getByRole("button", { name: "保存修改" })).toBeDisabled();
  await expect(detail.getByRole("button", { name: "删除错题" })).toBeDisabled();

  await settleControlledStoreWrite(page, "complete");
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "clear", "request-success", "transaction-complete", "close"]);
  await expect(page.getByText("还没有错题，先拍照录入一道吧")).toBeVisible();
});

test("locks data management while a new question is awaiting transaction completion", async ({ page }) => {
  await openManualEntry(page);
  await installControlledStoreWrite(page);
  await page.getByLabel("识别结果").fill("延迟保存题目");
  await page.getByRole("button", { name: "保存错题" }).click();
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "add", "request-success"]);
  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: "数据管理" }).click();

  const management = page.getByTestId("flow-current");
  await expect(management.getByRole("button", { name: "生成完整备份" })).toBeDisabled();
  await expect(management.getByRole("button", { name: "分享或下载" })).toBeDisabled();
  await expect(management.getByRole("button", { name: "导入备份" })).toBeDisabled();
  await expect(management.getByRole("button", { name: "清空全部题库" })).toBeDisabled();

  await settleControlledStoreWrite(page, "complete");
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "add", "request-success", "transaction-complete", "close"]);
  await expect(page.getByText("当前共 1 道错题")).toBeVisible();
  await expect(management.getByRole("button", { name: "清空全部题库" })).toBeEnabled();
});

test("keeps every data action disabled until the initial question load succeeds", async ({ page }) => {
  await installControlledQuestionLoad(page);
  await page.goto("/");
  await page.getByRole("button", { name: "数据管理" }).click();
  const management = page.getByTestId("flow-current");
  for (const name of ["生成完整备份", "分享或下载", "导入备份", "清空全部题库"]) {
    await expect(management.getByRole("button", { name })).toBeDisabled();
  }

  await settleQuestionLoad(page, "succeed");
  for (const name of ["生成完整备份", "导入备份", "清空全部题库"]) {
    await expect(management.getByRole("button", { name })).toBeEnabled();
  }
  await expect(management.getByRole("button", { name: "分享或下载" })).toBeDisabled();
});

test("keeps every data action disabled when the initial question load fails", async ({ page }) => {
  await installControlledQuestionLoad(page);
  await page.goto("/");
  await page.getByRole("button", { name: "数据管理" }).click();
  await settleQuestionLoad(page, "fail");
  const management = page.getByTestId("flow-current");
  await expect(management.getByRole("alert")).toHaveText("本地题库加载失败，请刷新重试");
  for (const name of ["生成完整备份", "分享或下载", "导入备份", "清空全部题库"]) {
    await expect(management.getByRole("button", { name })).toBeDisabled();
  }
});

test("uses supported Web Share for the complete backup", async ({ page }) => {
  await seedQuestion(page, { id: "share-me", prompt: "分享备份题目" });
  await page.addInitScript(() => {
    const trace: { canShareCalls: number; shares: { title: string; name: string; type: string; text: string }[] } = { canShareCalls: 0, shares: [] };
    (window as typeof window & { __shareTrace?: typeof trace }).__shareTrace = trace;
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => { trace.canShareCalls += 1; return true; } });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => {
      const file = data.files?.[0];
      if (!file) throw new Error("Missing backup file");
      trace.shares.push({ title: data.title ?? "", name: file.name, type: file.type, text: await file.text() });
    } });
  });
  await page.reload();
  await page.getByRole("button", { name: "数据管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "生成完整备份" }).click();
  expect(await page.evaluate(() => (window as typeof window & { __shareTrace?: { shares: unknown[] } }).__shareTrace?.shares.length)).toBe(0);
  await page.getByRole("button", { name: "分享或下载" }).click();
  await expect(page.getByRole("status")).toHaveText("备份已导出");
  const trace = await page.evaluate(() => (window as typeof window & { __shareTrace?: { canShareCalls: number; shares: { title: string; name: string; type: string; text: string }[] } }).__shareTrace);
  expect(trace?.canShareCalls).toBe(1);
  expect(trace?.shares).toHaveLength(1);
  expect(trace?.shares[0]).toMatchObject({ title: "错题集完整备份", type: "application/json" });
  expect(trace?.shares[0].name).toMatch(/^cuotiji-\d{4}-\d{2}-\d{2}\.cuotiji\.json$/);
  expect(JSON.parse(trace?.shares[0].text ?? "{}").questions[0]).toMatchObject({ id: "share-me", image: { type: "image/png" } });
});

test("treats an AbortError from Web Share as cancellation", async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(window, "__shareCalls", { configurable: true, get: () => calls });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => {
      calls += 1;
      throw new DOMException("Share cancelled", "AbortError");
    } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "数据管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "生成完整备份" }).click();
  await page.getByRole("button", { name: "分享或下载" }).click();
  await expect(page.getByRole("button", { name: "分享或下载" })).toBeEnabled();
  expect(await page.evaluate(() => (window as typeof window & { __shareCalls?: number }).__shareCalls)).toBe(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("完整备份已生成");
});

test("surfaces non-cancellation Web Share failures", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => { throw new Error("系统分享失败"); } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "数据管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "生成完整备份" }).click();
  await page.getByRole("button", { name: "分享或下载" }).click();
  await expect(page.getByRole("alert")).toHaveText("系统分享失败");
  await expect(page.getByRole("status")).toContainText("完整备份已生成");
});

test("downloads and revokes the object URL when canShare rejects files", async ({ page }) => {
  await page.addInitScript(() => {
    const created: string[] = [];
    const revoked: string[] = [];
    let shareCalls = 0;
    const createObjectURL = URL.createObjectURL.bind(URL);
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: (blob: Blob) => {
      const url = createObjectURL(blob);
      created.push(url);
      return url;
    } });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: (url: string) => {
      revoked.push(url);
      revokeObjectURL(url);
    } });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => { shareCalls += 1; } });
    Object.defineProperty(window, "__fallbackTrace", { configurable: true, get: () => ({ created, revoked, shareCalls }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "数据管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "生成完整备份" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "分享或下载" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^cuotiji-\d{4}-\d{2}-\d{2}\.cuotiji\.json$/);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __fallbackTrace?: { created: string[]; revoked: string[]; shareCalls: number } }).__fallbackTrace)).toMatchObject({ shareCalls: 0, created: [expect.any(String)], revoked: [expect.any(String)] });
  const trace = await page.evaluate(() => (window as typeof window & { __fallbackTrace?: { created: string[]; revoked: string[]; shareCalls: number } }).__fallbackTrace);
  expect(trace?.revoked).toEqual(trace?.created);
});

test("invalidates a generated backup after imports and clear-all", async ({ page }) => {
  await seedQuestion(page, { id: "stale-backup", prompt: "生成备份时的题目" });
  await page.reload();
  await page.getByRole("button", { name: "数据管理" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "生成完整备份" }).click();
  await expect(page.getByRole("button", { name: "分享或下载" })).toBeEnabled();

  const document = {
    format: "cuotiji",
    version: 1,
    exportedAt: "2026-08-24T00:00:00.000Z",
    questions: [
      { id: "stale-import", prompt: "使备份失效的导入题目", answer: "", target: "高中课程", subject: "物理", questionType: "选择题", note: "", createdAt: "2026-08-24T00:00:00.000Z", image: { type: "image/png", base64: tinyPng.toString("base64") } },
    ],
  };
  await page.getByTestId("backup-input").setInputFiles({ name: "stale.cuotiji.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.getByRole("button", { name: "分享或下载" })).toBeDisabled();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "生成完整备份" }).click();
  await expect(page.getByRole("button", { name: "分享或下载" })).toBeEnabled();
  const confirmations = answerDialogs(page, [true, true]);
  await page.getByRole("button", { name: "清空全部题库" }).click();
  await confirmations;
  await expect(page.getByRole("button", { name: "分享或下载" })).toBeDisabled();
});

test("keeps imported state unchanged when the import transaction aborts", async ({ page }) => {
  await seedQuestion(page, { id: "import-abort-existing", prompt: "导入前题目" });
  await page.reload();
  await page.getByRole("button", { name: "数据管理" }).click();
  await installControlledStoreWrite(page);
  const document = {
    format: "cuotiji",
    version: 1,
    exportedAt: "2026-08-24T00:00:00.000Z",
    questions: [
      { id: "import-abort-new", prompt: "不得导入", answer: "", target: "高中课程", subject: "物理", questionType: "选择题", note: "", createdAt: "2026-08-24T00:00:00.000Z", image: { type: "image/png", base64: tinyPng.toString("base64") } },
    ],
  };
  await page.getByTestId("backup-input").setInputFiles({ name: "abort.cuotiji.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "add", "request-success"]);
  await settleControlledStoreWrite(page, "abort");
  await expect(page.getByRole("alert")).toHaveText("Quota exceeded");
  await expect(page.getByText("当前共 1 道错题")).toBeVisible();
  expect(await page.evaluate(async () => (await (await import("/src/wrongbook-store.ts")).listQuestions()).map(({ id }) => id))).toEqual(["import-abort-existing"]);
});

test("keeps cleared state unchanged when the clear transaction aborts", async ({ page }) => {
  await seedQuestion(page, { id: "clear-abort-existing", prompt: "清空前题目" });
  await page.reload();
  await page.getByRole("button", { name: "数据管理" }).click();
  await installControlledStoreWrite(page);
  const confirmations = answerDialogs(page, [true, true]);
  await page.getByRole("button", { name: "清空全部题库" }).click();
  await confirmations;
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "clear", "request-success"]);
  await settleControlledStoreWrite(page, "abort");
  await expect(page.getByRole("alert")).toHaveText("Quota exceeded");
  await expect(page.getByText("当前共 1 道错题")).toBeVisible();
  expect(await page.evaluate(async () => (await (await import("/src/wrongbook-store.ts")).listQuestions()).map(({ id }) => id))).toEqual(["clear-abort-existing"]);
});

test("renders the production app full-screen without visible preview chrome", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { document.documentElement.dataset.nativeShell = "true"; });

  await expect(page.getByRole("heading", { name: "错题集" })).toBeVisible();
  await expect(page.getByTestId("device-picker")).toBeHidden();
  const frame = await page.getByTestId("phone-frame").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  });
  expect(frame).toEqual({ x: 0, y: 0, width: 1100, height: 1100 });
});

test("offers separate camera and gallery inputs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "拍照录入" }).click();

  await expect(page.getByRole("heading", { name: "拍照录入" })).toBeVisible();
  await expect(page.getByRole("button", { name: "拍照", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "从相册选择" })).toBeVisible();
  await expect(page.getByTestId("camera-input")).toHaveAttribute("capture", "environment");
  await expect(page.getByTestId("gallery-input")).not.toHaveAttribute("capture");
});

test("previews a selected image and opens editable manual entry", async ({ page }) => {
  await openManualEntry(page);

  await expect(page.getByRole("heading", { name: "确认错题" })).toBeVisible();
  await expect(page.getByText("等待手动录入")).toBeVisible();
  await expect(page.getByLabel("识别结果")).toBeEditable();
  await expect(page.getByText("考试目标")).toBeVisible();
  await expect(page.getByText("正确答案")).toBeVisible();
  await expect(page.getByText("个人笔记")).toBeVisible();
});

test("rejects non-image and oversized files before OCR", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "拍照录入" }).click();

  await page.getByTestId("gallery-input").setInputFiles({
    name: "question.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByText("请选择图片文件")).toBeVisible();

  await page.getByTestId("gallery-input").setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(page.getByText("图片不能超过 10 MB")).toBeVisible();
});

test("saves a wrong question and restores it after reload", async ({ page }) => {
  await openManualEntry(page);
  await page.getByLabel("识别结果").fill("设函数 f(x)=x²，求导数。");
  await page.getByLabel("正确答案").fill("2x");
  await page.getByPlaceholder("记录错误原因或解题提醒").fill("注意幂函数求导公式");
  await page.getByRole("button", { name: "保存错题" }).click();

  await expect(page.getByRole("heading", { name: "保存成功" })).toBeVisible();
  await expect(page.getByText("考试目标", { exact: true })).toHaveCount(0);
  await expect(page.getByText("已归档到 考研数学 · 高等数学")).toBeVisible();
  await page.getByRole("button", { name: "返回首页" }).click();
  await page.reload();
  await page.getByRole("button", { name: "考研数学" }).click();

  await expect(page.getByTestId("flow-current").getByText("1 道错题")).toBeVisible();
  await expect(page.getByText("设函数 f(x)=x²，求导数。")).toBeVisible();
  await page.getByRole("button", { name: "乱序刷题" }).click();
  await expect(page.getByText("第 1 / 1 题")).toBeVisible();
  await expect(page.getByAltText("原题图片")).toBeVisible();
  await page.getByRole("button", { name: "显示答案" }).click();
  await expect(page.getByText("正确答案：2x")).toBeVisible();
});

test("disables review actions for an empty library", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "公务员考试" }).click();

  await expect(page.getByText("还没有错题，先拍照录入一道吧")).toBeVisible();
  await expect(page.getByRole("button", { name: "顺序刷题" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "乱序刷题" })).toBeDisabled();
});

test("searches every approved question field within the current library", async ({ page }) => {
  const cases = [
    { prompt: "题干字段", query: "mixedcase", values: { prompt: "题干字段 MIXEDCASE" } },
    { prompt: "答案字段", query: "答案唯一词", values: { answer: "答案唯一词" } },
    { prompt: "笔记字段", query: "笔记唯一词", values: { note: "笔记唯一词" } },
    { prompt: "目标字段", query: "考研数学", values: {} },
    { prompt: "科目字段", query: "线性代数", values: { subject: "线性代数" } },
    { prompt: "题型字段", query: "证明题", values: { questionType: "证明题" } },
  ];
  for (const [index, searchCase] of cases.entries()) {
    await seedQuestion(page, { id: `search-${index}`, prompt: searchCase.prompt, ...searchCase.values });
  }
  await seedQuestion(page, { id: "id-secret-needle", prompt: "不可搜索元数据", createdAt: "2099-created-secret" });
  await seedQuestion(page, { id: "excluded-group", prompt: "跨组唯一词", target: "高中课程" });
  await page.reload();
  await page.getByRole("button", { name: "考研数学" }).click();
  const search = page.getByRole("searchbox", { name: "搜索错题" });
  for (const searchCase of cases) {
    await search.fill(searchCase.query);
    await expect(page.getByRole("button", { name: new RegExp(searchCase.prompt) })).toBeVisible();
  }
  for (const excludedQuery of ["跨组唯一词", "id-secret-needle", "2099-created-secret"]) {
    await search.fill(excludedQuery);
    await expect(page.getByText("没有找到匹配的错题")).toBeVisible();
  }
});

test("edits a question while preserving its image identity fields", async ({ page }) => {
  await seedQuestion(page, { id: "edit-me", prompt: "原题", createdAt: "2026-08-20T00:00:00.000Z" });
  await page.reload();
  const originalImage = await page.evaluate(async () => {
    const stored = (await (await import("/src/wrongbook-store.ts")).listQuestions())[0];
    return { bytes: Array.from(new Uint8Array(await stored.image.arrayBuffer())), size: stored.image.size, type: stored.image.type };
  });
  await page.getByRole("button", { name: "全部错题" }).click();
  await page.getByRole("button", { name: /原题/ }).click();
  await expect(page.getByAltText("原题图片")).toBeVisible();
  await page.getByLabel("题目文字").fill("修改后的题目");
  await page.getByLabel("正确答案").fill("修改后的答案");
  await page.getByRole("button", { name: "线性代数", exact: true }).click();
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  const stored = await page.evaluate(async () => {
    const stored = (await (await import("/src/wrongbook-store.ts")).listQuestions())[0];
    return {
      id: stored.id,
      prompt: stored.prompt,
      createdAt: stored.createdAt,
      image: { bytes: Array.from(new Uint8Array(await stored.image.arrayBuffer())), size: stored.image.size, type: stored.image.type },
    };
  });
  expect(stored).toEqual({
    id: "edit-me",
    prompt: "修改后的题目",
    createdAt: "2026-08-20T00:00:00.000Z",
    image: originalImage,
  });

  await page.getByLabel("题目文字").fill("");
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByRole("alert")).toHaveText("请填写题目文字");
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("removes a delayed deletion from a live review queue and clamps the index", async ({ page }) => {
  await seedQuestion(page, { id: "review-first", prompt: "保留的第一题", createdAt: "2026-08-25T00:00:00.000Z" });
  await seedQuestion(page, { id: "review-delete", prompt: "复习中延迟删除", createdAt: "2026-08-24T00:00:00.000Z" });
  await page.reload();
  await page.getByRole("button", { name: "全部错题" }).click();
  await page.getByRole("button", { name: /复习中延迟删除/ }).click();
  await installControlledStoreWrite(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除错题" }).click();
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "delete", "request-success"]);
  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: "顺序刷题" }).click();
  await page.getByRole("button", { name: "下一题" }).click();
  const review = page.getByTestId("flow-current");
  await expect(review.getByRole("heading", { name: "复习中延迟删除" })).toBeVisible();

  await settleControlledStoreWrite(page, "complete");
  await expect(review.getByRole("heading", { name: "复习中延迟删除" })).toHaveCount(0);
  await expect(review.getByRole("heading", { name: "保留的第一题" })).toBeVisible();
  await expect(review.getByText("第 1 / 1 题")).toBeVisible();
  await expect(review.getByAltText("原题图片")).toBeVisible();
});

test("empties a live review queue when a delayed clear completes", async ({ page }) => {
  await seedQuestion(page, { id: "review-clear", prompt: "复习中延迟清空" });
  await page.reload();
  await page.getByRole("button", { name: "数据管理" }).click();
  await installControlledStoreWrite(page);
  const confirmations = answerDialogs(page, [true, true]);
  await page.getByRole("button", { name: "清空全部题库" }).click();
  await confirmations;
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "clear", "request-success"]);
  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: "全部错题" }).click();
  await page.getByRole("button", { name: "顺序刷题" }).click();
  const review = page.getByTestId("flow-current");
  await expect(review.getByRole("heading", { name: "复习中延迟清空" })).toBeVisible();

  await settleControlledStoreWrite(page, "complete");
  await expect(review.getByText("还没有可复习的错题")).toBeVisible();
  await expect(review.getByRole("heading", { name: "复习中延迟清空" })).toHaveCount(0);
  await expect(review.getByAltText("原题图片")).toHaveCount(0);
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
  await page.reload();
  await page.getByRole("button", { name: "全部错题" }).click();
  await expect(page.getByText("还没有错题，先拍照录入一道吧")).toBeVisible();
  expect(await page.evaluate(async () => (await (await import("/src/wrongbook-store.ts")).listQuestions()).length)).toBe(0);
});

test("does not pop the library when a delayed delete completes after leaving detail", async ({ page }) => {
  await seedQuestion(page, { id: "slow-delete", prompt: "延迟删除题目" });
  await page.reload();
  await page.getByRole("button", { name: "全部错题" }).click();
  await page.getByRole("button", { name: /延迟删除题目/ }).click();
  await installControlledStoreWrite(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除错题" }).click();
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "delete", "request-success"]);
  await page.getByRole("button", { name: "返回" }).click();
  await expect(page.getByRole("heading", { name: "全部错题" })).toBeVisible();

  await settleControlledStoreWrite(page, "complete");
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "delete", "request-success", "transaction-complete", "close"]);
  await page.waitForTimeout(300);
  await expect(page.getByRole("heading", { name: "全部错题" })).toBeVisible();
  await expect(page.getByTestId("flow-current").getByRole("searchbox", { name: "搜索错题" })).toBeVisible();
  await expect(page.getByTestId("flow-current").getByRole("button", { name: "拍照录入" })).toHaveCount(0);
});

test("closes a reopened detail when its delayed delete completes", async ({ page }) => {
  await seedQuestion(page, { id: "reopened-delete", prompt: "重开后删除题目" });
  await page.reload();
  await page.getByRole("button", { name: "全部错题" }).click();
  await page.getByRole("button", { name: /重开后删除题目/ }).click();
  await installControlledStoreWrite(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除错题" }).click();
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "delete", "request-success"]);
  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: /重开后删除题目/ }).click();
  await expect(page.getByRole("heading", { name: "错题详情" })).toBeVisible();

  await settleControlledStoreWrite(page, "complete");
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "delete", "request-success", "transaction-complete", "close"]);
  await expect(page.getByTestId("flow-current").getByRole("searchbox", { name: "搜索错题" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "全部错题" }).click();
  await expect(page.getByText("还没有错题，先拍照录入一道吧")).toBeVisible();
  expect(await page.evaluate(async () => (await (await import("/src/wrongbook-store.ts")).listQuestions()).length)).toBe(0);
});

test("locks editable detail controls until a delayed save is durable", async ({ page }) => {
  await seedQuestion(page, { id: "slow-save", prompt: "保存前题目" });
  await page.reload();
  await page.getByRole("button", { name: "全部错题" }).click();
  await page.getByRole("button", { name: /保存前题目/ }).click();
  await installControlledStoreWrite(page);
  await page.getByLabel("题目文字").fill("保存后题目");
  await page.getByLabel("正确答案").fill("一致答案");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "put", "request-success"]);

  const current = page.getByTestId("flow-current");
  for (const field of [current.getByLabel("题目文字"), current.getByLabel("正确答案"), current.getByPlaceholder("记录错误原因或解题提醒")]) {
    await expect(field).toBeDisabled();
  }
  const chips = current.locator("button.choice-chip");
  await expect(chips).toHaveCount(17);
  for (let index = 0; index < 17; index += 1) await expect(chips.nth(index)).toBeDisabled();
  await expect(current.getByRole("button", { name: "处理中…" })).toBeDisabled();
  await expect(current.getByRole("button", { name: "删除错题" })).toBeDisabled();

  await settleControlledStoreWrite(page, "complete");
  await expect(page.getByRole("status")).toHaveText("已保存");
  await expect(current.getByLabel("题目文字")).toBeEnabled();
  await expect(current.getByRole("button", { name: "保存修改" })).toBeEnabled();
  const coherent = await page.evaluate(async () => {
    const stored = (await (await import("/src/wrongbook-store.ts")).listQuestions())[0];
    return { prompt: stored.prompt, answer: stored.answer };
  });
  expect(coherent).toEqual({ prompt: "保存后题目", answer: "一致答案" });
  await expect(current.getByLabel("题目文字")).toHaveValue(coherent.prompt);
  await expect(current.getByLabel("正确答案")).toHaveValue(coherent.answer);
});

test("locks and synchronizes a reopened detail during a delayed save", async ({ page }) => {
  await seedQuestion(page, { id: "reopened-save", prompt: "版本 A", answer: "答案 A" });
  await page.reload();
  await page.getByRole("button", { name: "全部错题" }).click();
  await page.getByRole("button", { name: /版本 A/ }).click();
  await installControlledStoreWrite(page);
  await page.getByLabel("题目文字").fill("版本 B");
  await page.getByLabel("正确答案").fill("答案 B");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "put", "request-success"]);
  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: /版本 A/ }).click();

  const reopened = page.getByTestId("flow-current");
  await expect(reopened.getByLabel("题目文字")).toHaveValue("版本 A");
  await expect(reopened.getByLabel("题目文字")).toBeDisabled();
  await expect(reopened.getByRole("button", { name: "线性代数", exact: true })).toBeDisabled();
  await expect(reopened.getByRole("button", { name: "保存修改" })).toBeDisabled();
  await expect(reopened.getByRole("button", { name: "删除错题" })).toBeDisabled();

  await settleControlledStoreWrite(page, "complete");
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "put", "request-success", "transaction-complete", "close"]);
  await expect(reopened.getByLabel("题目文字")).toHaveValue("版本 B");
  await expect(reopened.getByLabel("正确答案")).toHaveValue("答案 B");
  await expect(reopened.getByLabel("题目文字")).toBeEnabled();
  await expect(reopened.getByRole("button", { name: "保存修改" })).toBeEnabled();
  await reopened.getByRole("button", { name: "保存修改" }).click();
  await expect(reopened.getByRole("status")).toHaveText("已保存");
  await page.reload();
  const durable = await page.evaluate(async () => {
    const stored = (await (await import("/src/wrongbook-store.ts")).listQuestions())[0];
    return { prompt: stored.prompt, answer: stored.answer };
  });
  expect(durable).toEqual({ prompt: "版本 B", answer: "答案 B" });
});

test("keeps question detail open when an edit transaction aborts", async ({ page }) => {
  await seedQuestion(page, { id: "edit-failure", prompt: "编辑失败题目" });
  await page.reload();
  await page.getByRole("button", { name: "全部错题" }).click();
  await page.getByRole("button", { name: /编辑失败题目/ }).click();
  await installControlledStoreWrite(page);
  await page.getByLabel("正确答案").fill("不应保存");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "put", "request-success"]);
  await settleControlledStoreWrite(page, "abort");

  await expect(page.getByRole("alert")).toHaveText("保存失败，请重试");
  await expect(page.getByRole("heading", { name: "错题详情" })).toBeVisible();
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "put", "request-success", "transaction-abort", "close"]);
  expect(await page.evaluate(async () => (await (await import("/src/wrongbook-store.ts")).listQuestions())[0].answer)).toBe("");
  await expect(page.getByLabel("正确答案")).toHaveValue("");
  await expect(page.getByLabel("正确答案")).toBeEnabled();
  await page.getByLabel("正确答案").fill("失败后可保存");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByRole("status")).toHaveText("已保存");
  expect(await page.evaluate(async () => (await (await import("/src/wrongbook-store.ts")).listQuestions())[0].answer)).toBe("失败后可保存");
});

test("keeps question detail open when a delete transaction aborts", async ({ page }) => {
  await seedQuestion(page, { id: "delete-failure", prompt: "删除失败题目" });
  await page.reload();
  await page.getByRole("button", { name: "全部错题" }).click();
  await page.getByRole("button", { name: /删除失败题目/ }).click();
  await installControlledStoreWrite(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除错题" }).click();
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "delete", "request-success"]);
  await settleControlledStoreWrite(page, "abort");

  await expect(page.getByRole("alert")).toHaveText("删除失败，请重试");
  await expect(page.getByRole("heading", { name: "错题详情" })).toBeVisible();
  await expect.poll(() => controlledStoreEvents(page)).toEqual(["open", "delete", "request-success", "transaction-abort", "close"]);
  expect(await page.evaluate(async () => (await (await import("/src/wrongbook-store.ts")).listQuestions())[0].id)).toBe("delete-failure");
});

test("shows OCR progress and opens the recognized text for correction", async ({ page }) => {
  await stubOcr(page, `
    onProgress({ status: "正在识别", progress: 0.5 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    return "识别出的题目";
  `);
  await page.goto("/");
  await page.getByRole("button", { name: "拍照录入" }).click();
  await page.getByTestId("gallery-input").setInputFiles({ name: "question.png", mimeType: "image/png", buffer: tinyPng });
  await page.getByRole("button", { name: "开始识别" }).click();

  await expect(page.getByText("正在识别")).toBeVisible();
  await expect(page.getByText("50%")).toBeVisible();
  await expect(page.getByRole("button", { name: "手动录入" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "确认错题" })).toBeVisible();
  await expect(page.getByLabel("识别结果")).toHaveValue("识别出的题目");
});

test("automatically classifies recognized questions and keeps the result editable", async ({ page }) => {
  await stubOcr(page, `return "设 A 为三阶矩阵，证明 A 的特征值均为实数。";`);
  await page.goto("/");
  await page.getByRole("button", { name: "拍照录入" }).click();
  await page.getByTestId("gallery-input").setInputFiles({ name: "question.png", mimeType: "image/png", buffer: tinyPng });
  await page.getByRole("button", { name: "开始识别" }).click();

  await expect(page.getByRole("heading", { name: "确认错题" })).toBeVisible();
  await expect(page.getByRole("button", { name: "考研数学", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "线性代数", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "证明题", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "大学课程", exact: true }).click();
  await page.getByRole("button", { name: "解答题", exact: true }).click();
  await expect(page.getByRole("button", { name: "大学课程", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "解答题", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("ignores a late OCR result after leaving the scan screen", async ({ page }) => {
  await stubOcr(page, `
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 300);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        window.__ocrAborted = true;
        reject(new DOMException("OCR aborted", "AbortError"));
      }, { once: true });
    });
    return "不应出现的旧题目";
  `);
  await page.goto("/");
  await page.getByRole("button", { name: "拍照录入" }).click();
  await page.getByTestId("gallery-input").setInputFiles({ name: "question.png", mimeType: "image/png", buffer: tinyPng });
  await page.getByRole("button", { name: "开始识别" }).click();
  await page.getByRole("button", { name: "返回" }).click();

  await page.waitForTimeout(400);
  await expect(page.getByRole("heading", { name: "错题集" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "确认错题" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { __ocrAborted?: boolean }).__ocrAborted)).toBe(true);
});

test("recovers from OCR errors with a clear fallback", async ({ page }) => {
  await stubOcr(page, `throw new Error("OCR failed");`);
  await page.goto("/");
  await page.getByRole("button", { name: "拍照录入" }).click();
  await page.getByTestId("gallery-input").setInputFiles({ name: "question.png", mimeType: "image/png", buffer: tinyPng });
  await page.getByRole("button", { name: "开始识别" }).click();

  await expect(page.getByText("识别失败，请重试或手动录入")).toBeVisible();
  await expect(page.getByRole("button", { name: "开始识别" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "手动录入" })).toBeEnabled();
});

test("explains an empty OCR result and keeps manual correction available", async ({ page }) => {
  await stubOcr(page, `return "";`);
  await page.goto("/");
  await page.getByRole("button", { name: "拍照录入" }).click();
  await page.getByTestId("gallery-input").setInputFiles({ name: "question.png", mimeType: "image/png", buffer: tinyPng });
  await page.getByRole("button", { name: "开始识别" }).click();

  await expect(page.getByText("未识别到清晰文字，请手动录入")).toBeVisible();
  await expect(page.getByLabel("识别结果")).toBeEditable();
});
