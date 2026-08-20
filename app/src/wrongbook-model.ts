export type LibraryGroup = {
  id: string;
  title: string;
  icon: "graduate" | "briefcase" | "school" | "book" | "grid";
  count: number;
};

export type WrongQuestion = {
  id: string;
  prompt: string;
  answer: string;
  tag: string;
};

export const libraryGroups: LibraryGroup[] = [
  { id: "postgraduate-math", title: "考研数学", icon: "graduate", count: 12 },
  { id: "civil-service", title: "公务员考试", icon: "briefcase", count: 18 },
  { id: "high-school", title: "高中课程", icon: "school", count: 9 },
  { id: "university", title: "大学课程", icon: "book", count: 7 },
  { id: "all", title: "全部错题", icon: "grid", count: 46 },
];

export const reviewQuestions: WrongQuestion[] = [
  { id: "q-1", prompt: "设函数 f(x)=x³-3x，求 f′(x) 的极值点。", answer: "2", tag: "函数与导数" },
  { id: "q-2", prompt: "计算极限 lim(x→0) sin x / x。", answer: "1", tag: "极限" },
  { id: "q-3", prompt: "矩阵 A 的特征值之和等于什么？", answer: "矩阵 A 的迹", tag: "线性代数" },
];

export function makeReviewQueue<T>(items: readonly T[], shuffled: boolean, random = Math.random): T[] {
  const queue = [...items];
  if (!shuffled) return queue;

  for (let index = queue.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [queue[index], queue[swapIndex]] = [queue[swapIndex], queue[index]];
  }

  return queue;
}
