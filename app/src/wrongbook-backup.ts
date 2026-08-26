// @ts-expect-error Node's native TypeScript runner needs the explicit source extension.
import { questionTypes, type QuestionType, type StoredQuestion } from "./wrongbook-model.ts";

export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

type BackupQuestion = Omit<StoredQuestion, "image"> & {
  image: { type: string; base64: string };
};

type BackupDocument = {
  format: "cuotiji";
  version: 1;
  exportedAt: string;
  questions: BackupQuestion[];
};

const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBlob(type: string, value: string): Blob {
  if (!type.startsWith("image/")) fail("备份中的图片类型无效");
  if (!base64Pattern.test(value)) fail("备份中的图片数据无效");
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    fail("备份中的图片数据无效");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type });
}

function parseQuestion(value: unknown): StoredQuestion {
  if (!isRecord(value) || !isRecord(value.image)) fail("备份中的题目数据无效");
  const { id, prompt, answer, target, subject, questionType, note, createdAt, image } = value;
  const strings = [id, prompt, answer, target, subject, note, createdAt];
  if (strings.some((field) => typeof field !== "string") || !(id as string).trim() || !(prompt as string).trim()) {
    fail("备份中的题目数据无效");
  }
  if (!questionTypes.includes(questionType as QuestionType) || !isIsoTimestamp(createdAt)) {
    fail("备份中的题目数据无效");
  }
  if (typeof image.type !== "string") fail("备份中的图片类型无效");
  if (typeof image.base64 !== "string") fail("备份中的图片数据无效");
  return {
    id: id as string,
    prompt: prompt as string,
    answer: answer as string,
    target: target as string,
    subject: subject as string,
    questionType: questionType as QuestionType,
    note: note as string,
    createdAt: createdAt as string,
    image: base64ToBlob(image.type, image.base64),
  };
}

export async function createBackupBlob(
  questions: readonly StoredQuestion[],
  exportedAt = new Date(),
): Promise<Blob> {
  const estimatedBase64Bytes = questions.reduce((total, question) => total + 4 * Math.ceil(question.image.size / 3), 0);
  if (estimatedBase64Bytes > MAX_BACKUP_BYTES) fail("备份文件不能超过 100 MB");
  const encodedQuestions: BackupQuestion[] = [];
  for (const question of questions) {
    encodedQuestions.push({
      ...question,
      image: { type: question.image.type, base64: await blobToBase64(question.image) },
    });
  }
  const document: BackupDocument = {
    format: "cuotiji",
    version: 1,
    exportedAt: exportedAt.toISOString(),
    questions: encodedQuestions,
  };
  const blob = new Blob([JSON.stringify(document)], { type: "application/json" });
  if (blob.size > MAX_BACKUP_BYTES) fail("备份文件不能超过 100 MB");
  return blob;
}

export async function parseBackupFile(file: Pick<Blob, "size" | "text">): Promise<StoredQuestion[]> {
  if (file.size > MAX_BACKUP_BYTES) fail("备份文件不能超过 100 MB");
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    fail("备份文件不是有效的 JSON");
  }
  if (!isRecord(value) || value.format !== "cuotiji") fail("不是错题集备份文件");
  if (value.version !== 1) fail("不支持的备份版本");
  if (!isIsoTimestamp(value.exportedAt) || !Array.isArray(value.questions)) {
    fail("备份文件结构无效");
  }
  return value.questions.map(parseQuestion);
}
