# Android Release Signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a private Android upload key outside Git and make every release bundle fail closed unless it is signed with that key.

**Architecture:** Follow Android's `keystore.properties` pattern while keeping the keystore and property file under the current user's private `.android/cuotiji-upload/` directory. Gradle loads that default file, accepts `CUOTIJI_KEYSTORE_PROPERTIES` as a CI override, leaves debug builds usable without credentials, and rejects release tasks when credentials are absent.

**Tech Stack:** Gradle Groovy DSL, Java `keytool`/`jarsigner`, Node.js test runner, Windows ACLs.

## Global Constraints

- Never commit the upload keystore or any signing password.
- Use alias `cuotiji-upload`, RSA 4096, SHA-256, and a validity of 10,000 days.
- Use the same generated strong password for the keystore and key, per the Android upload-key workflow.
- Keep debug builds usable on machines that do not have release credentials.
- Reject any requested Gradle release task when the configured properties file is absent or incomplete.
- Export only the public upload certificate for Play Console registration.

---

### Task 1: Add the fail-closed signing contract

**Files:**
- Modify: `tests/android-release.test.mjs`
- Modify: `android/.gitignore`
- Modify: `android/app/build.gradle`

**Interfaces:**
- Consumes: `CUOTIJI_KEYSTORE_PROPERTIES`, or `%USERPROFILE%/.android/cuotiji-upload/keystore.properties` when the environment variable is absent.
- Produces: a `release` signing configuration with `storeFile`, `storePassword`, `keyAlias`, and `keyPassword` loaded outside source control.

- [ ] **Step 1: Write the failing release-signing contract test**

Extend `tests/android-release.test.mjs` to require an active `keystore.properties` ignore rule, the environment override, the private default path, all four signing fields, and assignment of `signingConfigs.release` to the release build type.

- [ ] **Step 2: Run the test to verify the red state**

Run: `pnpm run test:release`

Expected: FAIL because `keystore.properties` is not ignored and `android/app/build.gradle` has no release signing configuration.

- [ ] **Step 3: Implement the minimal Gradle configuration**

Load the external properties file before `android {}`, validate the four required keys, reject requested release tasks when the file is missing, configure `signingConfigs.release`, and assign it only to `buildTypes.release`. Add `keystore.properties` to `android/.gitignore`.

- [ ] **Step 4: Run the test to verify green**

Run: `pnpm run test:release`

Expected: all release tests pass.

- [ ] **Step 5: Confirm debug builds remain credential-free**

Run: `./gradlew.bat --no-daemon assembleDebug` with `CUOTIJI_KEYSTORE_PROPERTIES` unset.

Expected: `BUILD SUCCESSFUL`.

---

### Task 2: Generate and verify the private upload identity

**Files:**
- Create outside Git: `%USERPROFILE%/.android/cuotiji-upload/upload-keystore.jks`
- Create outside Git: `%USERPROFILE%/.android/cuotiji-upload/keystore.properties`
- Create outside Git: `%USERPROFILE%/.android/cuotiji-upload/upload_certificate.pem`

**Interfaces:**
- Consumes: JDK 21 `keytool` and a cryptographically random 32-byte password.
- Produces: a reusable local upload key, its private Gradle property file, and its shareable public certificate.

- [ ] **Step 1: Create the protected credential directory and random password**

Create `%USERPROFILE%/.android/cuotiji-upload/`, restrict its ACL to the current user and SYSTEM, and generate the password with `RandomNumberGenerator.GetBytes(32)` without printing it.

- [ ] **Step 2: Generate the upload keystore**

Run `keytool -genkeypair` with alias `cuotiji-upload`, `RSA`, `4096`, `SHA256withRSA`, `JKS`, validity `10000`, and distinguished name `CN=CuoTiJi Upload, OU=Mobile, O=CuoTiJi, C=CN`.

- [ ] **Step 3: Write local properties and export the public certificate**

Write `storeFile`, `storePassword`, `keyAlias`, and `keyPassword` to the protected property file. Export `upload_certificate.pem` with `keytool -exportcert -rfc`.

- [ ] **Step 4: Build and verify the signed release bundle**

Run: `./gradlew.bat --no-daemon bundleRelease`

Expected: `BUILD SUCCESSFUL`, followed by `jarsigner -verify` reporting a verified signature rather than `jar unsigned`.

- [ ] **Step 5: Record non-secret certificate fingerprints**

Run: `keytool -list -v -keystore upload-keystore.jks -alias cuotiji-upload` without printing the password, and retain the SHA-1/SHA-256 fingerprints for Play Console comparison.

---

### Task 3: Verify and publish the safe configuration

**Files:**
- Verify: repository status, release bundle, and public certificate.

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: a signed AAB, a clean pushed branch, and an updated Pull Request without private material.

- [ ] **Step 1: Run project verification**

Run: `pnpm run check:runtime`, `pnpm run test:release`, `pnpm run test:icons`, and `pnpm run test:native`.

Expected: every command exits 0.

- [ ] **Step 2: Prove no credential is tracked**

Run: `git status --short`, `git check-ignore android/keystore.properties`, and inspect the staged diff for passwords, `.jks`, or `.keystore` files.

Expected: only plan, test, ignore, and Gradle configuration files are eligible for commit.

- [ ] **Step 3: Commit and push**

Commit message: `build: sign Android release bundles securely`

Push: `git push origin codex/local-ocr`

Expected: the remote branch and Pull Request head match local `HEAD`.
