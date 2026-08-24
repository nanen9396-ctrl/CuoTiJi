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

export async function addQuestion(question: StoredQuestion): Promise<void> {
  const db = await database();
  try {
    const transaction = db.transaction("questions", "readwrite");
    await Promise.all([
      requestResult(transaction.objectStore("questions").add(question)),
      transactionResult(transaction),
    ]);
  } finally {
    db.close();
  }
}
