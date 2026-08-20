import assert from "node:assert/strict";
import test from "node:test";

let model = {};
try {
  model = await import("../src/wrongbook-model.ts");
} catch {
  // The first red run proves the feature does not exist yet.
}

test("provides the five library groups shown in the selected design", () => {
  assert.deepEqual(
    model.libraryGroups?.map((group) => group.title),
    ["考研数学", "公务员考试", "高中课程", "大学课程", "全部错题"],
  );
});

test("shuffles a review queue without mutating or losing questions", () => {
  const source = ["A", "B", "C"];
  const shuffled = model.makeReviewQueue?.(source, true, () => 0);

  assert.deepEqual(shuffled, ["B", "C", "A"]);
  assert.deepEqual(source, ["A", "B", "C"]);
});
