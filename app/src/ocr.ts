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
    workerPath: "/ocr/v1/worker.min.js",
    corePath: "/ocr/v1/core",
    langPath: "/ocr/v1/lang",
    workerBlobURL: false,
    gzip: false,
    // ponytail: models ship with the app; avoid stale/duplicate IndexedDB model caches.
    cacheMethod: "none",
    // Initialization/recognition promises report errors to the scan screen.
    errorHandler: () => {},
    logger: (message: LoggerMessage) => onProgress({
      status: ({
        "loading tesseract core": "加载本地识别引擎",
        "initializing tesseract": "初始化识别引擎",
        "loading language traineddata": "加载本地中英文模型",
        "initializing api": "准备文字识别",
        "recognizing text": "正在识别文字",
      } as Record<string, string>)[message.status] ?? "正在准备识别",
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
