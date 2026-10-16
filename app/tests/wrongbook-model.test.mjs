import assert from "node:assert/strict";
import test from "node:test";

let model = {};
try {
  model = await import("../src/wrongbook-model.ts");
} catch {
  // The first red run proves the feature does not exist yet.
}

test("preserves existing library groups and adds an uncategorized library", () => {
  assert.deepEqual(
    model.libraryGroups?.map((group) => group.title),
    ["考研数学", "公务员考试", "高中课程", "大学课程", "待分类", "全部错题"],
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

test("infers matrix subject without assuming an examination target", () => {
  assert.deepEqual(model.classifyQuestion?.("设 A 为三阶矩阵，证明 A 的特征值均为实数。"), {
    target: "待分类",
    subject: "线性代数",
    questionType: "证明题",
  });
});

test("classifies physics multiple-choice questions", () => {
  assert.deepEqual(model.classifyQuestion?.("小球以速度 v 运动，下列说法正确的是 A. 加速度恒定 B. 动能不变"), {
    target: "待分类",
    subject: "物理",
    questionType: "选择题",
  });
});

test("classifies chemistry fill-in questions", () => {
  assert.deepEqual(model.classifyQuestion?.("化学反应中 1 mol 氧气含有的分子数为______。"), {
    target: "待分类",
    subject: "化学",
    questionType: "填空题",
  });
});

test("classifies English multiple-choice questions", () => {
  assert.deepEqual(model.classifyQuestion?.("Choose the correct answer: She ___ to school every day. A. go B. goes"), {
    target: "待分类",
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

test("leaves unknown and empty text uncategorized", () => {
  assert.deepEqual(model.classifyQuestion?.("请完成这道题。"), {
    target: "待分类",
    subject: "待分类",
    questionType: "解答题",
  });
  assert.deepEqual(model.classifyQuestion("  "), model.classifyQuestion("请完成这道题。"));
});

test("recognizes explicit university, postgraduate and school targets", () => {
  assert.equal(model.classifyQuestion("大学英语 grammar").target, "大学课程");
  assert.equal(model.classifyQuestion("考研数学求极限").target, "考研数学");
  assert.equal(model.classifyQuestion("高中物理加速度").target, "高中课程");
  assert.equal(model.classifyQuestion("求导数与积分").subject, "高等数学");
});

test("normalizes blank and padded classification names without changing case", () => {
  assert.equal(model.normalizeClassification("  教师资格证  "), "教师资格证");
  assert.equal(model.normalizeClassification("  "), "待分类");
  assert.equal(model.normalizeClassification("IELTS"), "IELTS");
});

test("creates custom target libraries without losing or mutating historic questions", () => {
  const source = [
    ...questions,
    { ...questions[0], id: "3", target: "教师资格证", subject: "教育知识与能力" },
    { ...questions[0], id: "4", target: " 教师资格证 ", subject: "教育知识与能力" },
    { ...questions[0], id: "5", target: "大学课程", subject: "待分类" },
    { ...questions[0], id: "6", target: " ", subject: "英语" },
  ];
  const original = structuredClone(source);
  const groups = model.libraryGroupsWithCounts(source);
  const custom = groups.find(({ title }) => title === "教师资格证");
  assert.equal(custom.count, 2);
  assert.deepEqual(model.questionsForGroup(source, custom.id).map(({ id }) => id), ["3", "4"]);
  assert.deepEqual(model.questionsForGroup(source, "uncategorized").map(({ id }) => id), ["5", "6"]);
  assert.equal(groups.find(({ id }) => id === "university").count, 1);
  assert.equal(groups.find(({ id }) => id === "all").count, 6);
  assert.deepEqual(source, original);
});

test("custom target identifiers cannot collide with fixed groups or require URI decoding", () => {
  const names = ["all", "university", "__proto__", "target:all", "%bad", "\ud800", "全部错题", "全部错题（自定义）", "数据管理", "数据管理（自定义）"];
  const source = names.map((target, index) => ({ ...questions[0], id: String(index), target }));
  const groups = model.libraryGroupsWithCounts(source);
  assert.equal(new Set(groups.map(({ id }) => id)).size, groups.length);
  for (const [index, target] of names.entries()) {
    const group = groups.find(({ id }) => id === `target:${target}`);
    assert.equal(group.title, target);
    assert.deepEqual(model.questionsForGroup(source, group.id).map(({ id }) => id), [String(index)]);
  }
  assert.deepEqual(model.questionsForGroup(source, "missing"), []);
  assert.equal(model.questionsForGroup(source, "all").length, names.length);
});
