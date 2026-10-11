import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("ships every prepared OCR resource unchanged in web and native builds", () => {
  const sourceDirectory = fileURLToPath(new URL("../public/ocr/v1/", import.meta.url));
  const files = readdirSync(sourceDirectory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(sourceDirectory, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
  assert.equal(files.length >= 18, true);
  for (const file of files) {
    const source = readFileSync(new URL(`../public/ocr/v1/${file}`, import.meta.url));
    for (const build of ["client", "native"]) {
      assert.deepEqual(readFileSync(new URL(`../dist/${build}/ocr/v1/${file}`, import.meta.url)), source, `${build}/${file}`);
    }
  }
});

test("defines a stable Capacitor app identity and both native projects", () => {
  const config = readFileSync(new URL("../capacitor.config.ts", import.meta.url), "utf8");
  assert.match(config, /appId:\s*["']com\.nanen9396\.ticang["']/);
  assert.match(config, /appName:\s*["']题仓["']/);
  assert.match(config, /webDir:\s*["']dist\/native["']/);
  assert.match(config, /SystemBars:\s*{[^}]*insetsHandling:\s*["']css["']/s);
  assert.equal(existsSync(new URL("../android/app/build.gradle", import.meta.url)), true);
  assert.equal(existsSync(new URL("../ios/App/App.xcodeproj/project.pbxproj", import.meta.url)), true);
  const nativeIndex = readFileSync(new URL("../dist/native/index.html", import.meta.url), "utf8");
  assert.match(nativeIndex, /data-native-shell="true"/);
  const nativeShellCss = readFileSync(new URL("../dist/native/native-shell.css", import.meta.url), "utf8");
  assert.match(nativeShellCss, /html\[data-native-shell="true"\] \.mobile-page\s*{[^}]*--keyboard-height:\s*0px\s*!important/s);
  assert.match(nativeShellCss, /--flow-header-safe-area:\s*var\(--safe-area-inset-top,\s*env\(safe-area-inset-top,\s*0px\)\)/);
  assert.match(nativeShellCss, /--mobile-safe-area-height:\s*var\(--safe-area-inset-bottom,\s*env\(safe-area-inset-bottom,\s*0px\)\)/);

  const infoPlist = readFileSync(new URL("../ios/App/App/Info.plist", import.meta.url), "utf8");
  assert.match(infoPlist, /<key>CFBundleDisplayName<\/key>\s*<string>题仓<\/string>/);
  assert.match(infoPlist, /<key>CFBundleURLSchemes<\/key>[\s\S]*<string>com\.nanen9396\.ticang<\/string>/);
  assert.match(infoPlist, /<key>NSCameraUsageDescription<\/key>\s*<string>用于拍摄错题并在本机识别和整理。<\/string>/);
  const privacyManifest = readFileSync(new URL("../ios/App/App/PrivacyInfo.xcprivacy", import.meta.url), "utf8");
  assert.match(privacyManifest, /NSPrivacyAccessedAPICategoryFileTimestamp/);
  assert.match(privacyManifest, /<string>C617\.1<\/string>/);
  const xcodeProject = readFileSync(new URL("../ios/App/App.xcodeproj/project.pbxproj", import.meta.url), "utf8");
  assert.equal(xcodeProject.match(/PRODUCT_BUNDLE_IDENTIFIER = com\.nanen9396\.ticang;/g)?.length, 2);
  assert.match(xcodeProject, /PrivacyInfo\.xcprivacy in Resources/);
  const swiftPackage = readFileSync(new URL("../ios/App/CapApp-SPM/Package.swift", import.meta.url), "utf8");
  assert.doesNotMatch(swiftPackage, /path:\s*"[^"]*\\/);
  assert.match(swiftPackage, /path:\s*"\.\.\/\.\.\/\.\.\/node_modules\//);

  const androidManifest = readFileSync(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
  assert.match(androidManifest, /android:allowBackup="false"/);
  const appGradle = readFileSync(new URL("../android/app/build.gradle", import.meta.url), "utf8");
  assert.match(appGradle, /namespace\s*=\s*["']com\.nanen9396\.ticang["']/);
  const androidStrings = readFileSync(new URL("../android/app/src/main/res/values/strings.xml", import.meta.url), "utf8");
  assert.match(androidStrings, /<string name="app_name">题仓<\/string>/);
  assert.match(androidStrings, /<string name="custom_url_scheme">com\.nanen9396\.ticang<\/string>/);
  const mainActivity = readFileSync(new URL("../android/app/src/main/java/com/nanen9396/ticang/MainActivity.java", import.meta.url), "utf8");
  assert.match(mainActivity, /^package com\.nanen9396\.ticang;/m);
});
