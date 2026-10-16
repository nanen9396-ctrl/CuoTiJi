# 题仓

一款本地优先的手机端错题整理应用：拍照或选择图片后在浏览器内识别题目，确认科目与题型，自动归档，并支持顺序或乱序刷题。

## 当前可体验

- 拍照/相册导入入口与 Tesseract.js 本地 OCR
- 手动修正科目、题型、正确答案和个人笔记
- 按学习目标与科目分类归档；支持大学课程、考研、公务员及自定义考证目标/科目
- 题目文字、原图和分类结果保存到浏览器 IndexedDB，刷新后仍可使用
- 打开题库、顺序复习、乱序复习、显示答案
- 393 × 852 手机屏幕适配与键盘可访问交互

## 分类与复习

确认录入和编辑详情均可选择快捷项，或直接输入自定义学习目标/科目；已保存名称会成为后续快捷项。名称保存时去除两端空白，空值统一为“待分类”。首页自动显示已有自定义目标题库，并用“自定义目标”标识区分内置入口。

自动分类是保守的关键词建议：矩阵、英语等学科线索不会直接决定考试目标；不确定的字段进入“待分类”。“待分类”题库包含目标或科目任一未知的题，明确目标的题也仍可在该目标题库中找到。用户手动分类不会因修改题目文字被覆盖，历史题目不会自动重分类；数据库与完整备份继续兼容 v1。

## 本地运行

```powershell
cd app
pnpm install
pnpm dev
```

浏览器访问 `http://localhost:5173`。

Android 原生安装包内置中英文 OCR 模型与识别引擎，首次识别不需要从公网下载资源。网页版仍需先从本站加载页面和同源识别资源，并不承诺网页可在完全断网时启动。题目图片与识别结果只保存在当前设备/浏览器中，不会上传到应用服务器。单张图片须为常见图片格式且不超过 10 MB。

OCR 资源固定为 Tesseract.js / core 7.0.0 与中英文 `4.0.0_best_int` 模型。开发、构建和浏览器测试前会自动从锁定依赖生成 `app/public/ocr/v1/`（约 19.5 MB 未压缩资源，实际安装包增量取决于打包压缩），不从 CDN 动态加载识别引擎，也不复用旧的 IndexedDB 模型缓存。模型在构建时解压为 `.traineddata`，避免 Android 自动去除 `.gz` 后缀导致加载失败。首次安装开发依赖仍需联网；资源生成脚本不需要联网。若直接运行 Vite CLI，应先执行 `pnpm run prepare:ocr`。

请使用 pnpm 安装依赖：`pnpm install --frozen-lockfile` 会自动应用 `app/patches/tesseract.js@7.0.0.patch`，修复上游初始化失败后一直等待的问题，并释放失败的 worker。不要绕过 pnpm 用其他包管理器安装，否则模型加载失败的恢复行为没有保证。`pnpm run test:prototype` 包含真实 OCR 冷启动和模型加载失败后重试检查，不只是模拟识别结果。

当前仅验证印刷中英文的本地文字识别，手写和复杂公式仍需人工修正；图表通过原图保留，不是图片理解或 AI 解题。OCR 资源来源与已保留的上游声明见 [`app/resources/ocr-NOTICE.md`](app/resources/ocr-NOTICE.md)，完整商业再分发许可审查仍需另行完成。

## 数据管理

- 搜索覆盖题目、答案、笔记、考试目标、科目和题型。
- 可编辑或删除单道错题；编辑保留原图和录入时间。
- `.ticang.json` 完整备份包含原题图片，最大 100 MB，仅在本地生成和解析；旧版 `.cuotiji.json` 备份仍可导入。
- Android 与 iOS 使用系统分享面板导出备份，浏览器使用 Web Share 或文件下载。
- 导入不会覆盖相同 ID 的本机题目；批量写入失败时整体回滚。
- 备份未加密，可能包含照片和个人笔记，请妥善保管。

## 原生工程

项目已使用 Capacitor 8 生成 Android 与 iOS 工程，包名为 `com.nanen9396.ticang`。同步最新 Web 构建到两个原生工程：

```powershell
cd app
pnpm run native:sync
```

使用 `pnpm run native:android` 打开 Android Studio；使用 `pnpm run native:ios` 打开 Xcode。iOS 编译、签名、模拟器和真机验证必须在安装 Xcode 的 macOS 环境完成。

Android 发布配置使用包名 `com.nanen9396.ticang`、最低 Android 7.0（API 24）并面向 Android 16（API 36）。运行 `pnpm run test:release` 可检查这些配置以及签名密钥忽略规则；`.jks` 与 `.keystore` 文件不得提交到 Git。正式上架的签名 AAB 使用由发布者另行保管的上传密钥及密码。

Windows 命令行构建需要 JDK 21、Android SDK Platform 36 与 Build Tools 36。将本机 SDK 路径写入 Git 已忽略的 `app/android/local.properties`，再执行：

```powershell
cd app
pnpm run native:sync
$env:JAVA_HOME = '<JDK 21 安装目录>'
cd android
.\gradlew.bat --no-daemon assembleDebug bundleRelease
```

Debug APK 输出到 `app/android/app/build/outputs/apk/debug/app-debug.apk`；签名后的 Release AAB 输出到 `app/android/app/build/outputs/bundle/release/app-release.aab`。Windows 模拟器测试还需要启用 [Windows Hypervisor Platform](https://developer.android.com/studio/run/emulator-acceleration#vm-windows)，启用后通常需要重启。

构建 `assembleRelease bundleRelease` 后，在 `app` 目录运行 `.\scripts\verify-android-ocr.ps1`，逐文件核验 APK/AAB 中的识别资源和许可声明与准备目录一致。它验证最终安装包，不替代相机、飞行模式首次识别、系统分享与备份恢复的真机验收。

## 验证

```powershell
cd app
pnpm run test:model
pnpm run test:ocr
pnpm run test:prototype
pnpm run test:native
pnpm run test:release
pnpm run build
pnpm run test:sites
```

当前版本是本地优先的前端原型，尚未接入账号登录、云数据库或跨设备同步。浏览器数据被清除后，本地题库也会一并删除。

视觉比对记录见 [`app/design-qa.md`](app/design-qa.md)。
