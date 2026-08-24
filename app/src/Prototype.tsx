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
import { FlowStack, KeyboardInput, KeyboardTextarea, MobileScroll, type FlowControls, type FlowScreen } from "./mobile";
import type { OcrProgress } from "./ocr";
import {
  classifyQuestion,
  libraryGroupsWithCounts,
  makeReviewQueue,
  questionTypes,
  questionsForGroup,
  type LibraryGroup,
  type StoredQuestion,
} from "./wrongbook-model";
import { addQuestion, deleteQuestion, listQuestions, updateQuestion } from "./wrongbook-store";

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
  loadError: string;
  saveQuestion: (question: StoredQuestion) => Promise<void>;
  editQuestion: (question: StoredQuestion) => Promise<void>;
  removeQuestion: (id: string) => Promise<void>;
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

function ReviewSession({ queue }: { queue: StoredQuestion[] }) {
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const question = queue[index];

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
            setIndex((value) => (value + 1) % queue.length);
            setShowAnswer(false);
          }}>
            下一题
          </button>
        </div>
      </main>
    </MobileScroll>
  );
}

function reviewScreen(queue: StoredQuestion[]): FlowScreen {
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
    render: () => <ReviewSession queue={queue} />,
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
          <button className="secondary-button" type="button" disabled={isEmpty} onClick={() => flow.push(reviewScreen(makeReviewQueue(currentQuestions, false)))}>
            顺序刷题
          </button>
          <button className="primary-button shuffle-button" type="button" aria-label="乱序刷题" disabled={isEmpty} onClick={() => flow.push(reviewScreen(makeReviewQueue(currentQuestions, true)))}>
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

function QuestionDetail({ flow, question }: { flow: FlowControls; question: StoredQuestion }) {
  const { editQuestion, removeQuestion } = useWrongbook();
  const [prompt, setPrompt] = useState(question.prompt);
  const [answer, setAnswer] = useState(question.answer);
  const [target, setTarget] = useState(question.target);
  const [subject, setSubject] = useState(question.subject);
  const [questionType, setQuestionType] = useState(question.questionType);
  const [note, setNote] = useState(question.note);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!prompt.trim()) {
      setError("请填写题目文字");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("");
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
    if (!window.confirm(`确定删除“${question.prompt.slice(0, 24)}”吗？`)) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await removeQuestion(question.id);
      flow.pop();
    } catch {
      setError("删除失败，请重试");
      setBusy(false);
    }
  };

  return (
    <MobileScroll className="app-screen confirm-page">
      <main className="confirm-content">
        <label className="text-field question-preview">
          <span>题目文字</span>
          <KeyboardTextarea aria-label="题目文字" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} />
        </label>
        <section className="form-section" aria-labelledby="detail-target-label">
          <h3 id="detail-target-label">考试目标</h3>
          <div className="choice-row">
            {targetChoices.map((choice) => (
              <button key={choice} type="button" className="choice-chip" aria-pressed={target === choice} onClick={() => setTarget(choice)}>{choice}</button>
            ))}
          </div>
        </section>
        <section className="form-section" aria-labelledby="detail-subject-label">
          <h3 id="detail-subject-label">科目</h3>
          <div className="choice-row">
            {subjectChoices.map((choice) => (
              <button key={choice} type="button" className="choice-chip" aria-pressed={subject === choice} onClick={() => setSubject(choice)}>{choice}</button>
            ))}
          </div>
        </section>
        <section className="form-section" aria-labelledby="detail-question-type-label">
          <h3 id="detail-question-type-label">题型</h3>
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
        {status ? <p className="recognition-status" role="status">{status}</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="button" disabled={busy} onClick={save}>{busy ? "处理中…" : "保存修改"}</button>
        <button className="secondary-button delete-question-button" type="button" disabled={busy} onClick={remove}>删除错题</button>
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
    render: (flow) => <QuestionDetail flow={flow} question={question} />,
  };
}

function ConfirmQuestion({ flow, image, recognizedText, manual, emptyResult }: { flow: FlowControls; image: File; recognizedText: string; manual: boolean; emptyResult: boolean }) {
  const { saveQuestion } = useWrongbook();
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
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="button" aria-label="保存错题" disabled={saving} onClick={save}>{saving ? "保存中…" : "保存错题"}</button>
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
          </div>
        </section>
      </main>
    </MobileScroll>
  );
}

const homeScreen: FlowScreen = { id: "home", render: (flow) => <HomeView flow={flow} /> };

export default function Prototype() {
  const [questions, setQuestions] = useState<StoredQuestion[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    listQuestions().then((stored) => {
      if (active) setQuestions(stored.sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    }).catch(() => {
      if (active) setLoadError("本地题库加载失败，请刷新重试");
    });
    return () => { active = false; };
  }, []);

  const saveQuestion = useCallback(async (question: StoredQuestion) => {
    await addQuestion(question);
    setQuestions((current) => [question, ...current]);
  }, []);
  const editQuestion = useCallback(async (question: StoredQuestion) => {
    await updateQuestion(question);
    setQuestions((current) => current.map((item) => item.id === question.id ? question : item));
  }, []);
  const removeQuestion = useCallback(async (id: string) => {
    await deleteQuestion(id);
    setQuestions((current) => current.filter((item) => item.id !== id));
  }, []);
  const session = useMemo(
    () => ({ questions, loadError, saveQuestion, editQuestion, removeQuestion }),
    [questions, loadError, saveQuestion, editQuestion, removeQuestion],
  );

  return <WrongbookContext.Provider value={session}><FlowStack initial={homeScreen} /></WrongbookContext.Provider>;
}
