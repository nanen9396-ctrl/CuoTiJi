import assert from "node:assert/strict";
import test from "node:test";

let recognizeQuestion;
try {
  ({ recognizeQuestion } = await import("../src/ocr.ts"));
} catch {
  // The red run proves the adapter does not exist yet.
}

test("returns trimmed OCR text and terminates its worker", async () => {
  let terminated = false;
  const text = await recognizeQuestion(
    new File(["image"], "question.png", { type: "image/png" }),
    () => {},
    async () => ({
      recognize: async () => ({ data: { text: "  题目内容\n" } }),
      terminate: async () => { terminated = true; },
    }),
  );

  assert.equal(text, "题目内容");
  assert.equal(terminated, true);
});

test("terminates its worker after recognition fails", async () => {
  let terminated = false;

  await assert.rejects(() => recognizeQuestion(
    new File(["image"], "question.png", { type: "image/png" }),
    () => {},
    async () => ({
      recognize: async () => { throw new Error("OCR failed"); },
      terminate: async () => { terminated = true; },
    }),
  ));

  assert.equal(terminated, true);
});

test("aborts in-flight recognition and terminates its worker", async () => {
  let terminated = 0;
  const controller = new AbortController();
  const recognition = recognizeQuestion(
    new File(["image"], "question.png", { type: "image/png" }),
    () => {},
    async () => ({
      recognize: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { data: { text: "迟到的题目" } };
      },
      terminate: async () => { terminated += 1; },
    }),
    controller.signal,
  );

  controller.abort();
  await assert.rejects(recognition, { name: "AbortError" });
  assert.equal(terminated, 1);
});
