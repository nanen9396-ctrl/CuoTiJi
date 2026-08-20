# 错题集真实 OCR 与本地持久化设计

## 决策

采用用户确认的方案 A：浏览器端使用 Tesseract.js 识别中文和英文印刷体，使用原生 IndexedDB 保存题目图片与结构化错题。图片不上传，不引入账号、后端或 API 密钥。

OCR 语言模型首次加载需要联网，随后可由浏览器缓存；识别计算在用户设备上完成。

## 成功标准

- 手机浏览器可通过独立入口调用系统相机拍照，也可从相册或文件中选择图片。
- 选择图片后显示预览、识别进度和真实 OCR 结果。
- 识别文字可手动修改，再填写分类、答案和笔记。
- 保存后，题目立即出现在对应题库与“全部错题”中。
- 刷新页面或重新打开应用后，已保存的文字、分类、答案、笔记和原图仍存在。
- 顺序刷题和乱序刷题使用持久化数据，而非静态示例数组。

## 范围

本阶段只实现单设备、单浏览器的数据闭环。暂不实现账号、云同步、跨设备共享、自动公式转 LaTeX、图片内容理解、复习算法和统计分析。

Tesseract.js 对清晰印刷体有效，但复杂公式、手写体和低质量照片可能需要用户校正。原题图片会保留，因此 OCR 失败不会造成题目信息丢失。

## 用户流程

1. 用户从首页进入“拍照录入”。
2. 用户选择“拍照”或“从相册选择”。“拍照”使用带 `capture="environment"` 的图片输入调用后置相机；“从相册选择”使用不带 `capture` 的图片输入，避免浏览器强制打开相机。
3. 应用校验文件为图片且不超过 10 MB，然后显示本地预览。
4. 应用以 `chi_sim+eng` 启动 OCR，并显示 0–100% 的识别进度。
5. 成功后进入确认页；识别文字、考试目标、科目、正确答案和个人笔记均可编辑。
6. 用户保存后，应用把结构化字段与原图 Blob 写入 IndexedDB，再显示保存成功页。
7. 返回首页后，题库数量和列表从 IndexedDB 重新计算；复习页面读取当前分类的真实数据。

## 架构与职责

### OCR 适配器

新增 `app/src/ocr.ts`，只负责调用 Tesseract.js、传递进度并返回清理过的文本。公开接口为：

```ts
export type OcrProgress = { status: string; progress: number };

export type OcrWorker = {
  recognize(image: File): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
};

export type OcrWorkerFactory = (
  onProgress: (progress: OcrProgress) => void,
) => Promise<OcrWorker>;

export async function recognizeQuestion(
  image: File,
  onProgress: (progress: OcrProgress) => void,
  createWorker?: OcrWorkerFactory,
): Promise<string>;
```

默认 worker 使用当前 Tesseract.js 7 API，以 `createWorker(["chi_sim", "eng"], 1, { logger })` 加载两种语言和 LSTM-only 引擎；可选 factory 只用于无网络单元测试。适配器不保存数据、不推断科目，也不修改 UI 状态。识别成功或失败后都在 `finally` 中终止 worker，避免重复录入时泄漏资源。

### 本地题库

新增 `app/src/wrongbook-store.ts`，封装一个名为 `wrongbook` 的 IndexedDB 数据库和一个 `questions` object store，主键为 `id`。公开接口保持最小：

```ts
export async function listQuestions(): Promise<StoredQuestion[]>;
export async function addQuestion(question: StoredQuestion): Promise<void>;
```

本阶段数据量较小，列表加载后在内存中按目标和科目过滤，不创建额外索引、迁移框架或仓储接口。

### 数据结构

`WrongQuestion` 扩展为可持久化记录：

```ts
export type StoredQuestion = {
  id: string;
  prompt: string;
  answer: string;
  target: string;
  subject: string;
  note: string;
  createdAt: string;
  image: Blob;
};
```

`id` 使用 `crypto.randomUUID()`，`createdAt` 使用 ISO 时间。题库分组和计数由记录的 `target` 派生；“全部错题”包含所有记录。首次启用持久化后不写入虚构示例题，空题库显示明确空状态。

### 界面状态

`Prototype.tsx` 继续负责现有页面流，但改为由顶层加载并持有 `questions`。拍照页持有选中的文件、预览 URL、OCR 进度和错误；确认页接收识别文本与图片，并在保存成功后把新记录回传顶层。对象 URL 在替换图片或组件卸载时释放。

## 错误处理

- 非图片文件或超过 10 MB：在拍照页显示可恢复错误，不启动 OCR。
- OCR 返回空文字：保留图片并进入可手动填写的确认页，提示“未识别到清晰文字”。
- OCR 异常或语言模型加载失败：显示“识别失败，请重试或手动录入”，保留当前图片。
- IndexedDB 不可用或写入失败：停留在确认页并显示“保存失败”，不显示成功状态，也不丢弃表单内容。
- 题库为空：禁用开始刷题按钮并显示录入引导，避免空队列取值错误。

## 隐私与安全

- 图片只通过 Blob URL 本地预览和本地 OCR，不发送到远程业务服务。
- 不把图片转为 Base64 写入 localStorage，避免容量膨胀和同步阻塞。
- 仅接受 `image/*`，并在应用层再次检查 MIME 类型与 10 MB 上限。
- 本地数据遵循浏览器站点存储生命周期；用户清除浏览器数据时错题会被删除。本阶段不承诺备份。

## 测试设计

- 模型测试：目标分组、全部错题、顺序队列和乱序队列均使用真实记录。
- OCR 单元测试：通过可替换 worker 工厂验证 `chi_sim+eng`、进度回调、文本返回和 worker 终止；不依赖网络。
- 存储浏览器测试：添加记录、重新加载页面、再次读取，确认 Blob 与字段完整。
- 主流程 Playwright 测试：选择图片、显示预览、进入确认、保存、刷新、打开分类题库并刷题。
- 错误测试：无效文件、超大文件、空 OCR 结果、保存失败和空题库均显示可恢复状态。
- 完成前手动使用一张清晰中文题目图片执行真实 OCR，确认浏览器控制台无未处理错误。

## 最小依赖与后续升级条件

只新增 `tesseract.js`。IndexedDB、文件选择、相机 capture、Blob URL 和 UUID 均使用浏览器原生能力。

当用户明确需要跨设备同步、多人共享或可靠备份时，再增加登录与云数据库；当复杂公式识别成为主要失败原因时，再评估云 OCR 或视觉模型。二者均不属于本次实现。
