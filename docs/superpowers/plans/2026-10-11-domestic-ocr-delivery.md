# 国内 OCR 资源交付实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Android 安装包包含首次中英文 OCR 所需资源，识别不再依赖公网 CDN，并留下真实引擎回归检查。

**Architecture:** 保留 Tesseract.js 7.0.0 和 LSTM 模式。构建前从锁定的依赖复制 worker、三种 LSTM core 和中英文 best_int 数据到 `public/ocr/v1`，现有 Vite/Capacitor 流程负责随产物分发。浏览器版从同源获取资源，不承诺网页本身可离线启动；原生版资源随安装包提供。

**Tech Stack:** React / TypeScript / Tesseract.js 7.0.0 / Node 原生文件 API / Playwright / Capacitor 8。

## Global Constraints

- 在既有 `.worktrees/local-ocr` 的 `codex/local-ocr` 分支实施，不编辑根目录 main 的用户文件。
- 不修改 app/AGENTS.md 列出的受保护运行时，不新增框架、服务端或付费服务。
- 不更换识别引擎或默认模型质量；固定 `@tesseract.js-data/chi_sim` 和 `@tesseract.js-data/eng` 的 `1.0.0` 包。
- 仅使用本地/同源 worker、core、lang 路径；不设置公网回退。
- 保持现有原图、取消、错误后的重试和手动录入行为。
- 保留分发资源的上游许可和来源；生成资源不重复提交，依赖锁文件必须提交。
- 真机验收、手写/公式准确率和 iOS 编译不属于自动测试结论。

## Task 1: 冷启动真实 OCR 回归检查

**Files:** Create `app/tests/prototype/ocr-offline.spec.ts`.

- [x] 用页面 canvas 生成自编中英文印刷题图片，上传后调用真实 OCR，不 stub ocr.ts。
- [x] 拦截并记录全部非同源 http(s) 请求，包括 Worker；断言没有公网请求，且结果包含 `Solve` 和 `求`。
- [x] 新浏览器上下文没有 OCR IndexedDB 缓存；断言请求了同源 worker、任一种 LSTM core、中英 traineddata。
- [x] 运行 `pnpm exec playwright test -c playwright.prototype.config.ts ocr-offline.spec.ts`；旧实现因 CDN Worker 被阻断、无法得到结果失败，修正后通过。

## Task 2: 最小本地资源准备与接线

**Files:** Create `app/scripts/prepare-ocr-assets.mjs`; modify `app/package.json`, `app/pnpm-lock.yaml`, `app/.gitignore`, `app/src/ocr.ts`.

- [x] 固定两个模型包 `1.0.0`，锁文件包含完整性信息。
- [x] Node 脚本用 createRequire 解析依赖位置，复制 worker、许可证、三种 LSTM core；将 `4.0.0_best_int/*.traineddata.gz` 构建期解压为 `.traineddata`。缺资源立即构建失败。
- [x] 启动/构建/浏览器测试前执行准备脚本；忽略生成目录，保留 runtime check。
- [x] createWorker 指向同源 `/ocr/v1/` 路径；禁用模型缓存、设置 `gzip:false`，清除已知旧生成 `.gz`，避免 Android 资源合并自动去后缀造成路径失配。
- [x] OCR 进度状态映射为中文；补丁使模型/API 初始化失败可释放 worker 并拒绝 Promise，交由页面显示失败重试入口。
- [x] `test:ocr` 4 项通过；真实冷启动与 503 后重试两项通过。

## Task 3: 构建产物验证与交付记录

**Files:** Modify `README.md`; create `app/tests/ocr-assets.test.mjs`; update this plan with results.

- [x] 验证源依赖与 public 内容一致（模型比较解压字节）；递归核验全部 18 个资源进入 dist/client 和 dist/native。
- [x] 更新 README，说明同源/原生离线边界、约 19.5 MB 原始资源、模型局限、pnpm 补丁与构建步骤。
- [x] typecheck、OCR 4、模型 10、备份 7、native 5、release 5、Sites 4、图标 5、设备运行时 8、最终完整交互回归 49 均通过（共 97 项自动检查，不含重复运行）。
- [x] 构建更新的签名 APK/AAB；新增 `scripts/verify-android-ocr.ps1`，对实际两个安装包内全部 18 个 OCR 文件逐 SHA256 校验，均通过。
- [x] 独立审查确认 Important（Android 模型路径）与 Minor（许可证覆盖检查）均关闭，无新重要问题；最终完整交互回归 49/49 通过。

版本管理：本阶段保存到 `codex/local-ocr`，保持现有 PR，不合并 main；实际提交与同步状态以 Git 日志为准。

## 排查与交付证据（2026-10-11）

- 真实模型加载 503 的红测揭示上游初始化链 `.catch(() => {})` 吞错；固定 pnpm 补丁修正失败传播及 worker 释放，重试绿测通过。
- 最终 APK 红测发现不存在 `.traineddata.gz`；Android 资源合并已将其解压并去后缀。构建期统一模型文件名后，实际 APK/AAB 全量资源比较通过。
- APK：13,480,035 bytes，SHA256 `380D2A2D2492684BF6AD98B82507FF36D38DD88E4AEB7C0891B7D3D104612B0E`；APK v2 签名验证通过。
- AAB：13,304,412 bytes，SHA256 `6B4103B8B509974D04BA1C2D2CAA430F838B4188F5D61CE9203E03724C562F28`；jarsigner 返回 `jar verified.`，保留自签名证书/无时间戳的常规警告，不代表商店审核通过。
- ADB `devices -l` 没有设备；相机、首次飞行模式识别、进程重启、系统分享、卸载重装后导入恢复和低内存机仍未实测。
- iOS 仅同步工程资源，未执行 Xcode 构建/签名/真机检查。商业再分发许可审查仍未完成。

## 后续阶段（本计划不混入实现）

修正分类默认值与自定义目标/科目，再做真机备份恢复闭环、商业交付文档和目标市场上架材料。只准备商品，不代用户定价发布或签署销售授权。
