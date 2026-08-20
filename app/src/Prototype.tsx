import { useState, type ComponentType } from "react";
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
import { FlowStack, KeyboardTextarea, MobileScroll, type FlowControls, type FlowScreen } from "./mobile";
import {
  libraryGroups,
  makeReviewQueue,
  reviewQuestions,
  type LibraryGroup,
  type WrongQuestion,
} from "./wrongbook-model";

const icons: Record<LibraryGroup["icon"], ComponentType> = {
  graduate: ArchiveIcon,
  briefcase: BackpackIcon,
  school: FileTextIcon,
  book: ReaderIcon,
  grid: GridIcon,
};

function savedScreen(target: string, subject: string): FlowScreen {
  return {
    id: "saved",
    render: () => (
      <MobileScroll className="app-screen success-page">
        <main className="success-content">
          <span className="success-icon" aria-hidden="true">
            <CheckIcon />
          </span>
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

function ReviewSession({ flow, queue }: { flow: FlowControls; queue: WrongQuestion[] }) {
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const question = queue[index];

  return (
    <MobileScroll className="app-screen review-page">
      <main className="review-content">
        <div className="review-meta">
          <span>第 {index + 1} / {queue.length} 题</span>
          <span>{question.tag}</span>
        </div>
        <article className="review-card">
          <h2>{question.prompt}</h2>
          {showAnswer ? <p className="answer-text">正确答案：{question.answer}</p> : null}
        </article>
        <div className="review-actions">
          <button className="secondary-button" type="button" onClick={() => setShowAnswer((value) => !value)}>
            {showAnswer ? "隐藏答案" : "显示答案"}
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setIndex((value) => (value + 1) % queue.length);
              setShowAnswer(false);
            }}
          >
            下一题
          </button>
        </div>
      </main>
    </MobileScroll>
  );
}

function reviewScreen(queue: WrongQuestion[]): FlowScreen {
  return {
    id: "review",
    headerHeight: 54,
    header: (flow) => (
      <div className="app-header app-header-light">
        <button type="button" className="back-button" aria-label="返回" onClick={flow.pop}>
          <ChevronLeftIcon />
        </button>
        <h1>刷错题</h1>
        <span className="header-spacer" aria-hidden="true" />
      </div>
    ),
    render: (flow) => <ReviewSession flow={flow} queue={queue} />,
  };
}

function LibraryView({ flow, group }: { flow: FlowControls; group: LibraryGroup }) {
  return (
    <MobileScroll className="app-screen detail-page">
      <main className="detail-content">
        <div className="detail-summary">
          <span>{group.count} 道错题</span>
          <p>按保存时间查看，或直接开始一轮复习。</p>
        </div>
        <div className="study-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => flow.push(reviewScreen(makeReviewQueue(reviewQuestions, false)))}
          >
            顺序刷题
          </button>
          <button
            className="primary-button shuffle-button"
            type="button"
            aria-label="乱序刷题"
            onClick={() => flow.push(reviewScreen(makeReviewQueue(reviewQuestions, true)))}
          >
            <ShuffleIcon aria-hidden="true" />
            乱序刷题
          </button>
        </div>
        <section className="question-list" aria-label="错题列表">
          {reviewQuestions.map((question, index) => (
            <article className="question-row" key={question.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{question.prompt}</strong>
                <small>{question.tag}</small>
              </div>
            </article>
          ))}
        </section>
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
        <button type="button" className="back-button" aria-label="返回" onClick={flow.pop}>
          <ChevronLeftIcon />
        </button>
        <h1>{group.title}</h1>
        <span className="header-spacer" aria-hidden="true" />
      </div>
    ),
    render: (flow) => <LibraryView flow={flow} group={group} />,
  };
}

function ConfirmQuestion({ flow }: { flow: FlowControls }) {
  const [target, setTarget] = useState("考研数学");
  const [subject, setSubject] = useState("高等数学");
  const [answer, setAnswer] = useState("2");
  const [note, setNote] = useState("");

  return (
    <MobileScroll className="app-screen confirm-page">
      <main className="confirm-content">
        <div className="recognition-status" role="status">
          <CheckIcon aria-hidden="true" />
          <span>识别完成</span>
        </div>

        <section className="question-preview" aria-labelledby="recognized-question">
          <span className="eyebrow">识别结果</span>
          <h2 id="recognized-question">设函数 f(x)=x³-3x，求 f′(x) 的极值点。</h2>
        </section>

        <section className="form-section" aria-labelledby="target-label">
          <h3 id="target-label">考试目标</h3>
          <div className="choice-row">
            {["考研数学", "公务员考试", "其他"].map((choice) => (
              <button
                key={choice}
                type="button"
                className="choice-chip"
                aria-pressed={target === choice}
                onClick={() => setTarget(choice)}
              >
                {choice}
              </button>
            ))}
          </div>
        </section>

        <section className="form-section" aria-labelledby="subject-label">
          <h3 id="subject-label">科目</h3>
          <div className="choice-row">
            {["高等数学", "线性代数", "概率论"].map((choice) => (
              <button
                key={choice}
                type="button"
                className="choice-chip"
                aria-pressed={subject === choice}
                onClick={() => setSubject(choice)}
              >
                {choice}
              </button>
            ))}
          </div>
        </section>

        <label className="text-field">
          <span>正确答案</span>
          <KeyboardTextarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={2} />
        </label>

        <label className="text-field">
          <span>个人笔记</span>
          <KeyboardTextarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="记录错误原因或解题提醒"
            rows={3}
          />
        </label>

        <button
          className="primary-button"
          type="button"
          aria-label="保存错题"
          onClick={() => flow.push(savedScreen(target, subject))}
        >
          保存错题
        </button>
      </main>
    </MobileScroll>
  );
}

const confirmScreen: FlowScreen = {
  id: "confirm",
  headerHeight: 54,
  header: (flow) => (
    <div className="app-header app-header-light">
      <button type="button" className="back-button" aria-label="返回" onClick={flow.pop}>
        <ChevronLeftIcon />
      </button>
      <h1>确认错题</h1>
      <span className="header-spacer" aria-hidden="true" />
    </div>
  ),
  render: (flow) => <ConfirmQuestion flow={flow} />,
};

const scanScreen: FlowScreen = {
  id: "scan",
  headerHeight: 54,
  header: (flow) => (
    <div className="app-header app-header-dark">
      <button type="button" className="back-button" aria-label="返回" onClick={flow.pop}>
        <ChevronLeftIcon />
      </button>
      <h1>拍照录入</h1>
      <span className="header-spacer" aria-hidden="true" />
    </div>
  ),
  render: (flow) => (
    <MobileScroll className="app-screen scan-page">
      <main className="scan-content">
        <section className="scan-guide" aria-label="拍照区域">
          <CameraIcon aria-hidden="true" />
          <h2>将整道题放入画面</h2>
          <p>请保持页面平整、文字清晰，图片与公式会随原题一起保留。</p>
        </section>
        <button
          className="scan-action"
          type="button"
          aria-label="模拟拍照并识别"
          onClick={() => flow.push(confirmScreen)}
        >
          <CameraIcon aria-hidden="true" />
          <span>模拟拍照并识别</span>
        </button>
      </main>
    </MobileScroll>
  ),
};

const homeScreen: FlowScreen = {
  id: "home",
  render: (flow) => (
    <MobileScroll className="app-screen">
      <main className="home-screen">
        <header className="home-intro">
          <h1>错题集</h1>
          <p>拍照录入错题，按目标与科目分类整理，高效复习</p>
        </header>

        <button
          className="capture-button"
          type="button"
          aria-label="拍照录入"
          onClick={() => flow.push(scanScreen)}
        >
          <span className="capture-icon" aria-hidden="true">
            <CameraIcon />
          </span>
          <span className="capture-divider" aria-hidden="true" />
          <span>拍照录入</span>
        </button>

        <section className="library-section" aria-labelledby="library-heading">
          <h2 id="library-heading">我的题库</h2>
          <div className="library-list">
            {libraryGroups.map((group) => {
              const Icon = icons[group.icon];
              return (
                <button
                  className="library-row"
                  type="button"
                  key={group.id}
                  aria-label={group.title}
                  onClick={() => flow.push(libraryScreen(group))}
                >
                  <span className="library-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="library-copy">
                    <strong>{group.title}</strong>
                  </span>
                  <ChevronRightIcon className="library-chevron" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </MobileScroll>
  ),
};

export default function Prototype() {
  return <FlowStack initial={homeScreen} />;
}
