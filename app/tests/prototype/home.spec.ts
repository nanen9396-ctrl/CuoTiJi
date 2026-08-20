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

test("shows the camera-first wrong-question library home", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "错题集" })).toBeVisible();
  await expect(page.getByRole("button", { name: "拍照录入" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "我的题库" })).toBeVisible();
  for (const title of ["考研数学", "公务员考试", "高中课程", "大学课程", "全部错题"]) {
    await expect(page.getByRole("button", { name: title })).toBeVisible();
  }
});

test("renders the production app without the preview device frame", async ({ page }) => {
  await page.goto("/?shell=native");

  await expect(page.getByRole("heading", { name: "错题集" })).toBeVisible();
  await expect(page.getByTestId("device-picker")).toHaveCount(0);
  await expect(page.getByTestId("mobile-app-viewport")).toHaveCount(0);
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
