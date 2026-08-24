export type LibraryGroup = {
  id: string;
  title: string;
  icon: "graduate" | "briefcase" | "school" | "book" | "grid";
  count: number;
};

export const questionTypes = ["选择题", "填空题", "解答题", "证明题"] as const;

export type QuestionType = (typeof questionTypes)[number];

export type QuestionClassification = {
  target: string;
  subject: string;
  questionType: QuestionType;
};

export type StoredQuestion = {
  id: string;
  prompt: string;
  answer: string;
  target: string;
  subject: string;
  questionType: QuestionType;
  note: string;
  createdAt: string;
  image: Blob;
};

function inferQuestionType(text: string): QuestionType {
  if (/(?:下列|选择|choose\b|[A-DＡ-Ｄ][.．、])/i.test(text)) return "选择题";
  if (/(?:证明|求证|prove\b)/i.test(text)) return "证明题";
  if (/(?:填空|_{2,}|＿{2,}|（\s*）|\(\s*\))/.test(text)) return "填空题";
  return "解答题";
}

export function classifyQuestion(text: string): QuestionClassification {
  const normalized = text.trim();
  const questionType = inferQuestionType(normalized);

  if (/(?:申论)/i.test(normalized)) {
    return { target: "公务员考试", subject: "申论", questionType };
  }
  if (/(?:公务员|行测|资料分析)/i.test(normalized)) {
    return { target: "公务员考试", subject: "行政职业能力测验", questionType };
  }
  if (/(?:矩阵|行列式|特征值|线性方程组|向量)/i.test(normalized)) {
    return { target: "考研数学", subject: "线性代数", questionType };
  }
  if (/(?:随机变量|概率|分布函数|数学期望|方差)/i.test(normalized)) {
    return { target: "考研数学", subject: "概率论", questionType };
  }
  if (/(?:化学|化学反应|\bmol\b|元素|离子)/i.test(normalized)) {
    return { target: "高中课程", subject: "化学", questionType };
  }
  if (/(?:物理|速度|加速度|质量|电场|电流|电压|功率|动能)/i.test(normalized)) {
    return { target: "高中课程", subject: "物理", questionType };
  }
  if (/(?:英语|\bchoose\b|\bgrammar\b|\bsentence\b|\breading\b)/i.test(normalized)) {
    return { target: "高中课程", subject: "英语", questionType };
  }
  if (/(?:语文|阅读下面|文言文|诗词)/i.test(normalized)) {
    return { target: "高中课程", subject: "语文", questionType };
  }
  return { target: "考研数学", subject: "高等数学", questionType };
}

export const libraryGroups: LibraryGroup[] = [
  { id: "postgraduate-math", title: "考研数学", icon: "graduate", count: 0 },
  { id: "civil-service", title: "公务员考试", icon: "briefcase", count: 0 },
  { id: "high-school", title: "高中课程", icon: "school", count: 0 },
  { id: "university", title: "大学课程", icon: "book", count: 0 },
  { id: "all", title: "全部错题", icon: "grid", count: 0 },
];

const groupTargets: Record<string, string> = {
  "postgraduate-math": "考研数学",
  "civil-service": "公务员考试",
  "high-school": "高中课程",
  university: "大学课程",
};

export function questionsForGroup(questions: readonly StoredQuestion[], groupId: string): StoredQuestion[] {
  return groupId === "all"
    ? [...questions]
    : questions.filter(({ target }) => target === groupTargets[groupId]);
}

export function libraryGroupsWithCounts(questions: readonly StoredQuestion[]): LibraryGroup[] {
  return libraryGroups.map((group) => ({
    ...group,
    count: questionsForGroup(questions, group.id).length,
  }));
}

export function makeReviewQueue<T>(items: readonly T[], shuffled: boolean, random = Math.random): T[] {
  const queue = [...items];
  if (!shuffled) return queue;

  for (let index = queue.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [queue[index], queue[swapIndex]] = [queue[swapIndex], queue[index]];
  }

  return queue;
}
