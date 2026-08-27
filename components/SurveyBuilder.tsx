"use client";

import { useEffect, useState } from "react";
import type { GridColumn, QuestionType, SurveyConfig, SurveyImage, SurveyQuestion, SurveySection } from "@/lib/types";
import { otherLabelOf } from "@/lib/survey-utils";

type DraftQuestion = SurveyQuestion;
type DraftSection = SurveySection;
type SurveyListItem = {
  id: string;
  title: string;
  agency: string;
  source: "firestore" | "code";
  responseCount: number;
  archived: boolean;
};

const PASSWORD_STORAGE_KEY = "turas_admin_password";

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: "single", label: "단일선택" },
  { value: "multiple", label: "복수선택" },
  { value: "ranking", label: "순위선택" },
  { value: "matrix", label: "행렬형(표)" },
  { value: "grid", label: "입력형 표(칸 입력)" },
  { value: "text", label: "단답형" },
  { value: "textarea", label: "장문형" },
  { value: "number", label: "숫자형" },
  { value: "scale", label: "척도형" },
  { value: "file", label: "파일첨부" }
];

function makeInitialSurvey(): SurveyConfig {
  return {
    id: "new_survey_2027",
    agency: "한국산업기술진흥원 (KIAT)",
    title: "새 설문 제목을 입력해 주세요.",
    subtitle: "",
    description: "설문 목적을 입력해 주세요.",
    notice: ["제출해 주신 자료는 조사 목적 외에는 사용되지 않습니다."],
    endAt: "",
    anonymous: false,
    sections: [
      {
        id: "section_1",
        title: "1. 기본 문항",
        description: "설문 목적에 맞게 문항을 수정해 주세요.",
        questions: [
          {
            id: "q1",
            type: "text",
            title: "귀사의 기업명을 입력해 주세요.",
            required: true
          }
        ]
      }
    ]
  };
}

const initialSurvey: SurveyConfig = makeInitialSurvey();

