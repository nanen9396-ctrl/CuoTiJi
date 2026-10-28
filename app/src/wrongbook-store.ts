import type { StoredQuestion } from "./wrongbook-model";

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const transactionResult = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = () => reject(transaction.error ?? new DOMException("IndexedDB transaction aborted", "AbortError"));
  transaction.onerror = () => reject(transaction.error ?? new DOMException("IndexedDB transaction failed", "UnknownError"));
});

async function database(): Promise<IDBDatabase> {
  const request = indexedDB.open("wrongbook", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("questions", { keyPath: "id" });
  return requestResult(request);
}

async function runWrite(requestFactory: (store: IDBObjectStore) => IDBRequest): Promise<void> {
  const db = await database();
  try {
    const transaction = db.transaction("questions", "readwrite");
    await Promise.all([
      requestResult(requestFactory(transaction.objectStore("questions"))),
      transactionResult(transaction),
    ]);
  } finally {
    db.close();
  }
}

export async function listQuestions(): Promise<StoredQuestion[]> {
  const db = await database();
  try {
    const questions = await requestResult(db.transaction("questions").objectStore("questions").getAll()) as StoredQuestion[];
    return questions.map((question) => ({
      ...question,
      questionType: question.questionType ?? "解答题",
    }));
  } finally {
    db.close();
  }
}

export function addQuestion(question: StoredQuestion): Promise<void> {
  return runWrite((store) => store.add(question));
}

export function updateQuestion(question: StoredQuestion): Promise<void> {
  return runWrite((store) => store.put(question));
}

export function deleteQuestion(id: string): Promise<void> {
  return runWrite((store) => store.delete(id));
}

export function clearQuestions(): Promise<void> {
  return runWrite((store) => store.clear());
}

export async function importQuestions(
  questions: readonly StoredQuestion[],
): Promise<{ added: StoredQuestion[]; skipped: number }> {
  const db = await database();
  try {
    const transaction = db.transaction("questions", "readwrite");
    const complete = transactionResult(transaction);
    const store = transaction.objectStore("questions");
    const existing = new Set(await requestResult(store.getAllKeys()));
    const added: StoredQuestion[] = [];
    let skipped = 0;
    const writes: Promise<unknown>[] = [];
    for (const question of questions) {
      if (existing.has(question.id)) {
        skipped += 1;
        continue;
      }
      existing.add(question.id);
      added.push(question);
      writes.push(requestResult(store.add(question)));
    }
    await Promise.all([...writes, complete]);
    return { added, skipped };
  } finally {
    db.close();
  }
}
