#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(path.join(root, "assets/app-icon.svg"), "utf8");
const densities = [
  ["mdpi", 48, 108],
  ["hdpi", 72, 162],
  ["xhdpi", 96, 216],
  ["xxhdpi", 144, 324],
  ["xxxhdpi", 192, 432],
];
const targets = [
  {
    output: "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
    size: 1024,
  },
  ...densities.flatMap(([density, legacy, foreground]) => [
    {
      output: `android/app/src/main/res/mipmap-${density}/ic_launcher.png`,
      size: legacy,
    },
    {
      output: `android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`,
      size: legacy,
      round: true,
    },
    {
      output: `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`,
      size: foreground,
      foreground: true,
    },
  ]),
];

const browser = await chromium.launch();

try {
  for (const target of targets) {
    const page = await browser.newPage({
      viewport: { width: target.size, height: target.size },
    });
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg}`);

    const hasFont = await page.evaluate(() =>
      document.fonts.check('800 142px "Microsoft YaHei"'),
    );
    if (!hasFont) {
      throw new Error("Microsoft YaHei is required to generate the approved Chinese wordmark");
    }

    const icon = page.locator("svg");
    await icon.evaluate((node, options) => {
      node.setAttribute("width", String(options.size));
      node.setAttribute("height", String(options.size));
      node.style.display = "block";
      if (options.foreground) {
        node.querySelector("#icon-background").style.display = "none";
      }
      if (options.round) {
        node.style.clipPath = "circle(50% at 50% 50%)";
      }
    }, target);

    const output = path.join(root, target.output);
    await mkdir(path.dirname(output), { recursive: true });
    await icon.screenshot({
      path: output,
      omitBackground: Boolean(target.foreground || target.round),
    });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`Generated ${targets.length} app icon assets from assets/app-icon.svg.`);
