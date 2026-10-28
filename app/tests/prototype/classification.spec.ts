import { expect, test, type Page } from "@playwright/test";

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2Y+WQAAAABJRU5ErkJggg==", "base64");

async function manualEntry(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "拍照录入" }).click();
  await page.getByTestId("gallery-input").setInputFiles({ name: "question.png", mimeType: "image/png", buffer: tinyPng });
  await page.getByRole("button", { name: "手动录入" }).click();
  await page.getByLabel("识别结果").fill("请完成这道题。");
}

test("saves custom classification, restores its library and reuses historic choices", async ({ page }) => {
  await manualEntry(page);
  await page.getByRole("textbox", { name: "学习目标", exact: true }).fill("  教师资格证  ");
  await page.getByRole("textbox", { name: "科目", exact: true }).fill("  教育知识与能力  ");
  await page.getByLabel("正确答案").fill("示例答案");
  await page.getByRole("button", { name: "保存错题", exact: true }).click();
  await expect(page.getByText("已归档到 教师资格证 · 教育知识与能力")).toBeVisible();
  await page.getByRole("button", { name: "返回首页" }).click();
  await page.reload();
  await page.getByRole("button", { name: "教师资格证（自定义题库）", exact: true }).click();
  await page.getByLabel("搜索错题").fill("教育知识与能力");
  await expect(page.getByRole("button", { name: /请完成这道题/ })).toBeVisible();
  await page.getByRole("button", { name: "乱序刷题" }).click();
  await expect(page.getByText("第 1 / 1 题")).toBeVisible();
  await expect(page.getByAltText("原题图片")).toBeVisible();
  await page.getByRole("button", { name: "显示答案" }).click();
  await expect(page.getByText("正确答案：示例答案")).toBeVisible();
  await manualEntry(page);
  await expect(page.getByRole("region", { name: "学习目标", exact: true }).getByRole("button", { name: "教师资格证", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "科目", exact: true }).getByRole("button", { name: "教育知识与能力", exact: true })).toBeVisible();
});

test("saves unknown and blank classification to the uncategorized library", async ({ page }) => {
  await manualEntry(page);
  await expect(page.getByRole("textbox", { name: "学习目标", exact: true })).toHaveValue("待分类");
  await expect(page.getByRole("textbox", { name: "科目", exact: true })).toHaveValue("待分类");
  await page.getByRole("textbox", { name: "学习目标", exact: true }).fill("  ");
  await page.getByRole("textbox", { name: "科目", exact: true }).fill("");
  await page.getByRole("button", { name: "保存错题", exact: true }).click();
  await expect(page.getByText("已归档到 待分类 · 待分类")).toBeVisible();
  await page.getByRole("button", { name: "返回首页" }).click();
  await page.getByRole("button", { name: "待分类", exact: true }).click();
  await expect(page.getByRole("button", { name: /请完成这道题/ })).toBeVisible();
});

test("edits custom classification without changing image or creation date", async ({ page }) => {
  await manualEntry(page);
  await page.getByRole("button", { name: "保存错题", exact: true }).click();
  await page.getByRole("button", { name: "返回首页" }).click();
  await page.getByRole("button", { name: "全部错题", exact: true }).click();
  await page.getByRole("button", { name: /请完成这道题/ }).click();
  const before = await page.evaluate(async () => {
    const [question] = await (await import("/src/wrongbook-store.ts")).listQuestions();
    return { id: question.id, createdAt: question.createdAt, image: Array.from(new Uint8Array(await question.image.arrayBuffer())) };
  });
  await page.getByRole("textbox", { name: "学习目标", exact: true }).fill("注册会计师");
  await page.getByRole("textbox", { name: "科目", exact: true }).fill("会计");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByRole("status")).toHaveText("已保存");
  await page.reload();
  await page.getByRole("button", { name: "注册会计师（自定义题库）", exact: true }).click();
  await page.getByRole("button", { name: /请完成这道题/ }).click();
  await expect(page.getByRole("textbox", { name: "学习目标", exact: true })).toHaveValue("注册会计师");
  await expect(page.getByRole("textbox", { name: "科目", exact: true })).toHaveValue("会计");
  const after = await page.evaluate(async () => {
    const [question] = await (await import("/src/wrongbook-store.ts")).listQuestions();
    return { id: question.id, createdAt: question.createdAt, image: Array.from(new Uint8Array(await question.image.arrayBuffer())) };
  });
  expect(after).toEqual(before);
});

test("changing question text does not overwrite manually selected classification", async ({ page }) => {
  await manualEntry(page);
  await page.getByRole("textbox", { name: "学习目标", exact: true }).fill("大学课程");
  await page.getByRole("textbox", { name: "科目", exact: true }).fill("大学英语");
  await page.getByLabel("识别结果").fill("公务员行测资料分析");
  await page.getByRole("button", { name: "保存错题", exact: true }).click();
  await expect(page.getByText("已归档到 大学课程 · 大学英语")).toBeVisible();
});

test("keeps long classification text within success, library and review content", async ({ page }) => {
  await manualEntry(page);
  await page.getByRole("textbox", { name: "学习目标", exact: true }).fill("CollegeQualification".repeat(6));
  await page.getByRole("textbox", { name: "科目", exact: true }).fill("EducationAndPsychology".repeat(8));
  await page.getByRole("button", { name: "保存错题", exact: true }).click();
  await expect(page.getByRole("heading", { name: "保存成功" })).toBeVisible();
  const fitsParent = (selector: string) => page.locator(selector).evaluate((element) =>
    element.clientWidth <= element.parentElement!.clientWidth
    && element.scrollWidth <= element.clientWidth,
  );
  await expect.poll(() => fitsParent(".success-content p")).toBe(true);
  await page.getByRole("button", { name: "返回首页" }).click();
  await page.getByRole("button", { name: "全部错题", exact: true }).click();
  await expect.poll(() => fitsParent(".question-row div")).toBe(true);
  await page.getByRole("button", { name: "顺序刷题" }).click();
  await expect.poll(() => fitsParent(".review-meta")).toBe(true);
});

test("keeps the keyboard between classification inputs and dismisses it on blur", async ({ page }) => {
  await manualEntry(page);
  await page.getByRole("textbox", { name: "学习目标", exact: true }).fill("大学课程");
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "true");
  await page.getByRole("textbox", { name: "科目", exact: true }).focus();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "true");
  await page.getByRole("heading", { name: "确认错题" }).click();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
});
