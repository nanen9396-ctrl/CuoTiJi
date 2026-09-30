import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
} from "react";
import {
  ArchiveIcon,
  BackpackIcon,
  CameraIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  GridIcon,
  ReaderIcon,
  ShuffleIcon,
} from "@radix-ui/react-icons";
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { FlowStack, KeyboardInput, KeyboardTextarea, MobileScroll, useFlow, type FlowControls, type FlowScreen } from "./mobile";
import type { OcrProgress } from "./ocr";
import { createBackupBlob, parseBackupFile } from "./wrongbook-backup";
import {
  classifyQuestion,
  libraryGroupsWithCounts,
  makeReviewQueue,
  questionTypes,
  questionsForGroup,
  type LibraryGroup,
  type StoredQuestion,
} from "./wrongbook-model";
import {
  addQuestion,
  clearQuestions as clearStoredQuestions,
  deleteQuestion,
  importQuestions as importStoredQuestions,
  listQuestions,
  updateQuestion,
} from "./wrongbook-store";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const targetChoices = ["考研数学", "公务员考试", "高中课程", "大学课程"];
const subjectChoices = ["高等数学", "线性代数", "概率论", "行政职业能力测验", "申论", "语文", "英语", "物理", "化学"];

const icons: Record<LibraryGroup["icon"], ComponentType> = {
  graduate: ArchiveIcon,
  briefcase: BackpackIcon,
  school: FileTextIcon,
  book: ReaderIcon,
  grid: GridIcon,
};

type WrongbookSession = {
  questions: StoredQuestion[];
  loadState: "loading" | "ready" | "error";
  loadError: string;
  retryQuestionLoad: () => void;
  pendingQuestionIds: ReadonlySet<string>;
  dataMutationPending: boolean;
  saveQuestion: (question: StoredQuestion) => Promise<void>;
  editQuestion: (question: StoredQuestion) => Promise<void>;
  removeQuestion: (id: string) => Promise<void>;
  importQuestionBatch: (questions: readonly StoredQuestion[]) => Promise<{ added: number; skipped: number }>;
  clearAllQuestions: () => Promise<void>;
};

const WrongbookContext = createContext<WrongbookSession | null>(null);

function useWrongbook() {
  const session = useContext(WrongbookContext);
  if (!session) throw new Error("WrongbookContext is missing");
  return session;
}

function StoredImage({ image, alt, className }: { image: Blob; alt: string; className: string }) {
  const [source, setSource] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(image);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  return source ? <img className={className} src={source} alt={alt} draggable={false} /> : null;
}

function savedScreen(target: string, subject: string): FlowScreen {
  return {
    id: "saved",
    render: () => (
      <MobileScroll className="app-screen success-page">
        <main className="success-content">
          <span className="success-icon" aria-hidden="true"><CheckIcon /></span>
          <h1>保存成功</h1>
          <p>已归档到 {target} · {subject}</p>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            返回首页
          </button>
        </main>
      </MobileScroll>
    ),
  };
}

function ReviewSession({ queueIds }: { queueIds: string[] }) {
  const { questions } = useWrongbook();
  const [currentId, setCurrentId] = useState(queueIds[0] ?? "");
  const [showAnswer, setShowAnswer] = useState(false);
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const queue = queueIds.flatMap((id) => {
    const question = questionsById.get(id);
    return question ? [question] : [];
  });
  const liveIndex = queue.findIndex((question) => question.id === currentId);
  const removedIndex = queueIds.indexOf(currentId);
  const index = liveIndex >= 0 ? liveIndex : Math.min(Math.max(removedIndex, 0), queue.length - 1);
  const question = queue[index];

  useEffect(() => {
    if (question?.id === currentId) return;
    setCurrentId(question?.id ?? "");
    setShowAnswer(false);
  }, [currentId, question?.id]);

  if (!question) {
    return <MobileScroll className="app-screen review-page"><main className="review-content empty-library">还没有可复习的错题</main></MobileScroll>;
  }

  return (
    <MobileScroll className="app-screen review-page">
      <main className="review-content">
        <div className="review-meta">
          <span>第 {index + 1} / {queue.length} 题</span>
          <span>{question.subject} · {question.questionType}</span>
        </div>
        <article className="review-card">
          <StoredImage image={question.image} alt="原题图片" className="review-image" />
          <h2>{question.prompt}</h2>
          {showAnswer ? (
            <div className="answer-text">
              <p>正确答案：{question.answer || "未填写"}</p>
              {question.note ? <small>笔记：{question.note}</small> : null}
            </div>
          ) : null}
        </article>
        <div className="review-actions">
          <button className="secondary-button" type="button" onClick={() => setShowAnswer((value) => !value)}>
            {showAnswer ? "隐藏答案" : "显示答案"}
          </button>
          <button className="primary-button" type="button" onClick={() => {
            setCurrentId(queue[(index + 1) % queue.length].id);
            setShowAnswer(false);
          }}>
            下一题
          </button>
        </div>
      </main>
    </MobileScroll>
  );
}

