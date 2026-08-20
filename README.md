# 错题集 App

一个可交互的手机端错题整理原型：拍照后模拟识别题目，确认科目与题型，自动归档，并支持顺序或乱序刷题。

## 当前可体验

- 拍照/相册导入入口与模拟 OCR 流程
- 手动修正科目、题型、正确答案和个人笔记
- 按数学、语文、英语、物理、化学分类归档
- 打开题库、顺序复习、乱序复习、显示答案
- 393 × 852 手机屏幕适配与键盘可访问交互

## 本地运行

```powershell
cd app
pnpm install
pnpm dev
```

浏览器访问 `http://localhost:5173`。

## 验证

```powershell
cd app
pnpm run test:model
pnpm run test:prototype
pnpm run build
pnpm run test:sites
```

当前版本是前端交互原型。真实 OCR、账号登录、数据库与云同步尚未接入，待确认产品流程后进入下一阶段。

视觉比对记录见 [`app/design-qa.md`](app/design-qa.md)。
