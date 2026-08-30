import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("defines a stable Capacitor app identity and both native projects", () => {
  const config = readFileSync(new URL("../capacitor.config.ts", import.meta.url), "utf8");
  assert.match(config, /appId:\s*["']com\.nanen9396\.cuotiji["']/);
  assert.match(config, /appName:\s*["']错题集["']/);
  assert.match(config, /webDir:\s*["']dist\/native["']/);
  assert.equal(existsSync(new URL("../android/app/build.gradle", import.meta.url)), true);
  assert.equal(existsSync(new URL("../ios/App/App.xcodeproj/project.pbxproj", import.meta.url)), true);
  const nativeIndex = readFileSync(new URL("../dist/native/index.html", import.meta.url), "utf8");
  assert.match(nativeIndex, /data-native-shell="true"/);
  const nativeShellCss = readFileSync(new URL("../dist/native/native-shell.css", import.meta.url), "utf8");
  assert.match(nativeShellCss, /html\[data-native-shell="true"\] \.mobile-page\s*{[^}]*--keyboard-height:\s*0px\s*!important/s);

  const infoPlist = readFileSync(new URL("../ios/App/App/Info.plist", import.meta.url), "utf8");
  assert.match(infoPlist, /<key>NSCameraUsageDescription<\/key>\s*<string>用于拍摄错题并在本机识别和整理。<\/string>/);

  const androidManifest = readFileSync(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
  assert.match(androidManifest, /android:allowBackup="false"/);
});