function reviewScreen(queueIds: string[]): FlowScreen {
  return {
    id: "review",
    headerHeight: 54,
    header: (flow) => (
      <div className="app-header app-header-light">
        <button type="button" className="back-button" aria-label="返回" onClick={flow.pop}><ChevronLeftIcon /></button>
        <h1>刷错题</h1>
        <span className="header-spacer" aria-hidden="true" />
      </div>
    ),
    render: () => <ReviewSession queueIds={queueIds} />,
  };
}

function LibraryView({ flow, group }: { flow: FlowControls; group: LibraryGroup }) {
  const { questions } = useWrongbook();
  const [query, setQuery] = useState("");
  const currentQuestions = questionsForGroup(questions, group.id);
  const isEmpty = currentQuestions.length === 0;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleQuestions = currentQuestions.filter((question) => !normalizedQuery || [
    question.prompt,
    question.answer,
    question.note,
    question.target,
    question.subject,
    question.questionType,
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));

  return (
    <MobileScroll className="app-screen detail-page">
      <main className="detail-content">
        <div className="detail-summary">
          <span>{currentQuestions.length} 道错题</span>
          <p>按保存时间查看，或直接开始一轮复习。</p>
        </div>
        <KeyboardInput className="library-search" type="search" aria-label="搜索错题" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题目、答案、笔记或分类" />
        <div className="study-actions">
          <button className="secondary-button" type="button" disabled={isEmpty} onClick={() => flow.push(reviewScreen(makeReviewQueue(currentQuestions, false).map(({ id }) => id)))}>
            顺序刷题
          </button>
          <button className="primary-button shuffle-button" type="button" aria-label="乱序刷题" disabled={isEmpty} onClick={() => flow.push(reviewScreen(makeReviewQueue(currentQuestions, true).map(({ id }) => id)))}>
            <ShuffleIcon aria-hidden="true" />乱序刷题
          </button>
        </div>
        {isEmpty ? (
          <p className="empty-library">还没有错题，先拍照录入一道吧</p>
        ) : visibleQuestions.length === 0 ? (
          <p className="empty-library">没有找到匹配的错题</p>
        ) : (
          <section className="question-list" aria-label="错题列表">
            {visibleQuestions.map((question, questionIndex) => (
              <button className="question-row" type="button" key={question.id} onClick={() => flow.push(questionScreen(question))}>
                <span>{String(questionIndex + 1).padStart(2, "0")}</span>
                <div><strong>{question.prompt}</strong><small>{question.subject} · {question.questionType}</small></div>
              </button>
            ))}
          </section>
        )}
      </main>
    </MobileScroll>
  );
}

function libraryScreen(group: LibraryGroup): FlowScreen {
  return {
    id: `library-${group.id}`,
    headerHeight: 54,
    header: (flow) => (
      <div className="app-header app-header-light">
        <button type="button" className="back-button" aria-label="返回" onClick={flow.pop}><ChevronLeftIcon /></button>
        <h1>{group.title}</h1>
        <span className="header-spacer" aria-hidden="true" />
      </div>
    ),
    render: (flow) => <LibraryView flow={flow} group={group} />,
  };
}