export default function SurveyBuilder() {
  const [password, setPassword] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [survey, setSurvey] = useState<SurveyConfig>(initialSurvey);
  const [selectedSectionId, setSelectedSectionId] = useState(initialSurvey.sections[0].id);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [surveyList, setSurveyList] = useState<SurveyListItem[]>([]);
  const [showList, setShowList] = useState(false);
  const [origin, setOrigin] = useState("");
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  function askConfirm(opts: { title: string; message: string; confirmLabel: string; onConfirm: () => void }) {
    setConfirmState(opts);
  }

  const selectedSection =
    survey.sections.find((section) => section.id === selectedSectionId) || survey.sections[0];

  const shareUrl = origin ? `${origin}/survey/${survey.id}` : `/survey/${survey.id}`;

  useEffect(() => {
    const stored = sessionStorage.getItem(PASSWORD_STORAGE_KEY);
    if (stored) setPassword(stored);
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (password) void refreshList(password);
  }, [password]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2500);
  }

  async function refreshList(pw: string) {
    try {
      const response = await fetch("/api/admin/surveys", { headers: { "x-admin-password": pw } });
      if (response.status === 401) {
        sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
        setPassword("");
        showToast("비밀번호가 올바르지 않습니다.");
        return;
      }
      const result = (await response.json()) as { ok?: boolean; surveys?: SurveyListItem[] };
      if (result.ok && result.surveys) setSurveyList(result.surveys);
    } catch {
      showToast("설문 목록을 불러오지 못했습니다.");
    }
  }

  function submitPassword() {
    const value = passwordInput.trim();
    if (!value) return;
    sessionStorage.setItem(PASSWORD_STORAGE_KEY, value);
    setPassword(value);
    setPasswordInput("");
  }

  function saveSurvey() {
    // 이미 배포되어 응답을 받고 있는 설문을 덮어쓰는 경우 확인 단계를 둔다
    const existing = surveyList.find((s) => s.id === survey.id && s.source === "firestore");
    if (existing && existing.responseCount > 0) {
      askConfirm({
        title: "배포된 설문 덮어쓰기",
        message:
          `"${survey.title}" 설문은 이미 배포되어 ${existing.responseCount}건의 응답을 받았습니다.\n\n` +
          "문항을 바꾸면 이미 받은 응답과 구조가 어긋날 수 있습니다(기존 응답은 그대로 보존됩니다). " +
          "그래도 저장하시겠습니까?",
        confirmLabel: "저장하기",
        onConfirm: () => void doSave()
      });
      return;
    }
    void doSave();
  }

  async function doSave() {
    setSaving(true);
    try {
      const serialized = JSON.stringify({ config: survey });
      // Firestore 문서 한도(약 1MB) 초과 방지 — 주로 업로드한 이미지(base64) 때문
      const sizeKB = Math.round(new Blob([serialized]).size / 1024);
      if (sizeKB > 950) {
        showToast(`설문 용량이 너무 큽니다 (${sizeKB}KB). 이미지를 URL 링크로 바꾸거나 개수를 줄여 주세요.`);
        setSaving(false);
        return;
      }
      const response = await fetch("/api/admin/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: serialized
      });
      const result = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "저장에 실패했습니다.");
      }

      showToast(`저장되었습니다. (${survey.id})`);
      void refreshList(password);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function loadSurvey(item: SurveyListItem) {
    if (!item?.id) return;
    // 이미 배포되어 응답을 받은 설문을 수정하려는 경우 확인 단계를 둔다
    if (item.responseCount > 0) {
      askConfirm({
        title: "배포된 설문 수정",
        message:
          `"${item.title}" 설문은 이미 배포되어 ${item.responseCount}건의 응답을 받고 있습니다.\n\n` +
          "불러와서 수정한 뒤 저장하면 응답자에게 보이는 설문이 바뀝니다. " +
          "이미 받은 응답과 문항 구조가 어긋날 수 있으니 주의하세요. 불러와서 수정하시겠습니까?",
        confirmLabel: "불러와서 수정",
        onConfirm: () => void doLoad(item.id)
      });
      return;
    }
    void doLoad(item.id);
  }

  async function doLoad(surveyId: string) {
    if (!surveyId) return;
    try {
      const response = await fetch(`/api/admin/surveys?id=${encodeURIComponent(surveyId)}`, {
        headers: { "x-admin-password": password }
      });
      const result = (await response.json()) as { ok?: boolean; config?: SurveyConfig; message?: string };

      if (!response.ok || !result.ok || !result.config) {
        throw new Error(result.message || "불러오기에 실패했습니다.");
      }

      setSurvey(result.config);
      setSelectedSectionId(result.config.sections[0]?.id || "");
      setShowList(false);
      showToast(`${surveyId} 를 불러왔습니다.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "불러오기에 실패했습니다.");
    }
  }

  function toggleArchive(item: SurveyListItem) {
    if (item.source === "code") {
      showToast("코드에 정의된 설문은 보관 상태를 바꿀 수 없습니다.");
      return;
    }
    const toArchive = !item.archived;
    askConfirm({
      title: toArchive ? "설문 보관(종료)" : "설문 다시 열기",
      message: toArchive
        ? `"${item.title}" 설문을 보관하면 응답 페이지가 닫혀 더 이상 응답을 받지 않습니다.\n` +
          "이미 받은 응답은 그대로 보존됩니다. 보관할까요?"
        : `"${item.title}" 설문을 다시 열면 응답 페이지가 열려 다시 응답을 받습니다. 진행할까요?`,
      confirmLabel: toArchive ? "보관하기" : "다시 열기",
      onConfirm: () => void applyArchive(item.id, toArchive)
    });
  }

  async function applyArchive(surveyId: string, archived: boolean) {
    try {
      const res = await fetch(`/api/admin/surveys?id=${encodeURIComponent(surveyId)}`, {
        headers: { "x-admin-password": password }
      });
      const loaded = (await res.json()) as { ok?: boolean; config?: SurveyConfig; message?: string };
      if (!res.ok || !loaded.ok || !loaded.config) throw new Error(loaded.message || "설문을 불러오지 못했습니다.");

      const next = { ...loaded.config, archived };
      const saveRes = await fetch("/api/admin/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ config: next })
      });
      const saved = (await saveRes.json()) as { ok?: boolean; message?: string };
      if (!saveRes.ok || !saved.ok) throw new Error(saved.message || "상태 변경에 실패했습니다.");

      // 지금 편집 중인 설문과 같으면 화면 상태도 맞춰줌
      if (survey.id === surveyId) setSurvey((prev) => ({ ...prev, archived }));

      showToast(archived ? "보관함으로 옮겼습니다 (응답 종료)." : "다시 열었습니다 (응답 재개).");
      void refreshList(password);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "상태 변경에 실패했습니다.");
    }
  }

  async function deleteSurvey(item: SurveyListItem) {
    if (item.source === "code") {
      showToast("코드에 정의된 설문은 여기서 삭제할 수 없습니다.");
      return;
    }

    const warning =
      item.responseCount > 0
        ? `\n\n이미 ${item.responseCount}건의 응답이 수집되어 있습니다.\n응답과 첨부파일은 삭제되지 않고 남지만, 설문 페이지는 더 이상 열리지 않습니다.`
        : "";

    if (!confirm(`"${item.title}" (${item.id}) 설문을 삭제할까요?${warning}`)) return;

    try {
      const response = await fetch(`/api/admin/surveys?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
        headers: { "x-admin-password": password }
      });
      const result = (await response.json()) as { ok?: boolean; message?: string; warning?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "삭제에 실패했습니다.");
      }

      showToast(result.warning || `${item.id} 를 삭제했습니다.`);
      void refreshList(password);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    }
  }

  function updateSurvey<K extends keyof SurveyConfig>(key: K, value: SurveyConfig[K]) {
    setSurvey((prev) => ({ ...prev, [key]: value }));
  }

  function addSection() {
    const section: DraftSection = {
      id: `section_${survey.sections.length + 1}`,
      title: `${survey.sections.length + 1}. 새 섹션`,
      description: "",
      questions: []
    };
    setSurvey((prev) => ({ ...prev, sections: [...prev.sections, section] }));
    setSelectedSectionId(section.id);
  }

  function updateSection(sectionId: string, patch: Partial<DraftSection>) {
    setSurvey((prev) => ({
      ...prev,
      sections: prev.sections.map((section) =>
        section.id === sectionId ? { ...section, ...patch } : section
      )
    }));
    if (patch.id) setSelectedSectionId(patch.id);
  }

  function removeSection(sectionId: string) {
    if (survey.sections.length <= 1) {
      alert("섹션은 최소 1개가 필요합니다.");
      return;
    }
    const nextSections = survey.sections.filter((section) => section.id !== sectionId);
    setSurvey((prev) => ({ ...prev, sections: nextSections }));
    setSelectedSectionId(nextSections[0].id);
  }

  function addQuestion(sectionId: string, type: QuestionType = "single") {
    const questionCount = survey.sections.reduce((sum, section) => sum + section.questions.length, 0);
    const newQuestion: DraftQuestion = normalizeQuestion({
      id: `q${questionCount + 1}`,
      type,
      title: "새 문항을 입력해 주세요.",
      required: false
    });

    setSurvey((prev) => ({
      ...prev,
      sections: prev.sections.map((section) =>
        section.id === sectionId
          ? { ...section, questions: [...section.questions, newQuestion] }
          : section
      )
    }));
  }

  function updateQuestion(sectionId: string, questionId: string, patch: Partial<DraftQuestion>) {
    setSurvey((prev) => ({
      ...prev,
      sections: prev.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              questions: section.questions.map((question) =>
                question.id === questionId ? normalizeQuestion({ ...question, ...patch }) : question
              )
            }
          : section
      )
    }));
  }

  function removeQuestion(sectionId: string, questionId: string) {
    setSurvey((prev) => ({
      ...prev,
      sections: prev.sections.map((section) =>
        section.id === sectionId
          ? { ...section, questions: section.questions.filter((question) => question.id !== questionId) }
          : section
      )
    }));
  }

  async function copyShareUrl() {
    await navigator.clipboard.writeText(shareUrl);
    showToast("응답 링크가 복사되었습니다.");
  }

  function startNewSurvey() {
    const fresh = makeInitialSurvey();
    setSurvey(fresh);
    setSelectedSectionId(fresh.sections[0].id);
    setShowList(false);
    showToast("새 설문을 시작했습니다. 저장하면 보관함에 담깁니다.");
  }

  function createNewSurvey() {
    // 편집 중인 내용이 있으면(빈 초기 설문이 아니면) 확인 단계를 둔다
    const isPristine = JSON.stringify(survey) === JSON.stringify(makeInitialSurvey());
    if (isPristine) {
      startNewSurvey();
      return;
    }
    askConfirm({
      title: "설문 새로 만들기",
      message:
        "지금 편집 중인 내용이 화면에서 사라집니다.\n" +
        "보관함에 저장하지 않은 변경사항은 복구할 수 없어요. 새 설문을 시작할까요?\n\n" +
        "(이미 보관함에 저장된 설문은 그대로 남아 있습니다.)",
      confirmLabel: "새로 시작",
      onConfirm: startNewSurvey
    });
  }

  if (!password) {
    return (
      <main className="builder-gate">
        <div className="builder-gate-card">
          <h1>TURAS Survey Builder</h1>
          <p>관리자 비밀번호를 입력해 주세요.</p>
          <input
            type="password"
            value={passwordInput}
            autoFocus
            onChange={(event) => setPasswordInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitPassword();
            }}
          />
          <button className="builder-btn primary" onClick={submitPassword}>
            들어가기
          </button>
          {toast && <div className="builder-gate-error">{toast}</div>}
        </div>
      </main>
    );
  }

  function renderSurveyRow(item: SurveyListItem) {
    return (
      <div className="survey-list-row" key={item.id}>
        <div className="survey-list-info">
          <div className="survey-list-title">
            {item.title}
            {item.source === "code" && <span className="survey-list-tag">코드</span>}
            {item.archived && <span className="survey-list-tag archived-tag">보관됨</span>}
            {!item.archived && item.source === "firestore" && item.responseCount > 0 && (
              <span className="survey-list-tag deployed">진행 중 · 응답 {item.responseCount}건</span>
            )}
            {!item.archived && item.source === "firestore" && item.responseCount === 0 && (
              <span className="survey-list-tag draft">응답 대기</span>
            )}
          </div>
          <div className="survey-list-meta">
            {item.id} · 응답 {item.responseCount}건
          </div>
        </div>
        <div className="survey-list-actions">
          <button className="builder-btn secondary" onClick={() => loadSurvey(item)}>
            {item.responseCount > 0 ? "불러와서 수정" : "불러오기"}
          </button>
          {item.source === "firestore" && (
            <button className="builder-btn secondary" onClick={() => toggleArchive(item)}>
              {item.archived ? "다시 열기" : "보관(종료)"}
            </button>
          )}
          <button className="builder-btn danger" disabled={item.source === "code"} onClick={() => deleteSurvey(item)}>
            삭제
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="builder-shell">
      <header className="builder-topbar">
        <div>
          <div className="builder-logo">TURAS Survey Builder</div>
          <div className="builder-sub">설문 문항 생성 및 저장</div>
        </div>
        <div className="builder-actions">
          <button className="builder-btn secondary" onClick={createNewSurvey}>
            + 설문 새로 만들기
          </button>
          <button
            className="builder-btn secondary"
            onClick={() => {
              setShowList((v) => !v);
              if (password) void refreshList(password);
            }}
          >
            📁 보관함 {surveyList.length > 0 ? `(${surveyList.length})` : ""}
          </button>
          <a className="builder-btn secondary" href="/admin/responses">
            응답 현황
          </a>
          <a className="builder-btn secondary" href={`/survey/${survey.id}`} target="_blank">
            응답화면 열기
          </a>
          <button className="builder-btn primary" onClick={saveSurvey} disabled={saving}>
            {saving ? "보관 중..." : "보관하기"}
          </button>
        </div>
      </header>

      {toast && <div className="builder-toast">{toast}</div>}

      {showList && (
        <div className="survey-list-panel">
          <div className="survey-list-head">
            <strong>📁 보관함</strong>
            <button className="text-muted" onClick={() => setShowList(false)}>닫기</button>
          </div>
          {surveyList.length === 0 && <div className="empty-box">저장된 설문이 없습니다.</div>}

          {surveyList.filter((s) => !s.archived).length > 0 && (
            <>
              <div className="survey-group-label">🟢 진행 중 — 응답 받는 설문</div>
              {surveyList.filter((s) => !s.archived).map((item) => renderSurveyRow(item))}
            </>
          )}

          {surveyList.filter((s) => s.archived).length > 0 && (
            <>
              <div className="survey-group-label archived">📦 보관됨 — 응답 종료</div>
              {surveyList.filter((s) => s.archived).map((item) => renderSurveyRow(item))}
            </>
          )}
        </div>
      )}

      <div className="builder-layout">
        <aside className="builder-sidebar">
          <button className="builder-side-active">설문 기본정보</button>
          {survey.sections.map((section) => (
            <button
              key={section.id}
              className={section.id === selectedSectionId ? "builder-side-active" : ""}
              onClick={() => setSelectedSectionId(section.id)}
            >
              {section.title || section.id}
            </button>
          ))}
          <button className="builder-side-add" onClick={addSection}>+ 섹션 추가</button>
        </aside>

        <section className="builder-main">
          <div className="builder-card">
            <h1>설문 기본정보</h1>

            <div className="share-link-box">
              <div className="share-link-head">
                <span className="share-link-label">응답자용 링크</span>
                <span className="share-link-note">저장 후 접속할 수 있어요. 설문 ID를 바꾸면 링크도 바뀝니다.</span>
              </div>
              <div className="share-link-row">
                <input className="share-link-input" value={shareUrl} readOnly onFocus={(e) => e.target.select()} />
                <button className="builder-btn secondary" type="button" onClick={copyShareUrl}>
                  링크 복사
                </button>
                <a className="builder-btn primary" href={`/survey/${survey.id}`} target="_blank" rel="noreferrer">
                  열어보기
                </a>
              </div>
            </div>

            <div className="builder-grid">
              <label>
                설문 ID
                <input value={survey.id} onChange={(event) => updateSurvey("id", toSlug(event.target.value))} />
              </label>
              <label>
                기관명
                <input value={survey.agency} onChange={(event) => updateSurvey("agency", event.target.value)} />
              </label>
              <label className="builder-col-span">
                설문 제목
                <input value={survey.title} onChange={(event) => updateSurvey("title", event.target.value)} />
              </label>
              <label className="builder-col-span">
                부제목
                <input value={survey.subtitle || ""} onChange={(event) => updateSurvey("subtitle", event.target.value)} />
              </label>
              <label className="builder-col-span">
                설문 설명
                <textarea value={survey.description} onChange={(event) => updateSurvey("description", event.target.value)} />
              </label>
              <label className="builder-col-span">
                안내문, 줄바꿈 기준
                <LineListTextarea
                  value={survey.notice}
                  onChange={(lines) => updateSurvey("notice", lines)}
                />
              </label>
              <div className="builder-col-span">
                설문 이미지 · 공문 (선택)
                <ImageManager
                  images={survey.images || []}
                  onChange={(next) => updateSurvey("images", next.length > 0 ? next : undefined)}
                />
              </div>
              <label>
                응답 마감일시
                <input
                  placeholder="2026-08-07T23:59:59+09:00"
                  value={survey.endAt || ""}
                  onChange={(event) => updateSurvey("endAt", event.target.value)}
                />
              </label>
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={Boolean(survey.anonymous)}
                  onChange={(event) => updateSurvey("anonymous", event.target.checked)}
                />
                무기명 설문 (식별정보 미수집)
              </label>
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={Boolean(survey.allowEdit)}
                  onChange={(event) => updateSurvey("allowEdit", event.target.checked)}
                />
                응답 수정 허용 (제출 후 수정 코드 발급)
              </label>
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={Boolean(survey.archived)}
                  onChange={(event) => updateSurvey("archived", event.target.checked)}
                />
                보관(종료) — 체크하면 저장 시 응답을 더 이상 받지 않음
              </label>
            </div>
          </div>

          <div className="builder-card">
            <div className="builder-card-head">
              <div>
                <h2>{selectedSection.title}</h2>
                <p>섹션 정보와 문항을 설정합니다.</p>
              </div>
              <button className="builder-btn danger" onClick={() => removeSection(selectedSection.id)}>
                섹션 삭제
              </button>
            </div>

            <div className="builder-grid">
              <label>
                섹션 ID
                <input value={selectedSection.id} onChange={(event) => updateSection(selectedSection.id, { id: toSlug(event.target.value) })} />
              </label>
              <label className="builder-col-span">
                섹션 제목
                <input value={selectedSection.title} onChange={(event) => updateSection(selectedSection.id, { title: event.target.value })} />
              </label>
              <label className="builder-col-span">
                섹션 설명
                <textarea
                  className="builder-desc"
                  value={selectedSection.description || ""}
                  onChange={(event) => updateSection(selectedSection.id, { description: event.target.value })}
                />
              </label>
            </div>

            <div className="question-toolbar">
              <span>문항 {selectedSection.questions.length}개</span>
              <button className="builder-btn primary" onClick={() => addQuestion(selectedSection.id)}>
                + 문항 추가
              </button>
            </div>

            <div className="builder-question-list">
              {selectedSection.questions.map((question, index) => (
                <QuestionEditor
                  key={question.id}
                  index={index}
                  question={question}
                  priorChoiceQuestions={priorChoiceQuestions(survey, question.id)}
                  onChange={(patch) => updateQuestion(selectedSection.id, question.id, patch)}
                  onRemove={() => removeQuestion(selectedSection.id, question.id)}
                />
              ))}
              {selectedSection.questions.length === 0 && (
                <div className="empty-box">아직 문항이 없습니다. 문항 추가 버튼을 눌러 주세요.</div>
              )}
            </div>
          </div>
        </section>

        <aside className="builder-preview">
          <h2>미리보기</h2>
          <div className="preview-card">
            <div className="preview-badge">{survey.agency}</div>
            <h3>{survey.title}</h3>
            <p className="survey-description">{survey.description}</p>
            {survey.images && survey.images.length > 0 && (
              <div className="survey-images">
                {survey.images.map((image, index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={`${image.url.slice(0, 24)}-${index}`} src={image.url} alt={image.caption || `이미지 ${index + 1}`} className="preview-image" />
                ))}
              </div>
            )}
            {survey.sections.map((section) => (
              <div className="preview-section" key={section.id}>
                <strong>{section.title}</strong>
                {section.questions.map((question) => (
                  <div className="preview-question" key={question.id}>
                    {question.type === "file" && <span className="preview-file-tag">첨부</span>}
                    {question.title}
                    {question.required && <span> *</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {confirmState && (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-box">
            <h3 className="confirm-title">{confirmState.title}</h3>
            <p className="confirm-message">{confirmState.message}</p>
            <div className="confirm-actions">
              <button className="builder-btn secondary" onClick={() => setConfirmState(null)}>
                취소
              </button>
              <button
                className="builder-btn primary"
                onClick={() => {
                  const action = confirmState.onConfirm;
                  setConfirmState(null);
                  action();
                }}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function QuestionEditor({
  index,
  question,
  priorChoiceQuestions,
  onChange,
  onRemove
}: {
  index: number;
  question: DraftQuestion;
  priorChoiceQuestions: SurveyQuestion[];
  onChange: (patch: Partial<DraftQuestion>) => void;
  onRemove: () => void;
}) {
  const condBase = priorChoiceQuestions.find((q) => q.id === question.showIf?.questionId);
  return (
    <div className="question-editor">
      <div className="question-editor-head">
        <strong>Q{index + 1}. {question.id}</strong>
        <button className="text-danger" onClick={onRemove}>삭제</button>
      </div>

      <div className="builder-grid">
        <label>
          문항 ID
          <input value={question.id} onChange={(event) => onChange({ id: toSlug(event.target.value) })} />
        </label>
        <label>
          문항 유형
          <select
            value={question.type}
            onChange={(event) => onChange({ type: event.target.value as QuestionType })}
          >
            {questionTypes.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </label>
        <label className="builder-col-span">
          문항 제목
          <input value={question.title} onChange={(event) => onChange({ title: event.target.value })} />
        </label>
        <label className="builder-col-span">
          설명
          <textarea
            className="builder-desc"
            value={question.description || ""}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </label>
        <div className="builder-col-span">
          문항 이미지 (선택)
          <ImageManager
            images={question.images || []}
            onChange={(next) => onChange({ images: next.length > 0 ? next : undefined })}
          />
        </div>
        <label className="builder-check">
          <input
            type="checkbox"
            checked={Boolean(question.required)}
            onChange={(event) => onChange({ required: event.target.checked })}
          />
          필수 문항
        </label>

        <div className="builder-col-span cond-editor">
          <label className="builder-check">
            <input
              type="checkbox"
              checked={Boolean(question.showIf)}
              disabled={priorChoiceQuestions.length === 0}
              onChange={(event) =>
                onChange({
                  showIf: event.target.checked
                    ? { questionId: priorChoiceQuestions[0]?.id || "", values: [] }
                    : undefined
                })
              }
            />
            조건부 표시 — 앞 문항의 특정 답일 때만 이 문항을 보여주기 (분기)
          </label>
          {priorChoiceQuestions.length === 0 && (
            <p className="question-desc">앞에 객관식(단일·복수선택) 문항이 있어야 조건을 걸 수 있어요.</p>
          )}
          {question.showIf && (
            <div className="cond-body">
              <label className="cond-field">
                기준 문항
                <select
                  value={question.showIf.questionId}
                  onChange={(e) => onChange({ showIf: { questionId: e.target.value, values: [] } })}
                >
                  {priorChoiceQuestions.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.id} — {q.title.slice(0, 20)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="cond-values">
                <span className="cond-values-label">이 답일 때 표시:</span>
                {(condBase?.options || []).map((opt) => {
                  const checked = question.showIf?.values.includes(opt) || false;
                  return (
                    <label className="cond-value" key={opt}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const cur = question.showIf?.values || [];
                          const next = e.target.checked ? [...cur, opt] : cur.filter((v) => v !== opt);
                          onChange({ showIf: { questionId: question.showIf!.questionId, values: next } });
                        }}
                      />
                      {opt}
                    </label>
                  );
                })}
                {condBase?.allowOther && (
                  <label className="cond-value">
                    <input
                      type="checkbox"
                      checked={question.showIf?.values.includes(otherLabelOf(condBase)) || false}
                      onChange={(e) => {
                        const label = otherLabelOf(condBase);
                        const cur = question.showIf?.values || [];
                        const next = e.target.checked ? [...cur, label] : cur.filter((v) => v !== label);
                        onChange({ showIf: { questionId: question.showIf!.questionId, values: next } });
                      }}
                    />
                    {otherLabelOf(condBase)}
                  </label>
                )}
              </div>
            </div>
          )}
        </div>

        {(question.type === "single" || question.type === "multiple" || question.type === "ranking") && (
          <label className="builder-col-span">
            선택지, 줄바꿈 기준
            <LineListTextarea
              value={question.options || []}
              onChange={(lines) => onChange({ options: lines })}
            />
          </label>
        )}

        {(question.type === "single" || question.type === "multiple") && (
          <label className="builder-check builder-col-span">
            <input
              type="checkbox"
              checked={Boolean(question.allowOther)}
              onChange={(event) => onChange({ allowOther: event.target.checked })}
            />
            &ldquo;기타(직접 입력)&rdquo; 항목 추가 — 선택하면 아래에 입력칸이 나타남
          </label>
        )}

        {question.type === "multiple" && (
          <>
            <label>
              최대 선택 개수 (0 = 제한 없음)
              <input
                type="number"
                min={0}
                value={question.maxSelections ?? 0}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  onChange({ maxSelections: n > 0 ? n : undefined });
                }}
              />
            </label>
            <label>
              최소 선택 개수 (0 = 없음)
              <input
                type="number"
                min={0}
                value={question.minSelections ?? 0}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  onChange({ minSelections: n > 0 ? n : undefined });
                }}
              />
            </label>
          </>
        )}

        {question.type === "ranking" && (
          <>
            <label>
              순위 개수 (예: 3 → 1·2·3순위)
              <input
                type="number"
                min={1}
                max={10}
                value={question.rankCount ?? 3}
                onChange={(event) => onChange({ rankCount: Math.max(1, Number(event.target.value)) })}
              />
            </label>
            <label className="builder-check builder-col-span">
              <input
                type="checkbox"
                checked={Boolean(question.requireAllRanks)}
                onChange={(event) => onChange({ requireAllRanks: event.target.checked })}
              />
              모든 순위 입력 필수 (필수 문항일 때 모든 순위를 채워야 통과)
            </label>
          </>
        )}

        {question.type === "matrix" && (
          <>
            <label className="builder-col-span">
              행 (평가 항목), 줄바꿈 기준
              <LineListTextarea
                placeholder={"매출액\n고용 인원\n수출액"}
                value={question.rows || []}
                onChange={(lines) => onChange({ rows: lines })}
              />
            </label>
            <label className="builder-col-span">
              열 (선택지), 줄바꿈 기준
              <LineListTextarea
                placeholder={"매우 낮음\n낮음\n보통\n높음\n매우 높음"}
                value={question.columns || []}
                onChange={(lines) => onChange({ columns: lines })}
              />
            </label>
            <label className="builder-check builder-col-span">
              <input
                type="checkbox"
                checked={Boolean(question.matrixMultiple)}
                onChange={(event) => onChange({ matrixMultiple: event.target.checked })}
              />
              여러 칸 선택 허용 (행·열 모두 중복 선택 가능 — 각 칸을 자유롭게 체크)
            </label>
            <label className="builder-check builder-col-span">
              <input
                type="checkbox"
                checked={Boolean(question.allowRowSkip)}
                onChange={(event) => onChange({ allowRowSkip: event.target.checked })}
              />
              미응답 행 허용 (필수여도 일부 행은 비워둘 수 있음)
            </label>
          </>
        )}

        {question.type === "grid" && (
          <>
            <label className="builder-col-span">
              행 (예: 회차·단계), 줄바꿈 기준
              <LineListTextarea
                placeholder={"1차\n2차\n3차"}
                value={question.rows || []}
                onChange={(lines) => onChange({ rows: lines })}
              />
            </label>
            <div className="builder-col-span">
              <GridColumnsEditor
                columns={question.gridColumns || []}
                onChange={(cols) => onChange({ gridColumns: cols })}
              />
            </div>
            <label className="builder-check builder-col-span">
              <input
                type="checkbox"
                checked={Boolean(question.requireAllCells)}
                onChange={(event) => onChange({ requireAllCells: event.target.checked })}
              />
              모든 칸 입력 필수 (필수 문항일 때 모든 행의 모든 칸을 채워야 통과)
            </label>
          </>
        )}

        {(question.type === "text" || question.type === "textarea" || question.type === "number") && (
          <>
            <label className="builder-col-span">
              입력 안내문
              <input value={question.placeholder || ""} onChange={(event) => onChange({ placeholder: event.target.value })} />
            </label>
            <label className="builder-col-span">
              파일명에 쓸 값 (선택)
              <select
                value={question.namePart ?? ""}
                onChange={(event) =>
                  onChange({ namePart: (event.target.value || undefined) as "project" | "company" | undefined })
                }
              >
                <option value="">사용 안 함</option>
                <option value="project">과제번호 자리</option>
                <option value="company">기업명 자리</option>
              </select>
            </label>
          </>
        )}

        {question.type === "scale" && (
          <>
            <label>
              최소값
              <input type="number" value={question.min || 1} onChange={(event) => onChange({ min: Number(event.target.value) })} />
            </label>
            <label>
              최대값
              <input type="number" value={question.max || 5} onChange={(event) => onChange({ max: Number(event.target.value) })} />
            </label>
            <label>
              최소 라벨
              <input value={question.minLabel || ""} onChange={(event) => onChange({ minLabel: event.target.value })} />
            </label>
            <label>
              최대 라벨
              <input value={question.maxLabel || ""} onChange={(event) => onChange({ maxLabel: event.target.value })} />
            </label>
          </>
        )}

        {question.type === "file" && (
          <>
            <label className="builder-col-span">
              허용 확장자, 쉼표 구분 (비우면 전체 허용)
              <input
                placeholder=".pdf, .xlsx, .xls"
                value={(question.accept || []).join(", ")}
                onChange={(event) =>
                  onChange({
                    accept: event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map((item) => (item.startsWith(".") ? item : `.${item}`))
                  })
                }
              />
            </label>
            <label className="builder-col-span">
              파일명 라벨 (비우면 문항 제목 사용)
              <input
                placeholder="예: 서면실태조사표"
                value={question.fileLabel || ""}
                onChange={(event) => onChange({ fileLabel: event.target.value })}
              />
            </label>
            <label>
              최대 용량 (MB)
              <input
                type="number"
                min={1}
                max={100}
                value={question.maxSizeMB ?? 20}
                onChange={(event) => onChange({ maxSizeMB: Number(event.target.value) })}
              />
            </label>
            <label>
              최대 첨부 개수
              <input
                type="number"
                min={1}
                max={10}
                value={question.maxFiles ?? 1}
                onChange={(event) => onChange({ maxFiles: Number(event.target.value) })}
              />
            </label>
            <label className="builder-col-span">
              파일명에 쓸 값 (선택)
              <select
                value={question.namePart ?? ""}
                onChange={(event) =>
                  onChange({ namePart: (event.target.value || undefined) as "project" | "company" | undefined })
                }
              >
                <option value="">사용 안 함</option>
                <option value="project">과제번호 자리</option>
                <option value="company">기업명 자리</option>
              </select>
            </label>
          </>
        )}
      </div>
    </div>
  );
}

function normalizeQuestion(question: DraftQuestion): DraftQuestion {
  const base = {
    ...question,
    options: undefined,
    min: undefined,
    max: undefined,
    minLabel: undefined,
    maxLabel: undefined,
    maxSelections: undefined,
    minSelections: undefined,
    rankCount: undefined,
    rows: undefined,
    columns: undefined,
    matrixMultiple: undefined,
    allowRowSkip: undefined,
    gridColumns: undefined,
    requireAllRanks: undefined,
    requireAllCells: undefined,
    namePart: question.namePart,
    accept: undefined,
    maxSizeMB: undefined,
    maxFiles: undefined,
    fileLabel: undefined
  } as DraftQuestion;

  if (question.type === "single") {
    return {
      ...base,
      options: question.options && question.options.length > 0 ? question.options : ["선택지 1", "선택지 2"]
    };
  }

  if (question.type === "multiple") {
    return {
      ...base,
      options: question.options && question.options.length > 0 ? question.options : ["선택지 1", "선택지 2"],
      maxSelections: question.maxSelections,
      minSelections: question.minSelections
    };
  }

  if (question.type === "ranking") {
    return {
      ...base,
      options: question.options && question.options.length > 0 ? question.options : ["선택지 1", "선택지 2", "선택지 3"],
      rankCount: question.rankCount ?? 3,
      requireAllRanks: question.requireAllRanks
    };
  }

  if (question.type === "matrix") {
    return {
      ...base,
      rows: question.rows && question.rows.length > 0 ? question.rows : ["항목 1", "항목 2"],
      columns: question.columns && question.columns.length > 0 ? question.columns : ["매우 낮음", "낮음", "보통", "높음", "매우 높음"],
      matrixMultiple: question.matrixMultiple,
      allowRowSkip: question.allowRowSkip
    };
  }

  if (question.type === "grid") {
    return {
      ...base,
      rows: question.rows && question.rows.length > 0 ? question.rows : ["1차", "2차", "3차"],
      gridColumns:
        question.gridColumns && question.gridColumns.length > 0
          ? question.gridColumns.map((col) => ({ ...col, id: col.id ?? makeColId() }))
          : [
              { id: makeColId(), label: "연도", type: "text" as const },
              { id: makeColId(), label: "금액", type: "text" as const }
            ],
      requireAllCells: question.requireAllCells
    };
  }

  if (question.type === "scale") {
    return {
      ...base,
      min: question.min ?? 1,
      max: question.max ?? 5,
      minLabel: question.minLabel ?? "낮음",
      maxLabel: question.maxLabel ?? "높음"
    };
  }

  if (question.type === "file") {
    return {
      ...base,
      accept: question.accept ?? [],
      maxSizeMB: question.maxSizeMB ?? 20,
      maxFiles: question.maxFiles ?? 1,
      fileLabel: question.fileLabel
    };
  }

  return base;
}

/**
 * 줄바꿈으로 여러 항목을 입력받는 textarea.
 * 편집 중에는 입력한 텍스트(빈 줄 포함)를 그대로 유지하고,
 * 부모에는 앞뒤 공백을 없애고 빈 줄을 제거한 배열만 전달한다.
 * (기존 방식은 타이핑 즉시 빈 줄을 지워 엔터로 새 항목 추가가 안 되는 버그가 있었음)
 */
function LineListTextarea({
  value,
  onChange,
  placeholder
}: {
  value: string[];
  onChange: (lines: string[]) => void;
  placeholder?: string;
}) {
  const joined = value.join("\n");
  const [text, setText] = useState(joined);

  useEffect(() => {
    const parsed = text.split("\n").map((line) => line.trim()).filter(Boolean).join("\n");
    if (parsed !== joined) setText(joined);
    // joined(외부 값)가 바뀔 때만 동기화한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);

  return (
    <textarea
      value={text}
      placeholder={placeholder}
      onChange={(event) => {
        setText(event.target.value);
        onChange(event.target.value.split("\n").map((line) => line.trim()).filter(Boolean));
      }}
    />
  );
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** 조건부 표시의 기준이 될 수 있는 문항: 대상 문항보다 앞에 있는 단일·복수 선택 문항 */
function priorChoiceQuestions(survey: SurveyConfig, targetId: string): SurveyQuestion[] {
  const flat = survey.sections.flatMap((s) => s.questions);
  const idx = flat.findIndex((q) => q.id === targetId);
  const scope = idx < 0 ? flat : flat.slice(0, idx);
  return scope.filter((q) => (q.type === "single" || q.type === "multiple") && (q.options?.length || 0) > 0);
}

/** 새 열에 부여할 고정 id 생성 */
function makeColId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `col_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

/** 입력형 표(grid)의 열들을 편집하는 UI. 열 이름·유형·드롭다운 선택지를 자유롭게 수정 */
function GridColumnsEditor({
  columns,
  onChange
}: {
  columns: GridColumn[];
  onChange: (cols: GridColumn[]) => void;
}) {
  function update(index: number, patch: Partial<GridColumn>) {
    onChange(columns.map((col, i) => (i === index ? { ...col, ...patch } : col)));
  }
  function remove(index: number) {
    onChange(columns.filter((_, i) => i !== index));
  }
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= columns.length) return;
    const next = [...columns];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  function add() {
    onChange([...columns, { id: makeColId(), label: "", type: "text" }]);
  }

  return (
    <div>
      <div className="grid-cols-head">
        <span>열 (입력 필드) — 각 열의 이름을 자유롭게 지을 수 있어요</span>
        <button type="button" className="builder-btn secondary small" onClick={add}>
          + 열 추가
        </button>
      </div>
      {columns.length === 0 && (
        <p className="question-desc">
          열을 추가해 주세요. 예) 연도(단답), 금액(숫자), 구분(드롭다운: 실적·예상)
        </p>
      )}
      {columns.map((col, index) => (
        <div className="grid-col-editor" key={col.id ?? `idx-${index}`}>
          <div className="grid-col-editor-head">
            <span className="grid-col-num">열 {index + 1}</span>
            <div className="grid-col-move">
              <button type="button" className="builder-btn secondary small" onClick={() => move(index, -1)} disabled={index === 0}>←</button>
              <button type="button" className="builder-btn secondary small" onClick={() => move(index, 1)} disabled={index === columns.length - 1}>→</button>
              <button type="button" className="builder-btn danger small" onClick={() => remove(index)}>삭제</button>
            </div>
          </div>
          <label className="grid-col-field">
            열 이름
            <input
              className="grid-col-label"
              value={col.label}
              placeholder="예: 투자유치 연도 / 실적·예상 / 소요자금"
              onChange={(e) => update(index, { label: e.target.value })}
            />
          </label>
          <label className="grid-col-field">
            입력 방식
            <select
              className="grid-col-type"
              value={col.type}
              onChange={(e) => update(index, { type: e.target.value as GridColumn["type"] })}
            >
              <option value="text">단답형</option>
              <option value="number">숫자</option>
              <option value="select">드롭다운</option>
            </select>
          </label>
          {col.type === "select" && (
            <label className="grid-col-field">
              드롭다운 선택지, 줄바꿈 기준 (예: 실적 / 예상)
              <LineListTextarea value={col.options || []} onChange={(lines) => update(index, { options: lines })} />
            </label>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * 이미지 파일을 캔버스로 리사이즈해서 data URL(JPEG/PNG)로 변환한다.
 * Firestore 문서 용량(1MB)을 넘지 않도록 긴 변 기준 최대 1600px로 축소한다.
 */
async function fileToResizedDataUrl(file: File, maxEdge = 1600, quality = 0.72): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });

  // GIF·SVG 등은 리사이즈하지 않고 원본 data URL 사용
  if (!/^data:image\/(png|jpeg|jpg|webp);/i.test(dataUrl)) return dataUrl;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  if (scale >= 1 && dataUrl.length < 400_000) return dataUrl; // 이미 작으면 그대로

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** 이미지 목록 관리 UI (URL 붙여넣기 + 파일 업로드/리사이즈). 설문 설명·문항 공용 */
function ImageManager({
  images,
  onChange
}: {
  images: SurveyImage[];
  onChange: (next: SurveyImage[]) => void;
}) {
  const [urlInput, setUrlInput] = useState("");
  const [busy, setBusy] = useState(false);

  function addUrl() {
    const url = urlInput.trim();
    if (!url) return;
    onChange([...images, { url }]);
    setUrlInput("");
  }

  async function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    try {
      const added: SurveyImage[] = [];
      for (const file of Array.from(fileList)) {
        if (!file.type.startsWith("image/")) continue;
        const url = await fileToResizedDataUrl(file);
        added.push({ url, caption: "" });
      }
      if (added.length > 0) onChange([...images, ...added]);
    } finally {
      setBusy(false);
    }
  }

  function updateCaption(index: number, caption: string) {
    const next = images.map((img, i) => (i === index ? { ...img, caption } : img));
    onChange(next);
  }

  function remove(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="image-manager">
      {images.length > 0 && (
        <div className="image-list">
          {images.map((image, index) => (
            <div className="image-item" key={`${image.url.slice(0, 32)}-${index}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={image.caption || `이미지 ${index + 1}`} className="image-thumb" />
              <div className="image-meta">
                <input
                  className="image-caption"
                  placeholder="이미지 설명(선택)"
                  value={image.caption || ""}
                  onChange={(e) => updateCaption(index, e.target.value)}
                />
                <div className="image-actions">
                  <button type="button" className="builder-btn secondary small" onClick={() => move(index, -1)} disabled={index === 0}>↑</button>
                  <button type="button" className="builder-btn secondary small" onClick={() => move(index, 1)} disabled={index === images.length - 1}>↓</button>
                  <button type="button" className="builder-btn danger small" onClick={() => remove(index)}>삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="image-add-row">
        <label className="builder-btn secondary small image-upload-btn">
          {busy ? "처리 중…" : "이미지 업로드"}
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            disabled={busy}
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <input
          className="image-url-input"
          placeholder="또는 이미지 URL 붙여넣기"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addUrl();
            }
          }}
        />
        <button type="button" className="builder-btn secondary small" onClick={addUrl}>URL 추가</button>
      </div>
      <p className="image-hint">업로드한 이미지는 긴 변 1600px로 자동 축소됩니다. 큰 공문은 URL 링크를 권장합니다.</p>
    </div>
  );
}
