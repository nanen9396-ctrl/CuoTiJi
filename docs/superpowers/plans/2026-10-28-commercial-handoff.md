# 题仓商业交付准备实施计划

> **For agentic workers:** Use superpowers:executing-plans to execute this documentation-only phase; keep the existing development worktree and review the final diff.

**Goal:** 在暂停真机验收的前提下，完成可交接的产品说明、国内分发准备清单及源码交付边界，不把候选版本描述为已获准出售或上架。

**Architecture:** 复用已批准品牌规格、README、Android 配置和 OCR NOTICE。交付材料只引用现有功能与证据；不新增应用功能、账号、服务端或付费服务，不生成包含用户数据或密钥的源码压缩包。

**Tech Stack:** Markdown / 现有 Node 自动化检查 / Git。

## Global Constraints

- 用户于 2026-10-28 要求先跳过实际测试阶段；本阶段不连接手机、不安装、不截图、不读取手机文件。
- 在 `.worktrees/local-ocr`、`codex/local-ocr` 中实施，保留既有备份修复，不修改根目录 main。
- 不修改受保护运行时，不新增账号、云同步、订阅、支付或 AI 解题。
- 真机补验、完整第三方许可审查、发行者资料及目标市场准入仍是未关闭门槛。
- 不代定价、签署销售授权、购买服务、注册账号、申请备案或上传商店。
- 不提交原题、照片、完整备份、截图、设备序列号、签名密钥或身份材料。

## Task 1：收口已有备份修复与验收状态

**Files:** `app/src/wrongbook-backup.ts`、`app/tests/wrongbook-backup.test.mjs`、`docs/superpowers/plans/2026-10-16-android-device-acceptance.md`。

- [x] 保留多 MB Base64 校验的最小修复和合成数据回归；本轮重新运行备份、模型及 Android 配置检查。
- [x] 将上轮保存、重启、备份导入与单题复习的证据按历史时间补记，不冒称本轮重新实测。
- [x] 将剩余真机项目标记为“按用户要求暂缓”，不勾选通过。

## Task 2：整理商业交付与国内发布材料

**Files:** 新增 `docs/release/android-delivery.md`、`docs/release/source-handoff.md`；修改 `README.md`。

- [x] 产品/技术身份直接引用现有规格与配置；提供不夸大能力的商店文案及素材制作清单。
- [x] 列出构建、签名保管、完整备份、版本升级和已知限制，区分已实现与待验收。
- [x] 分开列出发行者待提供资料、目标市场准入、单机 APP 备案适用性、隐私入口和第三方权属门槛；政策表述链接官方资料并标注核对日期。
- [x] 明确可交付文件、禁止交付文件、非独占授权/独占转让的讨论边界和买方验收标准；不授予未经确认的第三方权利。
- [x] README 添加上述材料入口，不创建自动全仓打包脚本，避免将未完成权属审查的模板和私密文件混入商品。

## Task 3：本地核验与交付

- [x] 检查文档链接指向真实文件；运行运行时完整性、类型检查和 `git diff --check`。
- [x] 独立只读审查事实、权属措辞、隐私排除规则和未验收项标记。
- [x] 确认仅本阶段七个文件进入提交清单，沿用开发分支，不合并 main；实际提交和远程同步以 Git 日志为准。

## 验证记录

- 本轮本地自动检查 35/35，通过 29 个受保护运行时文件完整性和 TypeScript 类型检查；没有重新运行或操作手机。
- 15 个本地文档链接均指向存在的文件，`git diff --check` 通过。
- 独立审查发现交付白名单漏 `app/pnpm-workspace.yaml`；核实其中的 `patchedDependencies` / `allowBuilds` 后补齐，路径与补丁配置断言通过，复审 Approved，无剩余 Critical/Important/Minor。
- 未新增自动全仓打包、业务后端或对外分发；当前交付物为两份说明和已有备份缺陷修复，而不是新用户功能。

## 暂缓而非通过

干净纯题干 OCR 质量、相机直接返回/取消、多题真机乱序、非空答案笔记、隔离设备恢复、低内存及其他厂商兼容性仍需后续实测。iOS 不属于本阶段 Android 交付。
