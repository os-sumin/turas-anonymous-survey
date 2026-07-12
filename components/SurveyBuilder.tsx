"use client";

import { useMemo, useState } from "react";
import type { QuestionType, SurveyConfig, SurveyQuestion, SurveySection } from "@/lib/types";

type DraftQuestion = SurveyQuestion;
type DraftSection = SurveySection;

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: "single", label: "단일선택" },
  { value: "multiple", label: "복수선택" },
  { value: "text", label: "단답형" },
  { value: "textarea", label: "장문형" },
  { value: "number", label: "숫자형" },
  { value: "scale", label: "척도형" }
];

const initialSurvey: SurveyConfig = {
  id: "new_survey_2027",
  agency: "정보통신산업진흥원",
  title: "2027년 AI ICT 재정지원 방향 수요조사",
  subtitle: "AI·ICT 분야 재정지원 수요 및 정책개선 의견수렴",
  description: "본 설문은 향후 AI·ICT 분야 재정지원 방향 설정을 위한 의견수렴 목적으로 진행됩니다.",
  notice: [
    "본 설문은 무기명으로 운영되며, 기업명·사업자번호·과제번호·담당자명 등 식별정보를 수집하지 않습니다.",
    "응답 결과는 통계 분석 및 정책방향 검토 목적으로만 활용됩니다.",
    "자유기재 문항에는 기업을 특정할 수 있는 정보를 입력하지 않는 것을 권장드립니다."
  ],
  endAt: "2027-12-31T23:59:59+09:00",
  sections: [
    {
      id: "section_1",
      title: "1. 기본 문항",
      description: "설문 목적에 맞게 문항을 수정해 주세요.",
      questions: [
        {
          id: "q1",
          type: "single",
          title: "현재 귀사의 AI·ICT 기술 활용 단계는 어디에 가장 가깝습니까?",
          required: true,
          options: ["기술 검토 단계", "시제품 또는 PoC 단계", "실증·고도화 단계", "상용화 단계", "해당 없음"]
        }
      ]
    }
  ]
};

export default function SurveyBuilder() {
  const [survey, setSurvey] = useState<SurveyConfig>(initialSurvey);
  const [selectedSectionId, setSelectedSectionId] = useState(initialSurvey.sections[0].id);
  const [copyMessage, setCopyMessage] = useState("");

  const selectedSection = survey.sections.find((section) => section.id === selectedSectionId) || survey.sections[0];

  const configText = useMemo(() => JSON.stringify(survey, null, 2), [survey]);

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
    const newQuestion: DraftQuestion = {
      id: `q${questionCount + 1}`,
      type,
      title: "새 문항을 입력해 주세요.",
      required: false,
      options: type === "single" || type === "multiple" ? ["선택지 1", "선택지 2"] : undefined,
      min: type === "scale" ? 1 : undefined,
      max: type === "scale" ? 5 : undefined,
      minLabel: type === "scale" ? "낮음" : undefined,
      maxLabel: type === "scale" ? "높음" : undefined
    };

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
    setCopyMessage("JSON이 복사되었습니다.");
    setTimeout(() => setCopyMessage(""), 2000);
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

  return (
    <main className="builder-shell">
      <header className="builder-topbar">
        <div>
          <div className="builder-logo">TURAS Survey Builder</div>
          <div className="builder-sub">설문 문항 생성용 임시 관리자 화면</div>
        </div>
        <div className="builder-actions">
          <a className="builder-btn secondary" href={`/survey/${survey.id}`} target="_blank">
            응답화면 열기
          </a>
          <button className="builder-btn secondary" onClick={downloadConfig}>JSON 다운로드</button>
          <button className="builder-btn primary" onClick={copyConfig}>JSON 복사</button>
        </div>
      </header>

      {copyMessage && <div className="builder-toast">{copyMessage}</div>}

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
                <input value={survey.endAt || ""} onChange={(event) => updateSurvey("endAt", event.target.value)} />
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
      </div>
    </div>
  );
}

function normalizeQuestion(question: DraftQuestion): DraftQuestion {
  if (question.type === "single" || question.type === "multiple") {
    return {
      ...question,
      options: question.options && question.options.length > 0 ? question.options : ["선택지 1", "선택지 2"],
      min: undefined,
      max: undefined,
      minLabel: undefined,
      maxLabel: undefined
    };
  }

  if (question.type === "scale") {
    return {
      ...question,
      options: undefined,
      min: question.min ?? 1,
      max: question.max ?? 5,
      minLabel: question.minLabel ?? "낮음",
      maxLabel: question.maxLabel ?? "높음"
    };
  }

  return {
    ...question,
    options: undefined,
    min: undefined,
    max: undefined,
    minLabel: undefined,
    maxLabel: undefined
  };
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}
