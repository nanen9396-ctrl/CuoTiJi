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
  const encodedDocument = JSON.parse(await encoded.text());
  const [restored] = await backup.parseBackupFile(encoded);

  assert.equal(encoded.type, "application/json");
  assert.equal(encodedDocument.format, "ticang");
  assert.deepEqual({ ...restored, image: undefined }, { ...question, image: undefined });
  assert.equal(restored.image.type, "image/png");
  assert.deepEqual(new Uint8Array(await restored.image.arrayBuffer()), Uint8Array.from([137, 80, 78, 71]));
});

test("round-trips multi-megabyte image bytes with every Base64 padding length", async () => {
  for (const extraBytes of [0, 1, 2]) {
    const bytes = Uint8Array.from({ length: 4 * 1024 * 1024 + extraBytes }, (_, index) => index % 256);
    const original = { ...question, image: new Blob([bytes], { type: "image/jpeg" }) };
    const encoded = await backup.createBackupBlob([original]);
    const [restored] = await backup.parseBackupFile(encoded);

    assert.equal(restored.image.type, original.image.type);
    assert.deepEqual(new Uint8Array(await restored.image.arrayBuffer()), bytes);
  }
});

test("preserves custom, unclassified, and legacy classifications with original images", async () => {
  const questions = [
    ["教师资格证", "教育知识与能力"],
    ["待分类", "待分类"],
    ["考研数学", "高等数学"],
  ].map(([target, subject], index) => ({ ...question, id: `question-${index + 1}`, target, subject }));
  const encoded = await backup.createBackupBlob(questions);
  const restored = await backup.parseBackupFile(encoded);

  assert.equal(JSON.parse(await encoded.text()).version, 1);
  assert.equal(restored.length, questions.length);
  for (const [index, original] of questions.entries()) {
    assert.deepEqual({ ...restored[index], image: undefined }, { ...original, image: undefined });
    assert.equal(restored[index].image.type, original.image.type);
    assert.deepEqual(
      new Uint8Array(await restored[index].image.arrayBuffer()),
      new Uint8Array(await original.image.arrayBuffer()),
    );
  }
});

test("imports legacy cuotiji version 1 backups", async () => {
  const legacy = new Blob([JSON.stringify({
    format: "cuotiji",
    version: 1,
    exportedAt: question.createdAt,
    questions: [{ ...question, image: { type: "image/png", base64: "iVBORw==" } }],
  })]);
  const [restored] = await backup.parseBackupFile(legacy);
  assert.equal(restored.id, question.id);
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
  await assert.rejects(() => backup.parseBackupFile(makeFile({ type: "image/png", base64: "" })), /图片数据无效/);
});

test("rejects malformed Base64 padding and whitespace including trailing line terminators", async () => {
  for (const base64 of [
    "A", "AA", "AAA", "A===", "AA=A", "AAAA=", "AAAA====", "AA==AAAA", "____",
    "AAA ", "AA\tA", "AAAA\n", "AAAA\r", "AAAA\r\n", "AAA\n", "AAA\r", "AA\r\n",
    "AAA\u2028", "AAA\u2029",
  ]) {
    const file = new Blob([JSON.stringify({
      format: "ticang",
      version: 1,
      exportedAt: question.createdAt,
      questions: [{ ...question, image: { type: "image/png", base64 } }],
    })]);
    await assert.rejects(() => backup.parseBackupFile(file), /图片数据无效/, JSON.stringify(base64));
  }
});

test("rejects files and exports over 100 MB before reading image bytes", async () => {
  const oversizedFile = { size: backup.MAX_BACKUP_BYTES + 1, text: () => { throw new Error("must not read"); } };
  await assert.rejects(() => backup.parseBackupFile(oversizedFile), /不能超过 100 MB/);

  const oversizedQuestion = { ...question, image: { size: 79 * 1024 * 1024, type: "image/png" } };
  await assert.rejects(() => backup.createBackupBlob([oversizedQuestion]), /不能超过 100 MB/);
});
