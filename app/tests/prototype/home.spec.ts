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

async function installControlledStoreWrite(page: Page) {
  await page.evaluate(() => {
    const originalOpen = indexedDB.open;
    const events: string[] = [];
    const openRequest: Record<string, unknown> = {};
    const writeRequest: Record<string, unknown> = {};
    let writeMethod = "";
    let writeValue: unknown;
    const transaction: Record<string, unknown> = {
      error: new DOMException("Quota exceeded", "QuotaExceededError"),
      objectStore: () => ({
        put: (value: unknown) => startWrite("put", value),
        delete: (value: unknown) => startWrite("delete", value),
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
        if (writeMethod === "put") await store.updateQuestion(writeValue as Parameters<typeof store.updateQuestion>[0]);
        if (writeMethod === "delete") await store.deleteQuestion(writeValue as string);
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
