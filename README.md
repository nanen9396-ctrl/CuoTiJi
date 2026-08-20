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

## 验证

```powershell
cd app
pnpm run test:model
pnpm run test:ocr
pnpm run test:prototype
pnpm run build
pnpm run test:sites
```

当前版本是本地优先的前端原型，尚未接入账号登录、云数据库或跨设备同步。浏览器数据被清除后，本地题库也会一并删除。

视觉比对记录见 [`app/design-qa.md`](app/design-qa.md)。
