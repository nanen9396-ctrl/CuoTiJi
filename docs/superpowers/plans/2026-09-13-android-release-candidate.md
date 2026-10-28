# Android Release Candidate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a reproducible Android 16 release-candidate build and prove that the app launches on an Android runtime without committing signing secrets.

**Architecture:** Keep the existing Vite → Capacitor → Gradle pipeline. Install Google's command-line SDK under the current Windows user profile, build an unsigned App Bundle plus a debug APK, and use ADB for the smallest useful runtime smoke test. Repository tests enforce release identity and secret-exclusion rules.

**Tech Stack:** React 19, Capacitor 8, Android Gradle Plugin, Android SDK 36, Gradle wrapper, Node test runner, ADB.

## Global Constraints

- Keep application ID `com.nanen9396.cuotiji`.
- Keep first-release version `versionCode 1` and `versionName "1.0"`.
- Keep `minSdkVersion 24`, `compileSdkVersion 36`, and `targetSdkVersion 36`.
- Never commit `.jks`, `.keystore`, passwords, tokens, or user-specific SDK paths.
- Install official Windows command-line tools package `15859902` and verify SHA-256 `90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a` before extraction.
- Build with the checked-in Gradle wrapper and JDK 17.
- Treat a signed Play upload bundle as a separate gate because the upload key and passwords require user custody.
- Keep iOS archive/signing outside this plan; Apple builds require macOS and Xcode 26 or later.

---

### Task 1: Add Android release guardrails

**Files:**
- Create: `app/tests/android-release.test.mjs`
- Modify: `app/android/.gitignore`
- Modify: `app/package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: current Gradle configuration and package scripts.
- Produces: `pnpm run test:release`, which verifies release identity, SDK levels, versioning, and keystore exclusion.

- [ ] **Step 1: Write the failing release test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("keeps the first Android release identity and secrets out of git", () => {
  const appGradle = readFileSync(new URL("../android/app/build.gradle", import.meta.url), "utf8");
  const variables = readFileSync(new URL("../android/variables.gradle", import.meta.url), "utf8");
  const ignore = readFileSync(new URL("../android/.gitignore", import.meta.url), "utf8");
  assert.match(appGradle, /applicationId\s+["']com\.nanen9396\.cuotiji["']/);
  assert.match(appGradle, /versionCode\s+1\b/);
  assert.match(appGradle, /versionName\s+["']1\.0["']/);
  assert.match(variables, /minSdkVersion\s*=\s*24\b/);
  assert.match(variables, /compileSdkVersion\s*=\s*36\b/);
  assert.match(variables, /targetSdkVersion\s*=\s*36\b/);
  assert.match(ignore, /^\*\.jks$/m);
  assert.match(ignore, /^\*\.keystore$/m);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd app; node --test tests/android-release.test.mjs`

Expected: FAIL because the keystore ignore lines are commented out.

- [ ] **Step 3: Add the minimum security and script changes**

Uncomment `*.jks` and `*.keystore` in `app/android/.gitignore`, add this package script, and document the command:

```json
"test:release": "node --test tests/android-release.test.mjs"
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `cd app; pnpm run test:release`

Expected: 1 test passes.

- [ ] **Step 5: Commit the guardrails**

```powershell
git add README.md app/android/.gitignore app/package.json app/tests/android-release.test.mjs
git commit -m "test: add Android release guardrails"
```

---

### Task 2: Install the Android SDK and build artifacts

**Files:**
- Local-only: `app/android/local.properties`
- Output: `app/android/app/build/outputs/apk/debug/app-debug.apk`
- Output: `app/android/app/build/outputs/bundle/release/app-release.aab`

**Interfaces:**
- Consumes: Google's verified command-line tools, JDK 17, `pnpm run native:sync`, and `app/android/gradlew.bat`.
- Produces: one installable debug APK and one unsigned release App Bundle.

- [ ] **Step 1: Download and verify official command-line tools**

Download `https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip` to a temporary directory, then run:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath $archive
```

