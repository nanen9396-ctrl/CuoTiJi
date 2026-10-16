# 自定义分类与待分类实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 大学生与考证用户可以保存自定义学习目标/科目，并从首页进入该题库；未知分类不再自动归到考研数学或高中。

**Architecture:** 继续使用 StoredQuestion 的 string 分类字段和现有 IndexedDB/备份 v1。模型层统一空白分类、推断明确线索并生成动态题库；确认页与详情页共用现有样式的分类输入，保留人工选择与事务锁定。

**Tech Stack:** React / TypeScript / IndexedDB / node:test / Playwright / Capacitor；不新增依赖。

## Global Constraints

- 保留现有 codex/local-ocr 隔离工作区、品牌及受保护运行时。
- 不改变数据库/备份版本，不自动重分类历史题目。
- 分类名称保存时 trim，空值统一“待分类”；不改变非空名称大小写。
- 泛学科线索只推断科目，不等同于考试目标。公务员/行测/申论、考研数学、大学、高中/高考等明确目标线索才确定目标。
- “待分类”题库包含目标或科目任一为空白/待分类的题；有明确目标的题仍可从该目标题库找到。
- 自定义题库 id 使用 `target:` 前缀加原目标字符串，不把名称作为内部固定 id 或 URL 解码，避免 all/__proto__/百分号等名称冲突。
- 录入与编辑都能自定义；历史名称合并到快捷选项，人工分类不随文字修改而覆盖；保存期间锁定新增控件。
- 不增加分类管理后台、云端、账号或 AI 语义分类。

## Task 1: 模型与回归检查

**Files:** `app/src/wrongbook-model.ts`, `app/tests/wrongbook-model.test.mjs`。

- [x] 修改旧兜底断言为“待分类”，增加明确大学/考试、泛学科、自定义题库及保留旧值检查；运行 test:model 观察旧实现失败。
- [x] 导出 `UNCATEGORIZED = "待分类"` 与 `normalizeClassification(value: string): string`；保持 `classifyQuestion(text)` 签名，目标与科目分开推断。
- [x] `questionsForGroup` 支持固定组、待分类和 `target:` 动态组；`libraryGroupsWithCounts` 合并去重后的自定义目标再计数。
- [x] `pnpm run test:model` 通过。

```js
assert.equal(classifyQuestion("矩阵的特征值").target, "待分类");
assert.equal(classifyQuestion("大学英语 grammar").target, "大学课程");
assert.equal(normalizeClassification("  教师资格证  "), "教师资格证");
```

## Task 2: 共用分类输入与真实页面检查

**Files:** `app/src/Prototype.tsx`, `app/src/prototype.css`, `app/tests/prototype/classification.spec.ts`, `app/tests/prototype/home.spec.ts`。

- [x] 新增页面检查：自定义录入/重载/首页打开/搜索复习，未知进入待分类，详情修改自定义分类，人工选择不被文字覆盖；在旧页面观察缺失输入等预期失败。
- [x] 共用 ClassificationField，使用 KeyboardInput、现有 choice-chip 与 text-field 样式，显示“学习目标”和“科目”。快捷项合并预设与历史值，提供待分类选项。
- [x] 两处保存都调用 normalizeClassification，确认页成功提示使用实际保存分类，新增控件遵守现有 busy/session 同步状态。
- [x] 更新旧测试：原手动数学用例显式选择数学；泛矩阵题目标为待分类；锁定检查包含新增输入与动态选项。
- [x] 完整 prototype 回归与 typecheck 通过。

## Task 3: 兼容、打包与审查

**Files:** `app/tests/wrongbook-backup.test.mjs`, `README.md`, 本计划。

- [x] 兼容检查往返自定义/待分类/旧题分类与原图，保持备份 v1；不修改生产备份代码。
- [x] 更新 README 的分类能力与限制。
- [x] 运行 model、backup、OCR、prototype、native、release、Sites 和 runtime integrity 检查；生成签名 APK/AAB，并运行 verify-android-ocr.ps1。
- [x] 独立审查通过，发现的重要问题及覆盖缺口已修复。Git 交付保留当前开发分支，不合并 main；同步状态以 Git 日志为准。

## 后续边界

真机相机/飞行模式/分享/恢复，iOS Xcode 验证和商业交付权属核查仍是后续验收项。没有设备时，不声称完成真机测试。

## 验证记录（2026-10-16）

- 类型检查、Web 构建、Capacitor Android/iOS 资源同步通过；29 个受保护运行时文件保持一致。
- 模型 14、备份 8、OCR 4、原生配置/返回 5、Android 发布配置 5、Sites 4、真实页面交互 55、设备运行时 8，共 103 项自动检查通过（不计重复运行）。
- 长名称布局、保留名称标题和失焦键盘均先有失败检查，再完成修复；独立审查确认无遗留 Critical/Important。
- 视觉核验覆盖 iPhone/Pixel 分类表单、长名称的成功提示/列表/复习，以及键盘开闭。等待 FlowStack transform 回到原位后核验最终截图，无横向裁切；原图保留。
- APK：13,480,599 bytes；SHA256 `ECF20B6B18D1EA8AB3D7A7245E9BA9B962B3A0312B91FB6BFCA3172114E107B5`，APK v2 验证通过。
- AAB：13,305,007 bytes；SHA256 `49D4945766F36C481747F8AA0A0CF2F7F05EDE4D48BDA3B5D6357F1D0AB913BB`，返回 `jar verified.`，有自签名证书常规警告。
- 两个实际安装包的 18 个 OCR 文件逐 SHA256 比对通过。
- 当日 ADB 列表为空，未执行真机安装/相机/飞行模式/系统分享/恢复。未进行 Xcode 编译或应用市场提交；商业许可审查仍未完成。
