# 错题集 App

一个可交互的手机端错题整理原型：拍照或选择图片后在浏览器内识别题目，确认科目与题型，自动归档，并支持顺序或乱序刷题。

## 当前可体验

- 拍照/相册导入入口与 Tesseract.js 本地 OCR
- 手动修正科目、题型、正确答案和个人笔记
- 按数学、语文、英语、物理、化学分类归档
- 题目文字、原图和分类结果保存到浏览器 IndexedDB，刷新后仍可使用
- 打开题库、顺序复习、乱序复习、显示答案
- 393 × 852 手机屏幕适配与键盘可访问交互

## 本地运行

```powershell
cd app
pnpm install
pnpm dev
```

浏览器访问 `http://localhost:5173`。

首次识别需要联网下载中文 OCR 模型，之后浏览器可复用缓存。题目图片与识别结果只保存在当前浏览器中，不会上传到应用服务器。单张图片须为常见图片格式且不超过 10 MB。

## 数据管理

- 搜索覆盖题目、答案、笔记、考试目标、科目和题型。
- 可编辑或删除单道错题；编辑保留原图和录入时间。
- `.cuotiji.json` 完整备份包含原题图片，最大 100 MB，仅在本地生成和解析。
- Android 与 iOS 使用系统分享面板导出备份，浏览器使用 Web Share 或文件下载。
- 导入不会覆盖相同 ID 的本机题目；批量写入失败时整体回滚。
- 备份未加密，可能包含照片和个人笔记，请妥善保管。

## 原生工程

项目已使用 Capacitor 8 生成 Android 与 iOS 工程，开发包名为 `com.nanen9396.cuotiji`。同步最新 Web 构建到两个原生工程：

```powershell
cd app
pnpm run native:sync
```

使用 `pnpm run native:android` 打开 Android Studio；使用 `pnpm run native:ios` 打开 Xcode。iOS 编译、签名、模拟器和真机验证必须在安装 Xcode 的 macOS 环境完成。正式创建商店记录前需确认最终包名。

Android 发布配置使用包名 `com.nanen9396.cuotiji`、最低 Android 7.0（API 24）并面向 Android 16（API 36）。运行 `pnpm run test:release` 可检查这些配置以及签名密钥忽略规则；`.jks` 与 `.keystore` 文件不得提交到 Git。正式上架的签名 AAB 需要由发布者另行保管上传密钥及密码。

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
