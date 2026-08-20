export type LibraryGroup = {
  id: string;
  title: string;
  icon: "graduate" | "briefcase" | "school" | "book" | "grid";
  count: number;
};

export type StoredQuestion = {
  id: string;
  prompt: string;
  answer: string;
  target: string;
  subject: string;
  note: string;
  createdAt: string;
  image: Blob;
};

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
