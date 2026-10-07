#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const master = await readFile(path.join(
  root,
  "docs/superpowers/specs/assets/ticang-icon-approved.png",
));
const source = `data:image/png;base64,${master.toString("base64")}`;
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
    await page.setContent(`<style>
      html,body{margin:0;width:100%;height:100%;background:transparent}
      body{display:grid;place-items:center}
      img{display:block;width:${target.foreground ? "52%" : "100%"};height:${target.foreground ? "52%" : "100%"};${target.round ? "clip-path:circle(50%)" : ""}}
    </style><img src="${source}">`);
    await page.locator("img").evaluate((image) => image.decode());

    const output = path.join(root, target.output);
    await mkdir(path.dirname(output), { recursive: true });
    await page.screenshot({
      path: output,
      omitBackground: Boolean(target.foreground || target.round),
    });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`Generated ${targets.length} app icon assets from the approved PNG master.`);
