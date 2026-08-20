import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("qa/home-implementation.png");
await mkdir(path.dirname(output), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});
const page = await browser.newPage({
  viewport: { width: 1400, height: 1200 },
  deviceScaleFactor: 1,
});

const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
const screen = page.getByTestId("device-screen");
await screen.waitFor({ state: "visible" });
const box = await screen.boundingBox();

if (!box || Math.abs(box.width - 393) > 1 || Math.abs(box.height - 852) > 1) {
  throw new Error(`Expected unscaled mobile screen at 393 x 852, got ${box?.width} x ${box?.height}`);
}

await screen.screenshot({ path: output });
await browser.close();

console.log(JSON.stringify({ output, box, consoleErrors }, null, 2));
