# Capacitor Production Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing React wrong-question app as Android and iOS projects while keeping the protected desktop preview runtime byte-for-byte intact.

**Architecture:** The ordinary Vite build remains `dist/client` and continues to power the framed design preview and Sites output. A new preparation script copies that verified client build to `dist/native`, marks the copied HTML with `data-native-shell="true"`, and Capacitor packages that directory. A scoped stylesheet flattens the preview frame, hides simulated device chrome, restores native cursors and safe-area variables, and disables simulated keyboard spacing only in the native copy.

**Tech Stack:** React 19, Vite 8, TypeScript 7, Playwright, Capacitor 8.5.0, Android API 36, iOS Xcode project.

## Global Constraints

- `mobile-runtime.lock.json` must continue to verify all 28 protected files.
- Use development application id `com.nanen9396.cuotiji` and app name `错题集`; confirm the final identifier before creating store records.
- Keep `dist/client` for Sites and use `dist/native` only for Capacitor.
- Do not add native camera or storage plugins in this phase.
- Generated Android and iOS source projects are committed; copied web assets and local build caches remain ignored.
- iOS archive and real-device validation require macOS with Xcode.

---

### Task 1: Add a scoped native presentation

**Files:**
- Create: `app/public/native-shell.css`
- Modify: `app/index.html`
- Modify: `app/tests/prototype/home.spec.ts`

**Interfaces:**
- Consumes: the `data-native-shell="true"` attribute on `<html>`.
- Produces: a full-viewport visible app with hidden preview picker, bezel, status bar, home indicator, fake keyboard, and cursor.

- [x] **Step 1: Write the failing browser test**

The test sets `document.documentElement.dataset.nativeShell = "true"`, expects the device picker to be hidden, and expects `phone-frame` bounds to equal the 1100 × 1100 test viewport.

- [x] **Step 2: Verify RED**

Run: `pnpm run test:prototype --grep "production app"`

Observed: FAIL because the preview device picker remained visible.

- [x] **Step 3: Implement scoped CSS**

Link `/native-shell.css` from `index.html`. Keep every production override under `html[data-native-shell="true"]`; use `!important` only where protected runtime inline geometry or custom properties must be replaced.

- [x] **Step 4: Verify GREEN**

Run: `pnpm run test:prototype --grep "production app"`

Observed: 1 test passed.

---

### Task 2: Generate a deterministic native build directory

**Files:**
- Create: `app/scripts/prepare-native-build.mjs`
- Modify: `app/package.json`
- Test: `app/tests/capacitor-config.test.mjs`

**Interfaces:**
- Consumes: `dist/client/index.html` from the verified Vite build.
- Produces: `dist/native/index.html` with `data-native-shell="true"` and an otherwise identical client asset tree.

- [x] **Step 1: Extend the failing native test**

Assert that `dist/native/index.html` exists and contains `data-native-shell="true"`.

- [x] **Step 2: Implement the preparation script**

Resolve fixed paths from the script location, verify `dist/client/index.html`, remove only `dist/native`, recursively copy the client directory, inject the attribute, and print the resulting path.

- [x] **Step 3: Add scripts**

Use:

```json
"prepare:native": "node scripts/prepare-native-build.mjs",
"native:sync": "pnpm run build && pnpm run prepare:native && cap sync"
```

- [x] **Step 4: Build and prepare**

Run: `pnpm run build` followed by `pnpm run prepare:native`.

Observed: protected runtime integrity passed for 28 files and `dist/native/index.html` was prepared.

---

### Task 3: Add Capacitor Android and iOS projects

**Files:**
- Create: `app/capacitor.config.ts`
- Create: `app/android/**`
- Create: `app/ios/**`
- Modify: `app/package.json`
- Modify: `app/pnpm-lock.yaml`
- Create: `app/tests/capacitor-config.test.mjs`

**Interfaces:**
- Produces: `{ appId: "com.nanen9396.cuotiji", appName: "错题集", webDir: "dist/native" }`, Android API 36 project, and iOS Xcode project.

- [x] **Step 1: Verify RED**

Run: `pnpm run test:native`.

Observed first failure: missing `capacitor.config.ts`; observed second failure: missing native project paths.

- [x] **Step 2: Install pinned Capacitor packages**

Install `@capacitor/core`, `@capacitor/android`, `@capacitor/ios`, and `@capacitor/cli` at `8.5.0` using the repository pnpm store.

- [x] **Step 3: Create config and platform projects**

Run `pnpm exec cap add android` and `pnpm exec cap add ios`, then build `dist/native` and run `pnpm exec cap sync`.

- [x] **Step 4: Verify GREEN**

Run: `pnpm run test:native`.

Observed: 1 test passed; both platforms received the native web assets and plugin configuration.

---

### Task 4: Document and verify

**Files:**
- Modify: `README.md`

- [x] **Step 1: Document native commands**

Document `pnpm run native:sync`, `pnpm run native:android`, and `pnpm run native:ios`; state the development app id and macOS/Xcode requirement.

- [x] **Step 2: Run verification**

Run model, OCR, prototype, runtime, native, Sites, build, runtime-integrity, and `git diff --check` checks. Expected: all exit 0; prototype 13/13; native 1/1; protected runtime 28/28.

- [x] **Step 3: Commit**

Commit the generated platform sources, configuration, tests, docs, and the reversion that restores the protected runtime.

## Plan Self-Review

- Spec coverage: desktop preview preservation, native presentation, isolated native assets, deterministic identity, both platforms, API 36, documentation, and verification are covered.
- Placeholder scan: no TBD or undefined implementation step remains.
- Type consistency: app id, app name, `dist/native`, scripts, and test assertions match.
