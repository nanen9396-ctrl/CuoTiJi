# 题仓品牌升级实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有应用完整升级为“题仓”，同时保留旧版错题备份的导入能力和既有上传签名身份。

**Architecture:** 沿用现有 React、Capacitor、Android 和 iOS 工程结构，只替换品牌输出、公开应用标识及图标资源。备份层继续使用版本 `1`，新导出写入 `ticang`，解析器只额外接受旧的 `cuotiji`；图标生成器直接以已批准的半写实 PNG 为唯一母版，避免重新矢量化造成视觉偏差。

**Tech Stack:** React 19、TypeScript 7、Vite 8、Capacitor 8、Playwright、Node.js 原生测试、Android Gradle、iOS Xcode 工程

## Global Constraints

- 正式名称、安装名称、应用商店名称、软著简称和 APP 备案服务名称统一为“题仓”。
- 首页说明固定为“拍照归档错题，按目标与科目整理，高效复习”。
- Android、iOS、Capacitor 和 URL scheme 统一使用 `com.nanen9396.ticang`。
- 新备份文件名为 `ticang-YYYY-MM-DD.ticang.json`，格式标识为 `ticang`；导入器同时接受 `ticang` 和 `cuotiji`。
- 使用 `docs/superpowers/specs/assets/ticang-icon-approved.png` 作为图标唯一母版；不重新设计应用内页面。
- 继续使用现有 `.android/cuotiji-upload/` 签名密钥和 `CUOTIJI_KEYSTORE_PROPERTIES` 兼容入口，不生成或提交新密钥。
- 不增加依赖，不改错题数据模型、OCR、复习、分类、移动运行时或页面布局。
- Git 差异不得包含密钥、口令、付款资料或个人身份材料。

---

### Task 1: 更新品牌文案与备份兼容协议

**Files:**
- Modify: `tests/wrongbook-backup.test.mjs`
- Modify: `tests/prototype/home.spec.ts`
- Modify: `src/wrongbook-backup.ts`
- Modify: `src/Prototype.tsx`
- Modify: `index.html`

**Interfaces:**
- Consumes: 现有 `createBackupBlob(questions, exportedAt?)` 与 `parseBackupFile(file)`。
- Produces: 新导出格式 `ticang`、旧格式 `cuotiji` 兼容输入、题仓首页与备份分享文案。

- [ ] **Step 1: 为新备份格式和旧格式兼容写失败测试**

在 `tests/wrongbook-backup.test.mjs` 的往返测试中解析输出 JSON，并增加旧格式导入用例：

```js
const encodedDocument = JSON.parse(await encoded.text());
assert.equal(encodedDocument.format, "ticang");

test("imports legacy cuotiji version 1 backups", async () => {
  const legacy = new Blob([JSON.stringify({
    format: "cuotiji",
    version: 1,
    exportedAt: question.createdAt,
    questions: [{
      ...question,
      image: { type: "image/png", base64: "iVBORw==" },
    }],
  })]);
  const [restored] = await backup.parseBackupFile(legacy);
  assert.equal(restored.id, question.id);
});
```

保留已有的 `cuotiji` 异常版本测试，证明兼容输入仍执行版本校验。

- [ ] **Step 2: 更新端到端测试中的品牌输出断言**

在 `tests/prototype/home.spec.ts` 中把输出断言更新为：

```ts
await expect(page.getByRole("heading", { name: "题仓" })).toBeVisible();
await expect(page.getByText("拍照归档错题，按目标与科目整理，高效复习")).toBeVisible();
expect(download.suggestedFilename()).toMatch(/^ticang-\d{4}-\d{2}-\d{2}\.ticang\.json$/);
expect(trace?.shares[0]).toMatchObject({ title: "题仓完整备份", type: "application/json" });
expect(JSON.parse(trace?.shares[0].text ?? "{}").format).toBe("ticang");
```

