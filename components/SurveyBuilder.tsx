"use client";

import { useEffect, useMemo, useState } from "react";
import type { QuestionType, SurveyConfig, SurveyQuestion, SurveySection } from "@/lib/types";

type DraftQuestion = SurveyQuestion;
type DraftSection = SurveySection;
type SurveyListItem = {
  id: string;
  title: string;
  agency: string;
  source: "firestore" | "code";
  responseCount: number;
};

const PASSWORD_STORAGE_KEY = "turas_admin_password";

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: "single", label: "단일선택" },
  { value: "multiple", label: "복수선택" },
  { value: "text", label: "단답형" },
  { value: "textarea", label: "장문형" },
  { value: "number", label: "숫자형" },
  { value: "scale", label: "척도형" },
  { value: "file", label: "파일첨부" }
];

const initialSurvey: SurveyConfig = {
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

export default function SurveyBuilder() {
  const [password, setPassword] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [survey, setSurvey] = useState<SurveyConfig>(initialSurvey);
  const [selectedSectionId, setSelectedSectionId] = useState(initialSurvey.sections[0].id);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [surveyList, setSurveyList] = useState<SurveyListItem[]>([]);
  const [showList, setShowList] = useState(false);

  const selectedSection =
    survey.sections.find((section) => section.id === selectedSectionId) || survey.sections[0];

  const configText = useMemo(() => JSON.stringify(survey, null, 2), [survey]);

  useEffect(() => {
    const stored = sessionStorage.getItem(PASSWORD_STORAGE_KEY);
    if (stored) setPassword(stored);
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

  async function saveSurvey() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ config: survey })
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

  async function loadSurvey(surveyId: string) {
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
      showToast(`${surveyId} 를 불러왔습니다.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "불러오기에 실패했습니다.");
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

  function updateNotice(value: string) {
    updateSurvey("notice", value.split("\n").map((line) => line.trim()).filter(Boolean));
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

  async function copyConfig() {
    await navigator.clipboard.writeText(configText);
    showToast("JSON이 복사되었습니다.");
  }

  function downloadConfig() {
    const blob = new Blob([configText], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = url;
    element.download = `${survey.id || "survey"}.json`;
    element.click();
    URL.revokeObjectURL(url);
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

  return (
    <main className="builder-shell">
      <header className="builder-topbar">
        <div>
          <div className="builder-logo">TURAS Survey Builder</div>
          <div className="builder-sub">설문 문항 생성 및 저장</div>
        </div>
        <div className="builder-actions">
          <button className="builder-btn secondary" onClick={() => setShowList((v) => !v)}>
            저장된 설문 {surveyList.length > 0 ? `(${surveyList.length})` : ""}
          </button>
          <a className="builder-btn secondary" href="/admin/responses">
            응답 현황
          </a>
          <a className="builder-btn secondary" href={`/survey/${survey.id}`} target="_blank">
            응답화면 열기
          </a>
          <button className="builder-btn secondary" onClick={downloadConfig}>JSON 다운로드</button>
          <button className="builder-btn secondary" onClick={copyConfig}>JSON 복사</button>
          <button className="builder-btn primary" onClick={saveSurvey} disabled={saving}>
            {saving ? "저장 중..." : "저장하기"}
          </button>
        </div>
      </header>

      {toast && <div className="builder-toast">{toast}</div>}

      {showList && (
        <div className="survey-list-panel">
          <div className="survey-list-head">
            <strong>저장된 설문</strong>
            <button className="text-muted" onClick={() => setShowList(false)}>닫기</button>
          </div>
          {surveyList.length === 0 && <div className="empty-box">저장된 설문이 없습니다.</div>}
          {surveyList.map((item) => (
            <div className="survey-list-row" key={item.id}>
              <div className="survey-list-info">
                <div className="survey-list-title">
                  {item.title}
                  {item.source === "code" && <span className="survey-list-tag">코드</span>}
                </div>
                <div className="survey-list-meta">
                  {item.id} · 응답 {item.responseCount}건
                </div>
              </div>
              <div className="survey-list-actions">
                <button className="builder-btn secondary" onClick={() => loadSurvey(item.id)}>
                  불러오기
                </button>
                <button
                  className="builder-btn danger"
                  disabled={item.source === "code"}
                  onClick={() => deleteSurvey(item)}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
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
                <textarea value={survey.notice.join("\n")} onChange={(event) => updateNotice(event.target.value)} />
              </label>
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
                <input value={selectedSection.description || ""} onChange={(event) => updateSection(selectedSection.id, { description: event.target.value })} />
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
            <p>{survey.description}</p>
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

          <h2>JSON</h2>
          <pre className="json-box">{configText}</pre>
        </aside>
      </div>
    </main>
  );
}

function QuestionEditor({
  index,
  question,
  onChange,
  onRemove
}: {
  index: number;
  question: DraftQuestion;
  onChange: (patch: Partial<DraftQuestion>) => void;
  onRemove: () => void;
}) {
  const optionText = (question.options || []).join("\n");

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
          <input value={question.description || ""} onChange={(event) => onChange({ description: event.target.value })} />
        </label>
        <label className="builder-check">
          <input
            type="checkbox"
            checked={Boolean(question.required)}
            onChange={(event) => onChange({ required: event.target.checked })}
          />
          필수 문항
        </label>

        {(question.type === "single" || question.type === "multiple") && (
          <label className="builder-col-span">
            선택지, 줄바꿈 기준
            <textarea
              value={optionText}
              onChange={(event) =>
                onChange({
                  options: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean)
                })
              }
            />
          </label>
        )}

        {(question.type === "text" || question.type === "textarea" || question.type === "number") && (
          <label className="builder-col-span">
            입력 안내문
            <input value={question.placeholder || ""} onChange={(event) => onChange({ placeholder: event.target.value })} />
          </label>
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
    accept: undefined,
    maxSizeMB: undefined,
    maxFiles: undefined
  } as DraftQuestion;

  if (question.type === "single" || question.type === "multiple") {
    return {
      ...base,
      options: question.options && question.options.length > 0 ? question.options : ["선택지 1", "선택지 2"]
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
      maxFiles: question.maxFiles ?? 1
    };
  }

  return base;
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}
