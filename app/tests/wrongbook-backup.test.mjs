import assert from "node:assert/strict";
import test from "node:test";

const backup = await import("../src/wrongbook-backup.ts");

const question = {
  id: "question-1",
  prompt: "设 A 为三阶矩阵，证明命题。",
  answer: "证明过程",
  target: "考研数学",
  subject: "线性代数",
  questionType: "证明题",
  note: "复习特征值",
  createdAt: "2026-08-24T00:00:00.000Z",
  image: new Blob([Uint8Array.from([137, 80, 78, 71])], { type: "image/png" }),
};

test("round-trips every question field and original image", async () => {
  const encoded = await backup.createBackupBlob([question], new Date("2026-08-24T01:00:00.000Z"));
  const [restored] = await backup.parseBackupFile(encoded);

  assert.equal(encoded.type, "application/json");
  assert.deepEqual({ ...restored, image: undefined }, { ...question, image: undefined });
  assert.equal(restored.image.type, "image/png");
  assert.deepEqual(new Uint8Array(await restored.image.arrayBuffer()), Uint8Array.from([137, 80, 78, 71]));
});

test("rejects unknown backup versions", async () => {
  const file = new Blob([JSON.stringify({ format: "cuotiji", version: 2, exportedAt: question.createdAt, questions: [] })]);
  await assert.rejects(() => backup.parseBackupFile(file), /不支持的备份版本/);
});

test("rejects invalid question fields without returning partial data", async () => {
  const file = new Blob([JSON.stringify({
    format: "cuotiji",
    version: 1,
    exportedAt: question.createdAt,
    questions: [{ ...question, image: { type: "image/png", base64: "iVBORw==" }, prompt: "" }],
  })]);
  await assert.rejects(() => backup.parseBackupFile(file), /题目数据无效/);
});

test("rejects timestamps that are valid dates but not canonical ISO strings", async () => {
  const makeFile = (overrides) => new Blob([JSON.stringify({
    format: "cuotiji",
    version: 1,
    exportedAt: question.createdAt,
    questions: [{ ...question, image: { type: "image/png", base64: "iVBORw==" } }],
    ...overrides,
  })]);
  await assert.rejects(() => backup.parseBackupFile(makeFile({
    questions: [{ ...question, createdAt: "August 24, 2026", image: { type: "image/png", base64: "iVBORw==" } }],
  })), /题目数据无效/);
  await assert.rejects(() => backup.parseBackupFile(makeFile({ exportedAt: "August 24, 2026" })), /备份文件结构无效/);
});

test("rejects invalid image MIME types and Base64", async () => {
  const makeFile = (image) => new Blob([JSON.stringify({
    format: "cuotiji",
    version: 1,
    exportedAt: question.createdAt,
    questions: [{ ...question, image }],
  })]);
  await assert.rejects(() => backup.parseBackupFile(makeFile({ type: "text/plain", base64: "aGVsbG8=" })), /图片类型无效/);
  await assert.rejects(() => backup.parseBackupFile(makeFile({ type: "image/png", base64: "not base64" })), /图片数据无效/);
});

test("rejects files and exports over 100 MB before reading image bytes", async () => {
  const oversizedFile = { size: backup.MAX_BACKUP_BYTES + 1, text: () => { throw new Error("must not read"); } };
  await assert.rejects(() => backup.parseBackupFile(oversizedFile), /不能超过 100 MB/);

  const oversizedQuestion = { ...question, image: { size: 79 * 1024 * 1024, type: "image/png" } };
  await assert.rejects(() => backup.createBackupBlob([oversizedQuestion]), /不能超过 100 MB/);
});