用于兼容性验证的导入 fixture 继续使用 `format: "cuotiji"`；新增一个 `format: "ticang"` 导入 fixture，断言两者都能成功导入。

- [ ] **Step 3: 运行目标测试并确认失败原因正确**

Run:

```powershell
pnpm run test:backup
pnpm exec playwright test -c playwright.prototype.config.ts tests/prototype/home.spec.ts
```

Expected: 备份测试因输出仍为 `cuotiji` 失败，首页测试因标题、文件名和分享标题仍为旧品牌失败。

- [ ] **Step 4: 最小修改备份协议实现**

在 `src/wrongbook-backup.ts` 中使用精确联合类型，并仅放宽输入：

```ts
type BackupDocument = {
  format: "ticang";
  version: 1;
  exportedAt: string;
  questions: BackupQuestion[];
};

const acceptedBackupFormats = new Set(["ticang", "cuotiji"]);
```

创建文档时写入：

```ts
format: "ticang",
```

解析时改为：

```ts
if (!isRecord(value) || !acceptedBackupFormats.has(value.format as string)) {
  fail("不是题仓备份文件");
}
```

其余字段校验、100 MB 限制和图片恢复逻辑保持不变。

- [ ] **Step 5: 更新用户可见品牌文案**

在 `src/Prototype.tsx` 中使用以下精确输出：

```tsx
setBackupFile(new File([blob], `ticang-${date}.ticang.json`, { type: "application/json" }));
const shareData = { files: [backupFile], title: "题仓完整备份" };
```

Capacitor 分享标题和对话框分别改为：

```ts
title: "题仓完整备份",
dialogTitle: "分享或保存题仓备份",
```

首页标题与说明改为：

```tsx
<header className="home-intro">
  <h1>题仓</h1>
  <p>拍照归档错题，按目标与科目整理，高效复习</p>
</header>
```

在 `index.html` 中将文档标题改为 `<title>题仓</title>`。其他把“错题集”作为题目集合通用名词的文案保持不变。

- [ ] **Step 6: 运行测试并提交**

Run:

```powershell
pnpm run test:backup
pnpm exec playwright test -c playwright.prototype.config.ts tests/prototype/home.spec.ts
pnpm run typecheck
```

Expected: 全部退出码为 `0`，新旧两种备份格式均可导入，新导出只生成 `ticang`。

Commit:

```powershell
git add -- src/wrongbook-backup.ts src/Prototype.tsx index.html tests/wrongbook-backup.test.mjs tests/prototype/home.spec.ts
git commit -m "feat: rename app and preserve legacy backups"
```

---

### Task 2: 迁移 Capacitor、Android 与 iOS 应用标识

**Files:**
- Modify: `tests/capacitor-config.test.mjs`
- Modify: `tests/android-release.test.mjs`
- Modify: `capacitor.config.ts`
- Modify: `android/app/build.gradle`
- Modify: `android/app/src/main/res/values/strings.xml`
- Create: `android/app/src/main/java/com/nanen9396/ticang/MainActivity.java`
- Delete: `android/app/src/main/java/com/nanen9396/cuotiji/MainActivity.java`
- Modify: `ios/App/App/Info.plist`
- Modify: `ios/App/App.xcodeproj/project.pbxproj`

**Interfaces:**
- Consumes: Capacitor 的现有 `webDir` 和插件配置、现有 Android 上传签名配置。
- Produces: 所有公开原生身份统一为 `com.nanen9396.ticang`，显示名称统一为“题仓”。

- [ ] **Step 1: 为统一原生身份写失败测试**

在 `tests/capacitor-config.test.mjs` 中将配置断言改为：

```js
assert.match(config, /appId:\s*["']com\.nanen9396\.ticang["']/);
assert.match(config, /appName:\s*["']题仓["']/);
assert.match(infoPlist, /<key>CFBundleDisplayName<\/key>\s*<string>题仓<\/string>/);
assert.match(infoPlist, /<key>CFBundleURLSchemes<\/key>[\s\S]*<string>com\.nanen9396\.ticang<\/string>/);
assert.match(xcodeProject, /PRODUCT_BUNDLE_IDENTIFIER = com\.nanen9396\.ticang;/);
```

