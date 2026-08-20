# Capacitor Production Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing framed browser prototype into a full-screen native application when it runs inside Capacitor, while preserving the desktop device preview for design QA.

**Architecture:** Keep the React feature flow unchanged. `App.tsx` selects the full-screen `Prototype` when `Capacitor.isNativePlatform()` is true or when a browser uses `?shell=native`; ordinary browser runs continue using `MobileRuntime`. Capacitor v8 packages the same Vite `dist` output into generated Android and iOS projects.

**Tech Stack:** React 19, Vite 8, TypeScript 7, Playwright, Capacitor 8, Android Gradle project, iOS Xcode project.

## Global Constraints

- Keep the existing desktop preview and its protected mobile runtime unchanged.
- Use development application id `com.nanen9396.cuotiji` and app name `错题集`; confirm the final identifier before creating store records.
- Use `dist` as Capacitor `webDir`.
- Do not add native camera or storage plugins in this phase; the existing standards-based file inputs and IndexedDB remain functional baselines.
- Generated native projects must be committed so later signing, privacy-manifest, and permission work has stable targets.
- iOS source may be generated on Windows, but archive and device validation require macOS with Xcode.

---

### Task 1: Select the production shell

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/tests/prototype/home.spec.ts`

**Interfaces:**
- Consumes: `Capacitor.isNativePlatform(): boolean`, browser query parameter `shell=native`.
- Produces: a full-screen app DOM without `data-testid="device-picker"` in native mode; existing framed preview otherwise.

- [ ] **Step 1: Write the failing browser test**

Append this case to `app/tests/prototype/home.spec.ts`:

```ts
test("renders the production app without the preview device frame", async ({ page }) => {
  await page.goto("/?shell=native");
  await expect(page.getByRole("heading", { name: "错题集" })).toBeVisible();
  await expect(page.getByTestId("device-picker")).toHaveCount(0);
  await expect(page.getByTestId("mobile-app-viewport")).toHaveCount(0);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm run test:prototype --grep "production app"`

Expected: FAIL because `MobileRuntime` still renders the device picker and mobile viewport.

- [ ] **Step 3: Implement the minimal shell switch**

Replace `app/src/App.tsx` with:

```tsx
import { Capacitor } from "@capacitor/core";
import { MobileRuntime } from "./mobile";
import Prototype from "./Prototype";

export default function App() {
  const nativeShell = Capacitor.isNativePlatform()
    || new URLSearchParams(window.location.search).get("shell") === "native";

  return nativeShell ? <Prototype /> : <MobileRuntime><Prototype /></MobileRuntime>;
}
```

- [ ] **Step 4: Run targeted and existing browser tests**

Run: `pnpm run test:prototype`

Expected: all prototype browser tests pass, including the production-shell case.

- [ ] **Step 5: Commit**

```powershell
git add app/src/App.tsx app/tests/prototype/home.spec.ts
git commit -m "feat: add full-screen production app shell"
```

---

### Task 2: Add Capacitor platforms

**Files:**
- Create: `app/capacitor.config.ts`
- Create: `app/android/**` through `pnpm exec cap add android`
- Create: `app/ios/**` through `pnpm exec cap add ios`
- Modify: `app/package.json`
- Modify: `app/pnpm-lock.yaml`
- Modify: `app/.gitignore`
- Create: `app/tests/capacitor-config.test.mjs`

**Interfaces:**
- Produces: Capacitor config `{ appId: "com.nanen9396.cuotiji", appName: "错题集", webDir: "dist" }`, `pnpm native:sync`, Android project, and iOS project.

- [ ] **Step 1: Write the failing configuration test**

Create `app/tests/capacitor-config.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("defines a stable Capacitor app identity and both native projects", () => {
  const config = readFileSync(new URL("../capacitor.config.ts", import.meta.url), "utf8");
  assert.match(config, /appId:\s*["']com\.nanen9396\.cuotiji["']/);
  assert.match(config, /appName:\s*["']错题集["']/);
  assert.match(config, /webDir:\s*["']dist["']/);
  assert.equal(existsSync(new URL("../android/app/build.gradle", import.meta.url)), true);
  assert.equal(existsSync(new URL("../ios/App/App.xcodeproj/project.pbxproj", import.meta.url)), true);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/capacitor-config.test.mjs`

Expected: FAIL with `ENOENT` for `capacitor.config.ts`.

- [ ] **Step 3: Install Capacitor v8 packages**

Run:

```powershell
pnpm add @capacitor/core@8 @capacitor/android@8 @capacitor/ios@8
pnpm add -D @capacitor/cli@8
```

Expected: dependencies and lockfile update successfully.

- [ ] **Step 4: Create the config and scripts**

Create `app/capacitor.config.ts`:

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.nanen9396.cuotiji",
  appName: "错题集",
  webDir: "dist",
};

export default config;
```

Add these scripts to `app/package.json`:

```json
"test:native": "node --test tests/capacitor-config.test.mjs",
"native:sync": "pnpm run build && cap sync",
"native:android": "pnpm run native:sync && cap open android",
"native:ios": "pnpm run native:sync && cap open ios"
```

- [ ] **Step 5: Generate both native projects**

Run:

```powershell
pnpm exec cap add android
pnpm exec cap add ios
pnpm run native:sync
```

Expected: Android and iOS projects exist and receive the current `dist` assets. On Windows, an iOS CocoaPods/Xcode-only warning is acceptable only if source generation and asset copy complete.

- [ ] **Step 6: Run the configuration test and verify GREEN**

Run: `pnpm run test:native`

Expected: 1 test passes.

- [ ] **Step 7: Commit**

```powershell
git add app/package.json app/pnpm-lock.yaml app/capacitor.config.ts app/android app/ios app/tests/capacitor-config.test.mjs app/.gitignore
git commit -m "build: add Capacitor mobile projects"
```

---

### Task 3: Verify the production shell deliverable

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: documented build and platform-opening commands for later native work.

- [ ] **Step 1: Document native prerequisites and commands**

Add a `原生工程` section explaining `pnpm run native:sync`, `pnpm run native:android`, and `pnpm run native:ios`, and state that iOS archiving requires macOS with Xcode.

- [ ] **Step 2: Run the full verification set**

Run:

```powershell
pnpm run test:model
pnpm run test:ocr
pnpm run test:prototype
pnpm run test:runtime
pnpm run test:native
pnpm run test:sites
pnpm run build
git diff --check
```

Expected: every command exits 0, prototype reports 13 passing tests, runtime reports 8 passing tests, native config reports 1 passing test, and the repository has no whitespace errors.

- [ ] **Step 3: Commit documentation**

```powershell
git add README.md docs/superpowers/plans/2026-08-20-capacitor-production-shell.md
git commit -m "docs: describe native app workflow"
```

## Plan Self-Review

- Spec coverage: production/full-screen selection, preserved preview, both platform projects, deterministic app identity, native scripts, documentation, and verification are each covered.
- Placeholder scan: no TBD, TODO, or undefined implementation step remains.
- Type consistency: `Capacitor.isNativePlatform`, `shell=native`, app id, app name, and `webDir` match across tests, implementation, and configuration.
