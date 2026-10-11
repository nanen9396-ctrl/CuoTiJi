import { expect, test } from "@playwright/test";

test("recognizes printed Chinese and English on a cold start without public network requests", async ({ page, context, baseURL }) => {
  test.setTimeout(90_000);
  const origin = new URL(baseURL!).origin;
  const externalRequests: string[] = [];
  const localRequests: string[] = [];
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (!/^https?:$/.test(url.protocol)) return;
    if (url.origin === origin) localRequests.push(url.pathname);
    else externalRequests.push(url.href);
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return /^https?:$/.test(url.protocol) && url.origin !== origin
      ? route.abort("internetdisconnected")
      : route.continue();
  });

  await page.goto("/");
  const png = await page.evaluate(async () => {
    await document.fonts.ready;
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 360;
    const drawing = canvas.getContext("2d")!;
    drawing.fillStyle = "white";
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.fillStyle = "black";
    drawing.font = '64px "Microsoft YaHei", sans-serif';
    drawing.fillText("Solve the equation: x + 2 = 5", 50, 110);
    drawing.fillText("求方程的解。", 50, 230);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByRole("button", { name: "拍照录入" }).click();
  await page.getByTestId("gallery-input").setInputFiles({
    name: "printed-question.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page.getByRole("button", { name: "开始识别" }).click();
  await expect(page.getByLabel("识别结果")).toHaveValue(/Solve/i, { timeout: 60_000 });
  await expect(page.getByLabel("识别结果")).toHaveValue(/求/);
  expect(externalRequests).toEqual([]);
  expect(localRequests).toContain("/ocr/v1/worker.min.js");
  expect(localRequests.some((url) => /\/ocr\/v1\/core\/tesseract-core.*-lstm\.wasm\.js$/.test(url))).toBe(true);
  expect(localRequests).toContain("/ocr/v1/lang/chi_sim.traineddata");
  expect(localRequests).toContain("/ocr/v1/lang/eng.traineddata");
});

test("keeps manual entry available and can retry after a local model fails to load", async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/ocr/v1/lang/*.traineddata", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await page.goto("/");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 200;
    const drawing = canvas.getContext("2d")!;
    drawing.fillStyle = "white";
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.fillStyle = "black";
    drawing.font = "64px sans-serif";
    drawing.fillText("Solve the equation: x + 2 = 5", 50, 110);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByRole("button", { name: "拍照录入" }).click();
  await page.getByTestId("gallery-input").setInputFiles({
    name: "retry-question.png", mimeType: "image/png", buffer: Buffer.from(png, "base64"),
  });
  await page.getByRole("button", { name: "开始识别" }).click();
  await expect(page.getByRole("alert")).toHaveText("识别失败，请重试或手动录入", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "手动录入" })).toBeEnabled();
  await page.unroute("**/ocr/v1/lang/*.traineddata");
  await page.getByRole("button", { name: "开始识别" }).click();
  await expect(page.getByLabel("识别结果")).toHaveValue(/Solve/i, { timeout: 60_000 });
});