读取 Android Gradle、字符串与新 Java 路径，增加断言：

```js
assert.match(appGradle, /namespace\s*=\s*["']com\.nanen9396\.ticang["']/);
assert.match(androidStrings, /<string name="app_name">题仓<\/string>/);
assert.match(androidStrings, /<string name="custom_url_scheme">com\.nanen9396\.ticang<\/string>/);
assert.match(mainActivity, /^package com\.nanen9396\.ticang;/m);
```

在 `tests/android-release.test.mjs` 中只把公开 `applicationId` 断言改为 `com.nanen9396.ticang`；签名密钥路径和 `CUOTIJI_KEYSTORE_PROPERTIES` 断言保持原样。

- [ ] **Step 2: 运行原生身份测试并确认失败**

Run:

```powershell
pnpm run build
node --test --test-isolation=none tests/capacitor-config.test.mjs tests/android-release.test.mjs
```

Expected: 新名称、包标识、新 Java 路径和 iOS URL scheme 断言失败；签名保护断言仍通过。

- [ ] **Step 3: 更新 Capacitor 与 Android 身份**

在 `capacitor.config.ts` 中改为：

```ts
appId: "com.nanen9396.ticang",
appName: "题仓",
```

在 `android/app/build.gradle` 中改为：

```groovy
namespace = "com.nanen9396.ticang"
applicationId "com.nanen9396.ticang"
```

在 `android/app/src/main/res/values/strings.xml` 中写入：

```xml
<string name="app_name">题仓</string>
<string name="title_activity_main">题仓</string>
<string name="package_name">com.nanen9396.ticang</string>
<string name="custom_url_scheme">com.nanen9396.ticang</string>
```

把 `MainActivity.java` 移到 `com/nanen9396/ticang/` 并将首行改为：

```java
package com.nanen9396.ticang;
```

- [ ] **Step 4: 更新 iOS 身份和 URL scheme**

把 `ios/App/App.xcodeproj/project.pbxproj` 中 Debug 和 Release 的两处值改为：

```text
PRODUCT_BUNDLE_IDENTIFIER = com.nanen9396.ticang;
```

在 `ios/App/App/Info.plist` 中把显示名称改为“题仓”，并在顶层 `<dict>` 增加：

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.nanen9396.ticang</string>
    </array>
  </dict>
</array>
```

- [ ] **Step 5: 同步原生工程、复测并提交**

Run:

```powershell
pnpm run native:sync
pnpm run test:native
pnpm run test:release
```

Expected: 全部退出码为 `0`；Capacitor 不恢复旧包名；Android 签名配置仍指向现有私有密钥。

Commit:

```powershell
git add -- capacitor.config.ts tests/capacitor-config.test.mjs tests/android-release.test.mjs android/app/build.gradle android/app/src/main/res/values/strings.xml android/app/src/main/java ios/App/App/Info.plist ios/App/App.xcodeproj/project.pbxproj
git commit -m "feat: migrate native identity to Ticang"
```

---

### Task 3: 从已批准母版生成全平台图标

**Files:**
- Delete: `assets/app-icon.svg`
- Modify: `scripts/generate-app-icons.mjs`
- Modify: `tests/app-icon.test.mjs`
- Modify: `android/app/src/main/res/values/ic_launcher_background.xml`
- Replace: `android/app/src/main/res/mipmap-mdpi/ic_launcher.png`
- Replace: `android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png`
- Replace: `android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png`
- Replace: `android/app/src/main/res/mipmap-hdpi/ic_launcher.png`
- Replace: `android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png`
- Replace: `android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png`
- Replace: `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`
- Replace: `android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png`
- Replace: `android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png`
- Replace: `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`
- Replace: `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png`
- Replace: `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png`
- Replace: `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`
- Replace: `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png`
- Replace: `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png`
- Replace: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`

