import { createWorker, OEM, type LoggerMessage } from "tesseract.js";

export type OcrProgress = { status: string; progress: number };

export type OcrWorker = {
  recognize(image: File): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
};

export type OcrWorkerFactory = (
  onProgress: (progress: OcrProgress) => void,
) => Promise<OcrWorker>;

const defaultFactory: OcrWorkerFactory = (onProgress) => createWorker(
  ["chi_sim", "eng"],
  OEM.LSTM_ONLY,
  {
    logger: (message: LoggerMessage) => onProgress({
      status: message.status,
      progress: message.progress,
    }),
  },
);

export async function recognizeQuestion(
  image: File,
  onProgress: (progress: OcrProgress) => void,
  createWorkerFactory = defaultFactory,
  signal?: AbortSignal,
): Promise<string> {
  let worker: OcrWorker | undefined;
  let terminated = false;
  const terminate = async () => {
    if (!worker || terminated) return;
    terminated = true;
    await worker.terminate();
  };

  try {
    worker = await createWorkerFactory(onProgress);
    if (signal?.aborted) throw new DOMException("OCR aborted", "AbortError");

    const recognition = worker.recognize(image);
    if (!signal) return (await recognition).data.text.trim();

    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => {
        void terminate().then(
          () => reject(new DOMException("OCR aborted", "AbortError")),
          () => reject(new DOMException("OCR aborted", "AbortError")),
        );
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return (await Promise.race([recognition, aborted])).data.text.trim();
    } finally {
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  } finally {
    await terminate();
  }
}