Expected: `90AE805D20434428BFFCB699C290860F19BB5F66A67E6B330067E3DE801FB04A`.

- [ ] **Step 2: Install the minimum SDK packages**

Extract the verified archive to `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest`, explicitly accept Google's SDK licenses, then install:

```text
platform-tools
platforms;android-36
build-tools;36.0.0
```

- [ ] **Step 3: Point the local Gradle project at the SDK**

Create ignored `app/android/local.properties` with the forward-slash path:

```properties
sdk.dir=C:/Users/南派大星/AppData/Local/Android/Sdk
```

- [ ] **Step 4: Synchronize native assets and build**

Run:

```powershell
cd app
pnpm run native:sync
cd android
.\gradlew.bat assembleDebug bundleRelease
```

Expected: Gradle exits `0`; both artifact paths exist and have non-zero size.

- [ ] **Step 5: Verify package identity and debug APK signature**

Use SDK `aapt2 dump badging` to confirm package `com.nanen9396.cuotiji`, version code `1`, version name `1.0`, and SDK targets. Use `apksigner verify --verbose` on `app-debug.apk`.

---

### Task 3: Run the Android runtime smoke test

**Files:**
- No tracked files.

**Interfaces:**
- Consumes: `app-debug.apk`, ADB, and either a connected Android device or an API 36 emulator.
- Produces: launch/crash evidence and a device screenshot; it does not modify application data outside the test device.

- [ ] **Step 1: Detect a usable device**

Run: `adb devices -l`

Expected: at least one device in state `device`. If none is present, inspect Windows virtualization; only then install the emulator and `system-images;android-36;google_apis;x86_64`.

- [ ] **Step 2: Install and launch the debug APK**

```powershell
adb install -r app/android/app/build/outputs/apk/debug/app-debug.apk
adb shell monkey -p com.nanen9396.cuotiji -c android.intent.category.LAUNCHER 1
```

Expected: install reports `Success`; the foreground activity belongs to `com.nanen9396.cuotiji`.

- [ ] **Step 3: Check for startup crashes**

Clear Logcat before launch, launch once, and inspect `AndroidRuntime` plus the app process.

Expected: no `FATAL EXCEPTION`, `Process ... has died`, or uncaught Capacitor plugin error.

- [ ] **Step 4: Capture runtime evidence**

Save an ADB screenshot under ignored test output and visually confirm the home page, status-bar inset, and bottom safe area.

- [ ] **Step 5: Record hardware-only follow-ups**

The release handoff must explicitly require manual checks for camera capture, OCR model download/cache, backup system share sheet, import restore, process restart persistence, and airplane-mode behavior.

---

### Task 4: Final verification and PR update

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 1–3 evidence.
- Produces: a documented Android build command and an updated `codex/local-ocr` PR.

- [ ] **Step 1: Document reproducible build commands and artifact status**

State that the current AAB is unsigned and must not be uploaded until a user-controlled Play upload key is configured.

- [ ] **Step 2: Run full verification**

```powershell
cd app
pnpm run test:model
pnpm run test:ocr
pnpm run test:backup
pnpm run test:release
pnpm run test:sites
pnpm run test:runtime
pnpm run native:sync
pnpm run typecheck
pnpm run check:runtime
```

Expected: every command exits `0`, Playwright reports 54 passing tests, and native sync finds Filesystem and Share on Android and iOS.

- [ ] **Step 3: Verify the worktree and Android artifacts**

Run `git diff --check`, `git status --short`, and list the APK/AAB sizes.

- [ ] **Step 4: Commit and push**

```powershell
git add README.md app docs/superpowers/plans/2026-09-13-android-release-candidate.md
git commit -m "build: prepare Android release candidate"
git push origin codex/local-ocr
```

- [ ] **Step 5: Verify the Pull Request**

Confirm PR #1 remains open, mergeable, and points to the pushed commit.