**Interfaces:**
- Consumes: 已批准的 `docs/superpowers/specs/assets/ticang-icon-approved.png`，SHA-256 为 `B2CF4F9229D7EFF13FFD5F6D2455BA6073CCB87B5C90C3A085A14CEC04E7A033`，尺寸为 `1254 × 1254`。
- Produces: `pnpm run generate:icons` 以及 Android/iOS 已提交的全部 launcher 图标。

- [ ] **Step 1: 把图标测试改为批准母版契约**

在 `tests/app-icon.test.mjs` 中引入 `createHash`，用以下断言替代旧 SVG 颜色和文字断言：

```js
import { createHash } from "node:crypto";

test("uses the approved Ticang icon master", () => {
  const master = read("docs/superpowers/specs/assets/ticang-icon-approved.png");
  assert.deepEqual(pngSize("docs/superpowers/specs/assets/ticang-icon-approved.png"), {
    width: 1254,
    height: 1254,
  });
  assert.equal(
    createHash("sha256").update(master).digest("hex").toUpperCase(),
    "B2CF4F9229D7EFF13FFD5F6D2455BA6073CCB87B5C90C3A085A14CEC04E7A033",
  );
});
```

把 adaptive background 断言改为 `#FFFFFF`。将 safe-zone 检查改为忽略接近白色的背景像素，只统计满足 `r < 245 || g < 245 || b < 245` 的主体像素；要求主体最大径向距离不超过 Android 108 dp 图层中心直径 66 dp 的圆形安全区（432 px 前景图的半径为 132 px）。

- [ ] **Step 2: 运行图标测试并确认失败**

Run:

```powershell
pnpm run test:icons
```

Expected: 旧生成资源和旧深蓝 adaptive background 不符合批准母版契约。

- [ ] **Step 3: 最小改造现有生成器**

在 `scripts/generate-app-icons.mjs` 中读取 PNG 并生成 data URL：

```js
const master = await readFile(path.join(
  root,
  "docs/superpowers/specs/assets/ticang-icon-approved.png",
));
const source = `data:image/png;base64,${master.toString("base64")}`;
```

对每个目标创建透明页面并渲染一个居中的 `<img>`：常规和圆形图标使用 `100%` 尺寸，圆形目标使用 `clip-path: circle(50%)`；adaptive foreground 使用 `52%` 尺寸和透明页面，使母版自身的白色背景与 `#FFFFFF` adaptive background 无缝衔接，同时把非白色粮仓主体留在 66 dp 圆形安全区。继续沿用现有 target 列表和 Playwright 截图，不增加图像依赖。

把 `android/app/src/main/res/values/ic_launcher_background.xml` 改为：

```xml
<color name="ic_launcher_background">#FFFFFF</color>
```

删除不再使用的 `assets/app-icon.svg`。

- [ ] **Step 4: 生成、测试并进行小尺寸目视检查**

Run:

```powershell
pnpm run generate:icons
pnpm run test:icons
```

Expected: 生成器报告 `Generated 16 app icon assets`，图标测试全部通过。

目视打开以下两个文件：

```text
android/app/src/main/res/mipmap-mdpi/ic_launcher.png
ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
```

确认 48 px Android 图标仍能识别蓝色书本粮仓和中央“题仓”，文字无遮挡，白底无灰边，iOS 1024 px 图标与批准母版构图一致。

- [ ] **Step 5: 提交图标资源**

```powershell
git add -- scripts/generate-app-icons.mjs tests/app-icon.test.mjs android/app/src/main/res ios/App/App/Assets.xcassets/AppIcon.appiconset assets/app-icon.svg
git commit -m "feat: install approved Ticang app icon"
```

---

### Task 4: 固化品牌方向并完成发布级验证