function QuestionDetail({ question }: { question: StoredQuestion }) {
  const { questions, pendingQuestionIds, dataMutationPending, editQuestion, removeQuestion } = useWrongbook();
  const liveFlow = useFlow();
  const detailKey = useRef(liveFlow.current.key);
  const storedQuestion = questions.find((item) => item.id === question.id);
  const questionExists = Boolean(storedQuestion);
  const sessionBusy = pendingQuestionIds.has(question.id);
  const [prompt, setPrompt] = useState(question.prompt);
  const [answer, setAnswer] = useState(question.answer);
  const [target, setTarget] = useState(question.target);
  const [subject, setSubject] = useState(question.subject);
  const [questionType, setQuestionType] = useState(question.questionType);
  const [note, setNote] = useState(question.note);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingSessionSync, setAwaitingSessionSync] = useState(sessionBusy);
  const controlsDisabled = busy || sessionBusy || awaitingSessionSync || dataMutationPending;

  useEffect(() => {
    if (!questionExists && liveFlow.current.key === detailKey.current) liveFlow.pop();
  }, [liveFlow, questionExists]);

  useEffect(() => {
    if (sessionBusy) {
      setAwaitingSessionSync(true);
      return;
    }
    if (!awaitingSessionSync || !storedQuestion) return;
    setPrompt(storedQuestion.prompt);
    setAnswer(storedQuestion.answer);
    setTarget(storedQuestion.target);
    setSubject(storedQuestion.subject);
    setQuestionType(storedQuestion.questionType);
    setNote(storedQuestion.note);
    setAwaitingSessionSync(false);
  }, [awaitingSessionSync, sessionBusy, storedQuestion]);

  const clearFeedback = () => {
    setStatus("");
    setError("");
  };

  const save = async () => {
    if (controlsDisabled) return;
    clearFeedback();
    if (!prompt.trim()) {
      setError("请填写题目文字");
      return;
    }
    setBusy(true);
    const updated: StoredQuestion = {
      ...question,
      prompt: prompt.trim(),
      answer: answer.trim(),
      target,
      subject,
      questionType,
      note: note.trim(),
    };
    try {
      await editQuestion(updated);
      setStatus("已保存");
    } catch {
      setError("保存失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (controlsDisabled) return;
    if (!window.confirm(`确定删除“${question.prompt.slice(0, 24)}”吗？`)) return;
    setBusy(true);
    clearFeedback();
    try {
      await removeQuestion(question.id);
    } catch {
      setError("删除失败，请重试");
      setBusy(false);
    }
  };

  return (
    <MobileScroll className="app-screen confirm-page">
      <main className="confirm-content">
        <StoredImage image={storedQuestion?.image ?? question.image} alt="原题图片" className="review-image" />
        <label className="text-field question-preview">
          <span>题目文字</span>
          <KeyboardTextarea aria-label="题目文字" value={prompt} disabled={controlsDisabled} onChange={(event) => {
            clearFeedback();
            setPrompt(event.target.value);
          }} rows={5} />
        </label>
        <section className="form-section" aria-labelledby="detail-target-label">
          <h3 id="detail-target-label">考试目标</h3>
          <div className="choice-row">
            {targetChoices.map((choice) => (
              <button key={choice} type="button" className="choice-chip" aria-pressed={target === choice} disabled={controlsDisabled} onClick={() => {
                clearFeedback();
                setTarget(choice);
              }}>{choice}</button>
            ))}
          </div>
        </section>
        <section className="form-section" aria-labelledby="detail-subject-label">
          <h3 id="detail-subject-label">科目</h3>
          <div className="choice-row">
            {subjectChoices.map((choice) => (
              <button key={choice} type="button" className="choice-chip" aria-pressed={subject === choice} disabled={controlsDisabled} onClick={() => {
                clearFeedback();
                setSubject(choice);
              }}>{choice}</button>
            ))}
          </div>
        </section>
        <section className="form-section" aria-labelledby="detail-question-type-label">
          <h3 id="detail-question-type-label">题型</h3>
          <div className="choice-row">
            {questionTypes.map((choice) => (
              <button key={choice} type="button" className="choice-chip" aria-pressed={questionType === choice} disabled={controlsDisabled} onClick={() => {
                clearFeedback();
                setQuestionType(choice);
              }}>{choice}</button>
            ))}
          </div>
        </section>
        <label className="text-field">
          <span>正确答案</span>
          <KeyboardTextarea aria-label="正确答案" value={answer} disabled={controlsDisabled} onChange={(event) => {
            clearFeedback();
            setAnswer(event.target.value);
          }} rows={2} />
        </label>
        <label className="text-field">
          <span>个人笔记</span>
          <KeyboardTextarea value={note} disabled={controlsDisabled} onChange={(event) => {
            clearFeedback();
            setNote(event.target.value);
          }} placeholder="记录错误原因或解题提醒" rows={3} />
        </label>
        {status ? <p className="recognition-status" role="status">{status}</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="button" disabled={controlsDisabled} onClick={save}>{busy ? "处理中…" : "保存修改"}</button>
        <button className="secondary-button delete-question-button" type="button" disabled={controlsDisabled} onClick={remove}>删除错题</button>
      </main>
    </MobileScroll>
  );
}

function questionScreen(question: StoredQuestion): FlowScreen {
  return {
    id: `question-${question.id}`,
    headerHeight: 54,
    header: (flow) => (
      <div className="app-header app-header-light">
        <button type="button" className="back-button" aria-label="返回" onClick={flow.pop}><ChevronLeftIcon /></button>
        <h1>错题详情</h1>
        <span className="header-spacer" aria-hidden="true" />
      </div>
    ),
    render: () => <QuestionDetail question={question} />,
  };
}

function ConfirmQuestion({ flow, image, recognizedText, manual, emptyResult }: { flow: FlowControls; image: File; recognizedText: string; manual: boolean; emptyResult: boolean }) {
  const { saveQuestion, loadState, loadError, retryQuestionLoad } = useWrongbook();
  const inferred = useMemo(() => classifyQuestion(recognizedText), [recognizedText]);
  const [prompt, setPrompt] = useState(recognizedText);
  const [target, setTarget] = useState(inferred.target);
  const [subject, setSubject] = useState(inferred.subject);
  const [questionType, setQuestionType] = useState(inferred.questionType);
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!prompt.trim()) {
      setError("请填写题目文字");
      return;
    }
    setSaving(true);
    setError("");
    const question: StoredQuestion = {
      id: crypto.randomUUID(),
      prompt: prompt.trim(),
      answer: answer.trim(),
      target,
      subject,
      questionType,
      note: note.trim(),
      createdAt: new Date().toISOString(),
      image,
    };
    try {
      await saveQuestion(question);
      flow.replace(savedScreen(target, subject));
    } catch {
      setError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <MobileScroll className="app-screen confirm-page">
      <main className="confirm-content">
        <div className={`recognition-status${manual ? " recognition-status-manual" : ""}`} role="status">
          {manual ? <FileTextIcon aria-hidden="true" /> : <CheckIcon aria-hidden="true" />}
          <span>{emptyResult ? "未识别到清晰文字，请手动录入" : manual ? "等待手动录入" : "识别完成"}</span>
        </div>
        <label className="text-field question-preview">
          <span>识别结果</span>
          <KeyboardTextarea aria-label="识别结果" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="输入或修正识别出的题目文字" rows={5} />
        </label>
        <section className="form-section" aria-labelledby="target-label">
          <h3 id="target-label">考试目标</h3>
          <div className="choice-row">
            {targetChoices.map((choice) => (
              <button key={choice} type="button" className="choice-chip" aria-pressed={target === choice} onClick={() => setTarget(choice)}>{choice}</button>
            ))}
          </div>
        </section>
        <section className="form-section" aria-labelledby="subject-label">
          <h3 id="subject-label">科目</h3>
          <div className="choice-row">
            {subjectChoices.map((choice) => (
              <button key={choice} type="button" className="choice-chip" aria-pressed={subject === choice} onClick={() => setSubject(choice)}>{choice}</button>
            ))}
          </div>
        </section>
        <section className="form-section" aria-labelledby="question-type-label">
          <h3 id="question-type-label">题型</h3>
          <div className="choice-row">
            {questionTypes.map((choice) => (
              <button key={choice} type="button" className="choice-chip" aria-pressed={questionType === choice} onClick={() => setQuestionType(choice)}>{choice}</button>
            ))}
          </div>
        </section>
        <label className="text-field">
          <span>正确答案</span>
          <KeyboardTextarea aria-label="正确答案" value={answer} onChange={(event) => setAnswer(event.target.value)} rows={2} />
        </label>
        <label className="text-field">
          <span>个人笔记</span>
          <KeyboardTextarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="记录错误原因或解题提醒" rows={3} />
        </label>
        {loadError ? (
          <div>
            <p className="form-error" role="alert">{loadError}</p>
            <button className="secondary-button" type="button" onClick={retryQuestionLoad}>重试加载题库</button>
          </div>
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="button" aria-label="保存错题" disabled={saving || loadState !== "ready"} onClick={save}>{saving ? "保存中…" : "保存错题"}</button>
      </main>
    </MobileScroll>
  );
}

function confirmScreen(image: File, recognizedText: string, manual: boolean, emptyResult = false): FlowScreen {
  return {
    id: "confirm",
    headerHeight: 54,
    header: (flow) => (
      <div className="app-header app-header-light">
        <button type="button" className="back-button" aria-label="返回" onClick={flow.pop}><ChevronLeftIcon /></button>
        <h1>确认错题</h1>
        <span className="header-spacer" aria-hidden="true" />
      </div>
    ),
    render: (flow) => <ConfirmQuestion flow={flow} image={image} recognizedText={recognizedText} manual={manual} emptyResult={emptyResult} />,
  };
}

type ScanTask = { abort: () => void };

function ScanView({ flow, task }: { flow: FlowControls; task: ScanTask }) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [error, setError] = useState("");
  const [recognizing, setRecognizing] = useState(false);
  const recognitionId = useRef(0);
  const recognitionController = useRef<AbortController | null>(null);

  const abortRecognition = useCallback(() => {
    recognitionId.current += 1;
    recognitionController.current?.abort();
    recognitionController.current = null;
  }, []);

  useEffect(() => {
    task.abort = abortRecognition;
    return () => {
      abortRecognition();
      task.abort = () => {};
    };
  }, [abortRecognition, task]);

  useEffect(() => {
    if (!image) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setImage(null);
      setError("请选择图片文件");
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setImage(null);
      setError("图片不能超过 10 MB");
      return;
    }
    setImage(selected);
    setError("");
    setProgress(null);
  };

  const startRecognition = async () => {
    if (!image) return;
    const requestId = recognitionId.current + 1;
    recognitionId.current = requestId;
    const controller = new AbortController();
    recognitionController.current = controller;
    setRecognizing(true);
    setError("");
    setProgress({ status: "准备识别", progress: 0 });
    try {
      const { recognizeQuestion } = await import("./ocr");
      const text = await recognizeQuestion(image, setProgress, undefined, controller.signal);
      if (requestId !== recognitionId.current) return;
      flow.push(confirmScreen(image, text, !text, !text));
    } catch (reason) {
      if (requestId !== recognitionId.current || (reason instanceof DOMException && reason.name === "AbortError")) return;
      setError("识别失败，请重试或手动录入");
    } finally {
      if (requestId === recognitionId.current) {
        recognitionController.current = null;
        setRecognizing(false);
      }
    }
  };

  return (
    <MobileScroll className="app-screen scan-page">
      <main className="scan-content">
        <input ref={cameraInput} className="scan-input" data-testid="camera-input" type="file" accept="image/*" capture="environment" onChange={selectImage} />
        <input ref={galleryInput} className="scan-input" data-testid="gallery-input" type="file" accept="image/*" onChange={selectImage} />
        <section className="scan-guide" aria-label="拍照区域">
          {preview ? <img className="scan-preview" src={preview} alt="待识别题目" draggable={false} /> : (
            <><CameraIcon aria-hidden="true" /><h2>将整道题放入画面</h2><p>请保持页面平整、文字清晰，图片与公式会随原题一起保留。</p></>
          )}
        </section>
        {error ? <p className="form-error scan-error" role="alert">{error}</p> : null}
        {progress ? <div className="scan-progress" role="status"><span>{progress.status}</span><strong>{Math.round(progress.progress * 100)}%</strong></div> : null}
        <div className="scan-source-actions">
          <button className="scan-action" type="button" disabled={recognizing} onClick={() => cameraInput.current?.click()}><CameraIcon aria-hidden="true" /><span>拍照</span></button>
          <button className="scan-action" type="button" disabled={recognizing} onClick={() => galleryInput.current?.click()}><FileTextIcon aria-hidden="true" /><span>从相册选择</span></button>
        </div>
        {image ? (
          <div className="scan-actions">
            <button className="secondary-button" type="button" disabled={recognizing} onClick={() => flow.push(confirmScreen(image, "", true))}>手动录入</button>
            <button className="primary-button" type="button" disabled={recognizing} onClick={startRecognition}>{recognizing ? "识别中…" : "开始识别"}</button>
          </div>
        ) : null}
      </main>
    </MobileScroll>
  );
}

function scanScreen(): FlowScreen {
  const task: ScanTask = { abort: () => {} };
  return {
    id: "scan",
    headerHeight: 54,
    header: (flow) => (
      <div className="app-header app-header-dark">
        <button type="button" className="back-button" aria-label="返回" onClick={() => {
          task.abort();
          flow.pop();
        }}><ChevronLeftIcon /></button>
        <h1>拍照录入</h1>
        <span className="header-spacer" aria-hidden="true" />
      </div>
    ),
    render: (flow) => <ScanView flow={flow} task={task} />,
  };
}

function DataManagement() {
  const { questions, loadState, loadError, pendingQuestionIds, dataMutationPending, importQuestionBatch, clearAllQuestions } = useWrongbook();
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const controlsDisabled = busy || loadState !== "ready" || pendingQuestionIds.size > 0 || dataMutationPending;

  useEffect(() => {
    setBackupFile(null);
  }, [questions]);

  const clearFeedback = () => {
    setStatus("");
    setError("");
  };

  const generateBackup = async () => {
    if (controlsDisabled || !window.confirm("备份包含原题照片和个人笔记，且未加密。继续生成吗？")) return;
    clearFeedback();
    setBackupFile(null);
    setBusy(true);
    try {
      const blob = await createBackupBlob(questions);
      const date = new Date().toISOString().slice(0, 10);
      setBackupFile(new File([blob], `cuotiji-${date}.cuotiji.json`, { type: "application/json" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "备份生成失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const shareBackup = async () => {
    if (controlsDisabled || !backupFile) return;
    clearFeedback();
    setBusy(true);
    const shareData = { files: [backupFile], title: "错题集完整备份" };
    try {
      if (Capacitor.isNativePlatform()) {
        const { uri } = await Filesystem.writeFile({
          path: backupFile.name,
          data: await backupFile.text(),
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        await Share.share({
          files: [uri],
          title: "错题集完整备份",
          dialogTitle: "分享或保存错题集备份",
        });
      } else if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
      } else {
        const url = URL.createObjectURL(backupFile);
        const link = document.createElement("a");
        link.href = url;
        link.download = backupFile.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
      setStatus("备份已导出");
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "备份导出失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || controlsDisabled) return;
    clearFeedback();
    setBusy(true);
    try {
      const incoming = await parseBackupFile(file);
      const { added, skipped } = await importQuestionBatch(incoming);
      setStatus(`导入完成：新增 ${added} 道，跳过 ${skipped} 道`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "备份导入失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    if (controlsDisabled || !window.confirm("确定要清空全部题库吗？")) return;
    if (!window.confirm(`将永久删除 ${questions.length} 道错题，此操作无法撤销。继续吗？`)) return;
    clearFeedback();
    setBusy(true);
    try {
      await clearAllQuestions();
      setStatus("题库已清空");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "清空题库失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileScroll className="app-screen detail-page">
      <main className="detail-content">
        <div className="detail-summary">
          <span>{loadState === "ready" ? `当前共 ${questions.length} 道错题` : "题库数据尚未就绪"}</span>
          <p>完整备份包含原题照片和个人笔记，文件未加密，请妥善保管。</p>
        </div>
        <input ref={fileInput} className="scan-input" data-testid="backup-input" type="file" accept=".json,application/json" onChange={importBackup} />
        <div className="management-actions">
          <button className="primary-button" type="button" disabled={controlsDisabled} onClick={generateBackup}>生成完整备份</button>
          <button className="secondary-button" type="button" disabled={controlsDisabled || !backupFile} onClick={shareBackup}>分享或下载</button>
          <button className="secondary-button" type="button" disabled={controlsDisabled} onClick={() => fileInput.current?.click()}>导入备份</button>
          <button className="danger-button" type="button" disabled={controlsDisabled} onClick={clearAll}>清空全部题库</button>
        </div>
        {status || backupFile ? <p className="recognition-status" role="status">{status || "完整备份已生成，可点击“分享或下载”"}</p> : null}
        {loadError || error ? <p className="form-error" role="alert">{loadError || error}</p> : null}
      </main>
    </MobileScroll>
  );
}

function dataManagementScreen(): FlowScreen {
  return {
    id: "data-management",
    headerHeight: 54,
    header: (flow) => (
      <div className="app-header app-header-light">
        <button type="button" className="back-button" aria-label="返回" onClick={flow.pop}><ChevronLeftIcon /></button>
        <h1>数据管理</h1>
        <span className="header-spacer" aria-hidden="true" />
      </div>
    ),
    render: () => <DataManagement />,
  };
}

function HomeView({ flow }: { flow: FlowControls }) {
  const { questions, loadError } = useWrongbook();
  const groups = libraryGroupsWithCounts(questions);
  return (
    <MobileScroll className="app-screen">
      <main className="home-screen">
        <header className="home-intro"><h1>错题集</h1><p>拍照录入错题，按目标与科目分类整理，高效复习</p></header>
        <button className="capture-button" type="button" aria-label="拍照录入" onClick={() => flow.push(scanScreen())}>
          <span className="capture-icon" aria-hidden="true"><CameraIcon /></span>
          <span className="capture-divider" aria-hidden="true" />
          <span>拍照录入</span>
        </button>
        {loadError ? <p className="form-error" role="alert">{loadError}</p> : null}
        <section className="library-section" aria-labelledby="library-heading">
          <h2 id="library-heading">我的题库</h2>
          <div className="library-list">
            {groups.map((group) => {
              const Icon = icons[group.icon];
              return (
                <button className="library-row" type="button" key={group.id} aria-label={group.title} onClick={() => flow.push(libraryScreen(group))}>
                  <span className="library-icon" aria-hidden="true"><Icon /></span>
                  <span className="library-copy"><strong>{group.title}</strong></span>
                  <ChevronRightIcon className="library-chevron" aria-hidden="true" />
                </button>
              );
            })}
            <button className="library-row" type="button" aria-label="数据管理" onClick={() => flow.push(dataManagementScreen())}>
              <span className="library-icon" aria-hidden="true"><ArchiveIcon /></span>
              <span className="library-copy"><strong>数据管理</strong><small>导入、导出与清空题库</small></span>
              <ChevronRightIcon className="library-chevron" aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>
    </MobileScroll>
  );
}

const homeScreen: FlowScreen = { id: "home", render: (flow) => <HomeView flow={flow} /> };

export default function Prototype() {
  const [questions, setQuestions] = useState<StoredQuestion[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const pendingQuestionMutations = useRef(new Set<string>());
  const [pendingQuestionIds, setPendingQuestionIds] = useState<ReadonlySet<string>>(new Set());
  const dataMutation = useRef(false);
  const [dataMutationPending, setDataMutationPending] = useState(false);

  useEffect(() => {
    let active = true;
    listQuestions().then((stored) => {
      if (active) {
        setQuestions(stored.sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
        setLoadState("ready");
      }
    }).catch(() => {
      if (active) {
        setLoadError("本地题库加载失败，请重试");
        setLoadState("error");
      }
    });
    return () => { active = false; };
  }, [loadAttempt]);

  const retryQuestionLoad = useCallback(() => {
    setLoadError("");
    setLoadState("loading");
    setLoadAttempt((current) => current + 1);
  }, []);

  const beginQuestionMutation = useCallback((id: string) => {
    if (dataMutation.current || pendingQuestionMutations.current.has(id)) return false;
    pendingQuestionMutations.current.add(id);
    setPendingQuestionIds(new Set(pendingQuestionMutations.current));
    return true;
  }, []);
  const finishQuestionMutation = useCallback((id: string) => {
    pendingQuestionMutations.current.delete(id);
    setPendingQuestionIds(new Set(pendingQuestionMutations.current));
  }, []);
  const saveQuestion = useCallback(async (question: StoredQuestion) => {
    if (loadState !== "ready") throw new Error("请等待题库加载完成");
    if (!beginQuestionMutation(question.id)) throw new Error("Question mutation already pending");
    try {
      await addQuestion(question);
      setQuestions((current) => [question, ...current]);
    } finally {
      finishQuestionMutation(question.id);
    }
  }, [beginQuestionMutation, finishQuestionMutation, loadState]);
  const editQuestion = useCallback(async (question: StoredQuestion) => {
    if (!beginQuestionMutation(question.id)) throw new Error("Question mutation already pending");
    try {
      await updateQuestion(question);
      setQuestions((current) => current.map((item) => item.id === question.id ? question : item));
    } finally {
      finishQuestionMutation(question.id);
    }
  }, [beginQuestionMutation, finishQuestionMutation]);
  const removeQuestion = useCallback(async (id: string) => {
    if (!beginQuestionMutation(id)) throw new Error("Question mutation already pending");
    try {
      await deleteQuestion(id);
      setQuestions((current) => current.filter((item) => item.id !== id));
    } finally {
      finishQuestionMutation(id);
    }
  }, [beginQuestionMutation, finishQuestionMutation]);
  const beginDataMutation = useCallback(() => {
    if (dataMutation.current || pendingQuestionMutations.current.size) return false;
    dataMutation.current = true;
    setDataMutationPending(true);
    return true;
  }, []);
  const finishDataMutation = useCallback(() => {
    dataMutation.current = false;
    setDataMutationPending(false);
  }, []);
  const importQuestionBatch = useCallback(async (incoming: readonly StoredQuestion[]) => {
    if (loadState !== "ready" || !beginDataMutation()) throw new Error("请等待题库加载或正在进行的操作完成");
    try {
      const result = await importStoredQuestions(incoming);
      setQuestions((current) => [...result.added, ...current].sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
      return { added: result.added.length, skipped: result.skipped };
    } finally {
      finishDataMutation();
    }
  }, [beginDataMutation, finishDataMutation, loadState]);
  const clearAllQuestions = useCallback(async () => {
    if (loadState !== "ready" || !beginDataMutation()) throw new Error("请等待题库加载或正在进行的操作完成");
    try {
      await clearStoredQuestions();
      setQuestions([]);
    } finally {
      finishDataMutation();
    }
  }, [beginDataMutation, finishDataMutation, loadState]);
  const session = useMemo(
    () => ({ questions, loadState, loadError, retryQuestionLoad, pendingQuestionIds, dataMutationPending, saveQuestion, editQuestion, removeQuestion, importQuestionBatch, clearAllQuestions }),
    [questions, loadState, loadError, retryQuestionLoad, pendingQuestionIds, dataMutationPending, saveQuestion, editQuestion, removeQuestion, importQuestionBatch, clearAllQuestions],
  );

  return <WrongbookContext.Provider value={session}><FlowStack initial={homeScreen} /></WrongbookContext.Provider>;
}
