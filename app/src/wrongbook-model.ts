export type LibraryGroup = {
  id: string;
  title: string;
  icon: "graduate" | "briefcase" | "school" | "book" | "grid";
  count: number;
};

export const questionTypes = ["选择题", "填空题", "解答题", "证明题"] as const;
export const UNCATEGORIZED = "待分类";

export function normalizeClassification(value: string): string {
  return value.trim() || UNCATEGORIZED;
}

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
  // ponytail: conservative keyword suggestions; manual confirmation remains authoritative.
  const target = /(?:公务员|行测|申论|资料分析)/.test(normalized) ? "公务员考试"
    : /考研数学/.test(normalized) ? "考研数学"
      : /大学/.test(normalized) ? "大学课程"
        : /(?:高中|高考)/.test(normalized) ? "高中课程" : UNCATEGORIZED;
  const subjectRules: [RegExp, string][] = [
    [/申论/, "申论"],
    [/(?:公务员|行测|资料分析)/, "行政职业能力测验"],
    [/(?:矩阵|行列式|特征值|线性方程组|向量)/, "线性代数"],
    [/(?:随机变量|概率|分布函数|数学期望|方差)/, "概率论"],
    [/(?:高等数学|极限|微分|积分|导数|求导)/, "高等数学"],
    [/(?:化学|\bmol\b|元素|离子)/i, "化学"],
    [/(?:物理|速度|加速度|质量|电场|电流|电压|功率|动能)/, "物理"],
    [/(?:英语|\bchoose\b|\bgrammar\b|\bsentence\b|\breading\b)/i, "英语"],
    [/(?:语文|阅读下面|文言文|诗词)/, "语文"],
  ];
  const subject = subjectRules.find(([pattern]) => pattern.test(normalized))?.[1] ?? UNCATEGORIZED;
  return { target, subject, questionType };
}

export const libraryGroups: LibraryGroup[] = [
  { id: "postgraduate-math", title: "考研数学", icon: "graduate", count: 0 },
  { id: "civil-service", title: "公务员考试", icon: "briefcase", count: 0 },
  { id: "high-school", title: "高中课程", icon: "school", count: 0 },
  { id: "university", title: "大学课程", icon: "book", count: 0 },
  { id: "uncategorized", title: UNCATEGORIZED, icon: "book", count: 0 },
  { id: "all", title: "全部错题", icon: "grid", count: 0 },
];

const groupTargets: Record<string, string> = {
  "postgraduate-math": "考研数学",
  "civil-service": "公务员考试",
  "high-school": "高中课程",
  university: "大学课程",
};

export function questionsForGroup(questions: readonly StoredQuestion[], groupId: string): StoredQuestion[] {
  if (groupId === "all") return [...questions];
  if (groupId === "uncategorized") {
    return questions.filter(({ target, subject }) => [target, subject].some((value) => normalizeClassification(value) === UNCATEGORIZED));
  }
  const groupTarget = groupId.startsWith("target:") ? groupId.slice(7) : groupTargets[groupId];
  return questions.filter(({ target }) => normalizeClassification(target) === groupTarget);
}

export function libraryGroupsWithCounts(questions: readonly StoredQuestion[]): LibraryGroup[] {
  const presetTargets = new Set([...Object.values(groupTargets), UNCATEGORIZED]);
  const customTargets = [...new Set(questions.map(({ target }) => normalizeClassification(target)))]
    .filter((target) => !presetTargets.has(target));
  const customGroups: LibraryGroup[] = customTargets.map((target) => ({
    id: `target:${target}`,
    title: target,
    icon: "book",
    count: 0,
  }));
  return libraryGroups.flatMap((group) => group.id === "all" ? [...customGroups, group] : [group]).map((group) => ({
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
