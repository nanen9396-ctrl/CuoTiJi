import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { chromium } from "@playwright/test";

const root = new URL("../", import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, root));

function pngSize(relativePath) {
  const bytes = read(relativePath);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function sampleAlpha(relativePath, points) {
  const dataUrl = `data:image/png;base64,${read(relativePath).toString("base64")}`;
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    return await page.evaluate(async ({ src, samplePoints }) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return samplePoints.map(([x, y]) => context.getImageData(x, y, 1, 1).data[3]);
    }, { src: dataUrl, samplePoints: points });
  } finally {
    await browser.close();
  }
}

async function alphaBounds(relativePath) {
  const dataUrl = `data:image/png;base64,${read(relativePath).toString("base64")}`;
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    return await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let left = image.width;
      let top = image.height;
      let right = -1;
      let bottom = -1;

      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          if (pixels[(y * image.width + x) * 4 + 3] === 0) continue;
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }

      return { left, top, right, bottom };
    }, dataUrl);
  } finally {
    await browser.close();
  }
}

test("master icon contains only the approved visual direction", () => {
  const svg = read("assets/app-icon.svg").toString("utf8");
  assert.match(svg, /#07163E/i);
  assert.match(svg, /#2B6CF0/i);
  assert.match(svg, /#F9D84A/i);
  assert.match(svg, />错题集<\/text>/);
  assert.doesNotMatch(svg, /gradient|filter|shadow/i);
});

test("iOS and Android launcher assets have exact platform dimensions", () => {
  assert.deepEqual(
    pngSize("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"),
    { width: 1024, height: 1024 },
  );

  for (const [density, legacy, foreground] of [
    ["mdpi", 48, 108],
    ["hdpi", 72, 162],
    ["xhdpi", 96, 216],
    ["xxhdpi", 144, 324],
    ["xxxhdpi", 192, 432],
  ]) {
    for (const name of ["ic_launcher.png", "ic_launcher_round.png"]) {
      assert.deepEqual(
        pngSize(`android/app/src/main/res/mipmap-${density}/${name}`),
        { width: legacy, height: legacy },
      );
    }
    assert.deepEqual(
      pngSize(`android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`),
      { width: foreground, height: foreground },
    );
  }
});

test("adaptive icon uses the approved solid background and generated foreground", () => {
  const colors = read("android/app/src/main/res/values/ic_launcher_background.xml").toString("utf8");
  assert.match(colors, /<color name="ic_launcher_background">#07163E<\/color>/);

  for (const file of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
    const xml = read(`android/app/src/main/res/mipmap-anydpi-v26/${file}`).toString("utf8");
    assert.match(xml, /@color\/ic_launcher_background/);
    assert.match(xml, /@mipmap\/ic_launcher_foreground/);
  }

  assert.equal(
    existsSync(new URL("android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml", root)),
    false,
  );
  assert.equal(
    existsSync(new URL("android/app/src/main/res/drawable/ic_launcher_background.xml", root)),
    false,
  );
});

test("full, round, and adaptive assets preserve their alpha contracts", async () => {
  assert.deepEqual(
    await sampleAlpha(
      "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
      [[0, 0], [512, 512], [1023, 1023]],
    ),
    [255, 255, 255],
  );
  assert.deepEqual(
    await sampleAlpha(
      "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png",
      [[0, 0], [96, 96]],
    ),
    [0, 255],
  );
  assert.deepEqual(
    await sampleAlpha(
      "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png",
      [[0, 0], [216, 216]],
    ),
    [0, 255],
  );
});

test("adaptive foreground artwork stays inside Android's guaranteed safe zone", async () => {
  const bounds = await alphaBounds(
    "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png",
  );
  const safeInset = 72;
  const safeEdge = 432 - safeInset - 1;

  assert.ok(bounds.left >= safeInset, `left edge ${bounds.left} exceeds the safe zone`);
  assert.ok(bounds.top >= safeInset, `top edge ${bounds.top} exceeds the safe zone`);
  assert.ok(bounds.right <= safeEdge, `right edge ${bounds.right} exceeds the safe zone`);
  assert.ok(bounds.bottom <= safeEdge, `bottom edge ${bounds.bottom} exceeds the safe zone`);
});