**Files:**
- Modify: `AGENTS.md`
- Generated but do not commit: `android/app/build/outputs/apk/release/app-release.apk`
- Generated but do not commit: `android/app/build/outputs/bundle/release/app-release.aab`

**Interfaces:**
- Consumes: 前三项任务的品牌、包名、备份和图标结果，以及现有私有上传密钥。
- Produces: 长期品牌约束、签名 APK/AAB 和完整验证记录。

- [ ] **Step 1: 更新长期品牌约束**

将 `AGENTS.md` 的 `Product Icon Direction` 改为：

```markdown
## Product Icon Direction

- The approved brand name is “题仓”; the home subtitle is “拍照归档错题，按目标与科目整理，高效复习”.
- The approved icon source is `docs/superpowers/specs/assets/ticang-icon-approved.png`: a semi-realistic blue book-granary on a clean white background, with warm yellow structural accents and vertical white “题仓” in the dark central doorway.
- Preserve the book-page doors, restrained wood detail, white background, clear small-size silhouette, and professional learning-tool tone.
- Do not add a camera, English subtitle, graduation cap, formulas, wheat, people, animals, landscape, or unrelated decoration.
```

- [ ] **Step 2: 扫描旧品牌残留并分类处理**

Run:

```powershell
rg -n --hidden -g '!node_modules/**' -g '!android/.gradle/**' -g '!android/app/build/**' "错题集|com\.nanen9396\.cuotiji|cuotiji-|错题集完整备份" .
```

Expected: 只允许以下残留：历史规格/计划、作为通用名词的产品文案、旧备份兼容测试和私有签名路径/变量；任何用户可见旧品牌或公开旧包名都必须删除。

- [ ] **Step 3: 运行完整自动化验证**

Run:

```powershell
pnpm run check:runtime
pnpm run typecheck
pnpm run build
pnpm run test:model
pnpm run test:backup
pnpm run test:ocr
pnpm run test:prototype
pnpm run test:runtime
pnpm run test:icons
pnpm run test:native
pnpm run test:release
pnpm run test:sites
```

Expected: 每条命令退出码为 `0`；不得通过改弱测试或运行时锁绕过失败。

- [ ] **Step 4: 生成签名 APK 和 AAB**

Run from `android/`:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat clean assembleRelease bundleRelease
```

Expected: 生成 `app/build/outputs/apk/release/app-release.apk` 与 `app/build/outputs/bundle/release/app-release.aab`，Gradle 输出 `BUILD SUCCESSFUL`。

- [ ] **Step 5: 验证签名、包名和敏感文件边界**

Run from `android/`:

```powershell
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$apksigner = Get-ChildItem -LiteralPath (Join-Path $sdkRoot 'build-tools') -Directory |
  Sort-Object { [version]$_.Name } |
  Select-Object -Last 1 |
  ForEach-Object { Join-Path $_.FullName 'apksigner.bat' }
& $apksigner verify --verbose --print-certs 'app/build/outputs/apk/release/app-release.apk'
& "$env:JAVA_HOME\bin\jarsigner.exe" -verify -verbose -certs 'app/build/outputs/bundle/release/app-release.aab'
```

Expected: APK 签名验证成功，证书 SHA-256 为 `DF:29:93:E3:DC:2F:7E:86:E3:B8:D5:A5:A6:D4:B3:4F:9E:5B:1D:66:D1:BA:F1:1A:07:DB:9D:A6:A3:2C:6B:72`；AAB 显示 `jar verified`。

Run:

```powershell
git status --short
git diff --check
git ls-files | rg "(?i)(keystore|\.jks$|keystore\.properties$|password|identity|payment)"
```

Expected: 无意外未提交文件、无空白错误、无密钥或敏感材料被 Git 跟踪。

- [ ] **Step 6: 提交品牌约束文档**

```powershell
git add -- AGENTS.md
git commit -m "docs: record Ticang brand direction"
```

提交后再次运行 `git status --short --branch`，Expected: 工作树干净，分支仅显示领先远端的预期提交数。
