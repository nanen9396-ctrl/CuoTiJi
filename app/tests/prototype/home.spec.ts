import { expect, test } from "@playwright/test";

test("shows the camera-first wrong-question library home", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "错题集" })).toBeVisible();
  await expect(page.getByRole("button", { name: "拍照录入" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "我的题库" })).toBeVisible();
  await expect(page.getByRole("button", { name: "考研数学" })).toBeVisible();
  await expect(page.getByRole("button", { name: "公务员考试" })).toBeVisible();
  await expect(page.getByRole("button", { name: "高中课程" })).toBeVisible();
  await expect(page.getByRole("button", { name: "大学课程" })).toBeVisible();
  await expect(page.getByRole("button", { name: "全部错题" })).toBeVisible();
});

test("opens the photo capture flow from the primary action", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "拍照录入" }).click();

  await expect(page.getByRole("heading", { name: "拍照录入" })).toBeVisible();
  await expect(page.getByRole("button", { name: "模拟拍照并识别" })).toBeVisible();
  await expect(page.getByRole("button", { name: "返回" })).toBeVisible();
});

test("shows recognized text and manual classification fields after capture", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "拍照录入" }).click();
  await page.getByRole("button", { name: "模拟拍照并识别" }).click();

  await expect(page.getByRole("heading", { name: "确认错题" })).toBeVisible();
  await expect(page.getByText("识别完成")).toBeVisible();
  await expect(page.getByText("考试目标")).toBeVisible();
  await expect(page.getByRole("button", { name: "考研数学" })).toBeVisible();
  await expect(page.getByText("正确答案")).toBeVisible();
  await expect(page.getByText("个人笔记")).toBeVisible();
  await expect(page.getByRole("button", { name: "保存错题" })).toBeVisible();
});

test("saves the manually classified wrong question and returns home", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "拍照录入" }).click();
  await page.getByRole("button", { name: "模拟拍照并识别" }).click();
  await page.getByPlaceholder("记录错误原因或解题提醒").fill("先求导，再判断极值");
  await page.getByRole("button", { name: "保存错题" }).click();

  await expect(page.getByRole("heading", { name: "保存成功" })).toBeVisible();
  await expect(page.getByText("已归档到 考研数学 · 高等数学")).toBeVisible();
  await page.getByRole("button", { name: "返回首页" }).click();
  await expect(page.getByRole("heading", { name: "错题集" })).toBeVisible();
});

test("opens a library and starts a shuffled review", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "考研数学" }).click();

  await expect(page.getByRole("heading", { name: "考研数学" })).toBeVisible();
  await expect(page.getByTestId("flow-current").getByText("12 道错题")).toBeVisible();
  await page.getByRole("button", { name: "乱序刷题" }).click();

  await expect(page.getByRole("heading", { name: "刷错题" })).toBeVisible();
  await expect(page.getByText("第 1 / 3 题")).toBeVisible();
  await page.getByRole("button", { name: "显示答案" }).click();
  await expect(page.getByText(/^正确答案：/)).toBeVisible();
});
