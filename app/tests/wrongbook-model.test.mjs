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

test("classifies matrix proofs as postgraduate linear algebra", () => {
  assert.deepEqual(model.classifyQuestion?.("设 A 为三阶矩阵，证明 A 的特征值均为实数。"), {
    target: "考研数学",
    subject: "线性代数",
    questionType: "证明题",
  });
});

test("classifies physics multiple-choice questions", () => {
  assert.deepEqual(model.classifyQuestion?.("小球以速度 v 运动，下列说法正确的是 A. 加速度恒定 B. 动能不变"), {
    target: "高中课程",
    subject: "物理",
    questionType: "选择题",
  });
});

test("classifies chemistry fill-in questions", () => {
  assert.deepEqual(model.classifyQuestion?.("化学反应中 1 mol 氧气含有的分子数为______。"), {
    target: "高中课程",
    subject: "化学",
    questionType: "填空题",
  });
});

test("classifies English multiple-choice questions", () => {
  assert.deepEqual(model.classifyQuestion?.("Choose the correct answer: She ___ to school every day. A. go B. goes"), {
    target: "高中课程",
    subject: "英语",
    questionType: "选择题",
  });
});

test("classifies civil-service questions", () => {
  assert.deepEqual(model.classifyQuestion?.("公务员行测资料分析：根据材料计算同比增长率。"), {
    target: "公务员考试",
    subject: "行政职业能力测验",
    questionType: "解答题",
  });
});

test("uses a stable fallback for unknown text", () => {
  assert.deepEqual(model.classifyQuestion?.("请完成这道题。"), {
    target: "考研数学",
    subject: "高等数学",
    questionType: "解答题",
  });
});
