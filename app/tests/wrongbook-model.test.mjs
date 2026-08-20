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

const questions = [
  {
    id: "1",
    prompt: "A",
    answer: "1",
    target: "考研数学",
    subject: "高等数学",
    note: "",
    createdAt: "2026-08-08T00:00:00.000Z",
    image: new Blob(["a"], { type: "image/png" }),
  },
  {
    id: "2",
    prompt: "B",
    answer: "2",
    target: "高中课程",
    subject: "物理",
    note: "",
    createdAt: "2026-08-08T01:00:00.000Z",
    image: new Blob(["b"], { type: "image/png" }),
  },
];

test("filters persisted questions by library and includes every question in all", () => {
  assert.deepEqual(
    model.questionsForGroup(questions, "postgraduate-math").map(({ id }) => id),
    ["1"],
  );
  assert.deepEqual(
    model.questionsForGroup(questions, "all").map(({ id }) => id),
    ["1", "2"],
  );
});

test("derives library counts from persisted questions", () => {
  const groups = model.libraryGroupsWithCounts(questions);

  assert.equal(groups.find(({ id }) => id === "postgraduate-math").count, 1);
  assert.equal(groups.find(({ id }) => id === "all").count, 2);
});
