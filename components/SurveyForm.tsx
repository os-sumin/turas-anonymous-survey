"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  PersonalizationBlock,
  SurveyConfig,
  SurveyDownloadFile,
  SurveyQuestion,
  SurveyTarget,
  UploadedFile
} from "@/lib/types";
import { getVisibleQuestionIds, getVisibleSections, isOtherValue, otherLabelOf } from "@/lib/survey-utils";
import {
  COMPANY_CORRECTIONS_ID,
  CONTRACT_CORRECTION_ID,
  CONTRACT_MATCH_ID,
  CONTRACT_MATCH_OPTIONS,
  blocksForSection,
  formatTargetFieldValue,
  hasCompanyVerification,
  hasContractVerification,
  targetFieldValue,
  validatePersonalizedAnswers,
  visibleBlockFields
} from "@/lib/personalization";

type Props = { config: SurveyConfig; token?: string; target?: SurveyTarget };
type MapValue = Record<string, string | string[]>;
type GridValue = Record<string, Record<string, string>>;
type AnswerValue = string | string[] | number | UploadedFile[] | MapValue | GridValue;
type Answers = Record<string, AnswerValue>;

/** 순위 라벨 만들기: ["1순위", "2순위", "3순위"] */
function rankLabels(count: number): string[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => `${i + 1}순위`);
}

/** 순위·행렬 답변처럼 객체형 값인지 확인 (배열/파일 제외) */
function isMapValue(value: AnswerValue | undefined): value is MapValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** grid 답변(중첩 객체)인지 확인 */
function isGridValue(value: AnswerValue | undefined): value is GridValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function SurveyForm({ config, token, target }: Props) {
  const router = useRouter();
  const initialAnswers = useMemo(() => getInitialAnswers(config), [config]);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);

  const activeSections = useMemo(
    () => getVisibleSections(config, answers),
    [config, answers]
  );
  const visibleQuestionIds = useMemo(
    () => getVisibleQuestionIds(config, answers),
    [config, answers]
  );
  const totalSteps = activeSections.length;
  const isLastStep = step >= totalSteps - 1;
  const currentSection = activeSections[step];

  useEffect(() => {
    setStep((current) => Math.min(current, Math.max(activeSections.length - 1, 0)));
  }, [activeSections.length]);

  function goToStep(index: number) {
    setError("");
    setStep(index);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goNext() {
    setError("");
    if (uploadingCount > 0) {
      setError("파일 업로드가 끝난 뒤 넘어가 주세요.");
      return;
    }
    const stepSources = blocksForSection(config, currentSection.id).map((block) => block.source);
    if (target && stepSources.length > 0) {
      const personalized = validatePersonalizedAnswers(config, answers, stepSources);
      if (!personalized.ok) {
        setError(personalized.message);
        scrollToPersonalizedProblem(personalized.source);
        return;
      }
    }
    const problem = findSectionProblem(currentSection, answers, visibleQuestionIds);
    if (problem) {
      setError(problem.message);
      document.getElementById(`q-${problem.questionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    goToStep(Math.min(step + 1, totalSteps - 1));
  }

  function setAnswer(questionId: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function toggleMultiple(questionId: string, option: string, maxSelections?: number) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? (prev[questionId] as string[]) : [];
      if (current.includes(option)) {
        return { ...prev, [questionId]: current.filter((item) => item !== option) };
      }
      // 최대 개수 제한: 이미 꽉 찼으면 추가하지 않음
      if (maxSelections && current.length >= maxSelections) {
        return prev;
      }
      return { ...prev, [questionId]: [...current, option] };
    });
  }

  /** 순위 문항: 해당 순위에 선택지 지정 (같은 선택지가 다른 순위에 있으면 제거, 순위 순서대로 정렬 저장) */
  function setRankValue(questionId: string, labels: string[], label: string, option: string) {
    setAnswers((prev) => {
      const current: MapValue = isMapValue(prev[questionId]) ? { ...prev[questionId] } : {};
      for (const key of Object.keys(current)) {
        if (current[key] === option) delete current[key];
      }
      if (option) current[label] = option;
      else delete current[label];
      const ordered: MapValue = {};
      for (const l of labels) if (current[l]) ordered[l] = current[l];
      return { ...prev, [questionId]: ordered };
    });
  }

  /** 행렬(행별 1개): 특정 행에 열 값 지정 (행 순서대로 정렬 저장) */
  function setMatrixCell(questionId: string, rows: string[], row: string, column: string) {
    setAnswers((prev) => {
      const current: MapValue = isMapValue(prev[questionId]) ? { ...prev[questionId] } : {};
      current[row] = column;
      const ordered: MapValue = {};
      for (const r of rows) if (current[r]) ordered[r] = current[r];
      return { ...prev, [questionId]: ordered };
    });
  }

  /** 행렬(행별 복수): 특정 행에서 열을 토글 (행 순서대로 정렬 저장) */
  function toggleMatrixCell(questionId: string, rows: string[], row: string, column: string) {
    setAnswers((prev) => {
      const current: MapValue = isMapValue(prev[questionId]) ? { ...prev[questionId] } : {};
      const picked = Array.isArray(current[row]) ? [...(current[row] as string[])] : [];
      const next = picked.includes(column) ? picked.filter((c) => c !== column) : [...picked, column];
      if (next.length > 0) current[row] = next;
      else delete current[row];
      const ordered: MapValue = {};
      for (const r of rows) if (current[r]) ordered[r] = current[r];
      return { ...prev, [questionId]: ordered };
    });
  }

  /** grid(입력형 표): 특정 행·열 칸에 값 입력 (행 순서대로 정렬, 빈 값은 정리) */
  function setGridCell(questionId: string, rows: string[], row: string, column: string, cellValue: string) {
    setAnswers((prev) => {
      const raw = prev[questionId];
      const current: GridValue =
        raw && typeof raw === "object" && !Array.isArray(raw) ? JSON.parse(JSON.stringify(raw)) : {};
      const rowObj = { ...(current[row] || {}) };
      if (cellValue.trim() === "") delete rowObj[column];
      else rowObj[column] = cellValue;
      if (Object.keys(rowObj).length > 0) current[row] = rowObj;
      else delete current[row];
      const ordered: GridValue = {};
      for (const r of rows) if (current[r]) ordered[r] = current[r];
      return { ...prev, [questionId]: ordered };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // 이중 제출 차단: state보다 먼저 동기적으로 잠금 (빠른 재클릭·중복 제출 방지)
    if (submittingRef.current) return;
    setError("");

    if (uploadingCount > 0) {
      setError("파일 업로드가 끝난 뒤 제출해 주세요.");
      return;
    }

    // 브라우저 기본 검증이 닿지 않는 문항(파일·복수선택·순위·행렬) 확인
    if (target) {
      const activeSources = activeSections.flatMap((section) =>
        blocksForSection(config, section.id).map((block) => block.source)
      );
      const personalized = validatePersonalizedAnswers(config, answers, activeSources);
      if (!personalized.ok) {
        setError(personalized.message);
        const problemSectionIndex = activeSections.findIndex((section) =>
          blocksForSection(config, section.id).some((block) => block.source === personalized.source)
        );
        setStep(problemSectionIndex >= 0 ? problemSectionIndex : 0);
        setTimeout(() => {
          scrollToPersonalizedProblem(personalized.source);
        }, 50);
        return;
      }
    }

    const problem = findAnswerProblem(activeSections, answers, visibleQuestionIds);
    if (problem) {
      setError(problem.message);
      if (problem.sectionIndex !== step) {
        setStep(problem.sectionIndex);
      }
      setTimeout(() => {
        document.getElementById(`q-${problem.questionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survey_id: config.id,
          answers,
          token
        })
      });

      const result = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "응답 제출 중 오류가 발생했습니다.");
      }

      // 성공: 잠금을 풀지 않는다 (완료 화면 이동 동안 재제출 방지)
      router.push(`/complete?surveyId=${encodeURIComponent(config.id)}`);
    } catch (err) {
      // 실패했을 때만 잠금 해제 → 다시 시도 가능
      submittingRef.current = false;
      setIsSubmitting(false);
      setError(err instanceof Error ? err.message : "응답 제출 중 오류가 발생했습니다.");
    }
  }

  if (!currentSection) {
    return (
      <div className="form-body">
        <div className="error">현재 응답 조건에 표시할 설문 섹션이 없습니다. 관리자에게 문의해 주세요.</div>
      </div>
    );
  }

  const visibleQuestions = currentSection.questions.filter((question) => visibleQuestionIds.has(question.id));
  const sectionBlocks = target ? blocksForSection(config, currentSection.id) : [];
  const beforeBlocks = sectionBlocks.filter((block) => block.position === "before_first");
  const trailingBlocks = sectionBlocks.filter((block) =>
    block.position === "after_last" ||
    (block.position === "after_question" && (!block.afterQuestionId || !visibleQuestionIds.has(block.afterQuestionId)))
  );

  const renderPersonalizationBlock = (block: PersonalizationBlock) => target ? (
    <TargetVerification
      key={block.id}
      block={block}
      target={target}
      answers={answers}
      setAnswer={setAnswer}
    />
  ) : null;
  const downloadParams = new URLSearchParams({ surveyId: config.id });
  if (token) downloadParams.set("t", token);
  const respondentDownloadHref = `/api/survey-download?${downloadParams.toString()}`;

  return (
    <form className="form-body" onSubmit={handleSubmit}>
      {target?.responseId && (
        <div className="submitted-notice">이 링크로 이미 응답이 제출되었습니다.</div>
      )}
      {totalSteps > 1 && (
        <div className="survey-progress">
          <div className="survey-progress-top">
            <span className="survey-progress-step">
              {step + 1} / {totalSteps} 단계
            </span>
            <span className="survey-progress-remain">
              {isLastStep ? "마지막 단계예요" : `${totalSteps - step - 1}개 단계 남음`}
            </span>
          </div>
          <div className="survey-progress-bar" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={totalSteps}>
            <span className="survey-progress-fill" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
          </div>
          <div className="survey-progress-dots">
            {activeSections.map((section, index) => (
              <button
                type="button"
                key={section.id}
                className={`survey-progress-dot ${index === step ? "current" : ""} ${index < step ? "done" : ""}`}
                onClick={() => goToStep(index)}
                aria-label={`${index + 1}단계: ${section.title}`}
                title={section.title}
              />
            ))}
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <section className="section" key={currentSection.id}>
        <h2 className="section-title">{currentSection.title}</h2>
        {currentSection.description && <p className="section-description">{currentSection.description}</p>}
        {currentSection.attachments && currentSection.attachments.length > 0 && (
          <GuidanceFiles
            surveyId={config.id}
            token={token}
            scope="section"
            ownerId={currentSection.id}
            files={currentSection.attachments}
          />
        )}
        {beforeBlocks.map(renderPersonalizationBlock)}
        {visibleQuestions.map((question, questionIndex) => (
          <Fragment key={`${currentSection.id}-${questionIndex}-${question.id}`}>
            <QuestionField
              surveyId={config.id}
              token={token}
              question={question}
              value={answers[question.id]}
              setAnswer={setAnswer}
              toggleMultiple={toggleMultiple}
              setRankValue={setRankValue}
              setMatrixCell={setMatrixCell}
              toggleMatrixCell={toggleMatrixCell}
              setGridCell={setGridCell}
              onUploadStart={() => setUploadingCount((n) => n + 1)}
              onUploadEnd={() => setUploadingCount((n) => Math.max(0, n - 1))}
            />
            {sectionBlocks
              .filter((block) => block.position === "after_question" && block.afterQuestionId === question.id)
              .map(renderPersonalizationBlock)}
          </Fragment>
        ))}
        {trailingBlocks.map(renderPersonalizationBlock)}
      </section>

      {isLastStep && config.respondentDownload && (
        <aside className="respondent-download" aria-label="응답자 다운로드 자료">
          <div>
            <strong>관련 자료 다운로드</strong>
            <p>아래 자료를 내려받아 확인해 주세요.</p>
          </div>
          <a href={respondentDownloadHref} target="_blank" rel="noreferrer" className="respondent-download-button">
            <span>{config.respondentDownload.name}</span>
            <small>{formatSize(config.respondentDownload.size)}</small>
          </a>
        </aside>
      )}

      <div className="actions step-actions">
        {step > 0 && (
          <button className="step-btn prev" type="button" onClick={() => goToStep(step - 1)} disabled={isSubmitting}>
            이전
          </button>
        )}
        {!isLastStep ? (
          <button className="step-btn next" type="button" onClick={goNext} disabled={uploadingCount > 0}>
            {uploadingCount > 0 ? "파일 업로드 중..." : "다음"}
          </button>
        ) : (
          <button
            className="submit-btn"
            type="submit"
            disabled={isSubmitting || uploadingCount > 0 || Boolean(target?.responseId)}
          >
            {target?.responseId
              ? "이미 제출된 응답입니다"
              : isSubmitting
                ? "제출 중..."
                : uploadingCount > 0
                  ? "파일 업로드 중..."
                  : "제출하기"}
          </button>
        )}
      </div>
    </form>
  );
}

function TargetVerification({
  block,
  target,
  answers,
  setAnswer
}: {
  block: PersonalizationBlock;
  target: SurveyTarget;
  answers: Answers;
  setAnswer: (questionId: string, value: AnswerValue) => void;
}) {
  const part = block.source;
  const fields = visibleBlockFields(block);
  const corrections = isMapValue(answers[COMPANY_CORRECTIONS_ID])
    ? answers[COMPANY_CORRECTIONS_ID] as MapValue
    : {};
  const matches = Array.isArray(answers[CONTRACT_MATCH_ID])
    ? answers[CONTRACT_MATCH_ID] as string[]
    : [];
  const contractCorrection = String(answers[CONTRACT_CORRECTION_ID] ?? "");

  function setCompanyCorrection(key: string, value: string) {
    const next: MapValue = { ...corrections };
    if (value.trim()) next[key] = value;
    else delete next[key];
    setAnswer(COMPANY_CORRECTIONS_ID, next);
  }

  function toggleContractMatch(option: string) {
    if (option === "모두 일치" || option === "확인이 어려움") {
      setAnswer(CONTRACT_MATCH_ID, matches.length === 1 && matches[0] === option ? [] : [option]);
      return;
    }

    const base = matches.filter((value) => value !== "모두 일치" && value !== "확인이 어려움");
    setAnswer(
      CONTRACT_MATCH_ID,
      base.includes(option) ? base.filter((value) => value !== option) : [...base, option]
    );
  }

  return (
    <div className="target-verification" id={`personalized-${part}-verification`}>
      {part === "company" && (
        <div className="target-context-badge">
          <strong>{target.company.name || "기업명 미확인"}</strong>
          <span>{target.contract.projectName || target.projectId}</span>
        </div>
      )}

      {part === "company" && (
        <div className="verification-block">
          <div className="question-title">{block.title}</div>
          <div className="verification-table-wrap">
            <table className="verification-table">
              <thead>
                <tr>
                  <th>항목</th>
                  <th>KEITI 보유 정보</th>
                  <th>정정 사항</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => {
                  const heldValue = formatTargetFieldValue(targetFieldValue(target, "company", field.key), field.key);
                  const correctionValue = String(corrections[field.key] ?? "");
                  return (
                    <tr key={field.key}>
                      <th scope="row">{field.label}</th>
                      <td className="held-value">{heldValue}</td>
                      <td>
                        {field.key === "size" ? (
                          <select
                            className="verification-input"
                            aria-label={`${field.label} 정정 사항`}
                            value={correctionValue}
                            onChange={(event) => setCompanyCorrection(field.key, event.target.value)}
                          >
                            <option value="">정정 없음</option>
                            <option value="중소">중소</option>
                            <option value="중견">중견</option>
                            <option value="대기업">대기업</option>
                          </select>
                        ) : (
                          <input
                            className="verification-input"
                            aria-label={`${field.label} 정정 사항`}
                            placeholder="다른 경우에만 입력"
                            value={correctionValue}
                            onChange={(event) => setCompanyCorrection(field.key, event.target.value)}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="verification-hint">보유정보와 동일한 항목은 정정 사항을 비워두시면 됩니다.</p>
        </div>
      )}

      {part === "contract" && (
        <div className="verification-block">
          <div className="question-title">{block.title}</div>
          <div className="verification-table-wrap">
            <table className="verification-table contract-table">
              <thead>
                <tr>
                  <th>항목</th>
                  <th>KEITI 보유 정보</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.key}>
                    <th scope="row">{field.label}</th>
                    <td className="held-value">
                      {formatTargetFieldValue(targetFieldValue(target, "contract", field.key), field.key)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="contract-match-options" id={`q-${CONTRACT_MATCH_ID}`}>
            {CONTRACT_MATCH_OPTIONS.map((option) => (
              <label className="option" key={option}>
                <input
                  type="checkbox"
                  checked={matches.includes(option)}
                  onChange={() => toggleContractMatch(option)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>

          <label className="verification-correction-label">
            정정 내용
            <textarea
              className="textarea"
              placeholder="계약금액 또는 기타 항목이 다른 경우 정확한 내용을 입력해 주세요."
              value={contractCorrection}
              onChange={(event) => setAnswer(CONTRACT_CORRECTION_ID, event.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function scrollToPersonalizedProblem(source: "company" | "contract") {
  const id = source === "contract" ? "personalized-contract-verification" : "personalized-company-verification";
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function QuestionField({
  surveyId,
  token,
  question,
  value,
  setAnswer,
  toggleMultiple,
  setRankValue,
  setMatrixCell,
  toggleMatrixCell,
  setGridCell,
  onUploadStart,
  onUploadEnd
}: {
  surveyId: string;
  token?: string;
  question: SurveyQuestion;
  value: AnswerValue;
  setAnswer: (questionId: string, value: AnswerValue) => void;
  toggleMultiple: (questionId: string, option: string, maxSelections?: number) => void;
  setRankValue: (questionId: string, labels: string[], label: string, option: string) => void;
  setMatrixCell: (questionId: string, rows: string[], row: string, column: string) => void;
  toggleMatrixCell: (questionId: string, rows: string[], row: string, column: string) => void;
  setGridCell: (questionId: string, rows: string[], row: string, column: string, cellValue: string) => void;
  onUploadStart: () => void;
  onUploadEnd: () => void;
}) {
  const mapValue = isMapValue(value) ? value : {};
  const gridValue: GridValue = isGridValue(value) ? (value as GridValue) : {};
  return (
    <div className="question" id={`q-${question.id}`}>
      <div className="question-title">
        {question.title}
        {question.required && <span className="required">*</span>}
      </div>
      {question.description && <p className="question-desc">{question.description}</p>}
      {question.attachments && question.attachments.length > 0 && (
        <GuidanceFiles
          surveyId={surveyId}
          token={token}
          scope="question"
          ownerId={question.id}
          files={question.attachments}
        />
      )}
      {question.images && question.images.length > 0 && (
        <div className="survey-images question-images">
          {question.images.map((image, index) => (
            <figure className="survey-image" key={`${image.url}-${index}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={image.caption || `${question.title} 이미지 ${index + 1}`} />
              {image.caption && <figcaption>{image.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}

      {question.type === "single" && (() => {
        const label = otherLabelOf(question);
        const strVal = typeof value === "string" ? value : "";
        const otherSelected = Boolean(question.allowOther) && isOtherValue(strVal, label);
        const otherText = strVal.startsWith(`${label}: `) ? strVal.slice(label.length + 2) : "";
        return (
          <div className="option-list">
            {question.options?.map((option) => (
              <label className="option" key={option}>
                <input
                  type="radio"
                  name={question.id}
                  value={option}
                  checked={strVal === option}
                  onClick={() => {
                    if (strVal === option) setAnswer(question.id, ""); // 같은 항목 다시 누르면 선택 해제
                  }}
                  onChange={() => setAnswer(question.id, option)}
                />
                <span>{option}</span>
              </label>
            ))}
            {question.allowOther && (
              <>
                <label className="option">
                  <input
                    type="radio"
                    name={question.id}
                    checked={otherSelected}
                    onClick={() => {
                      if (otherSelected) setAnswer(question.id, "");
                    }}
                    onChange={() => setAnswer(question.id, label)}
                  />
                  <span>{label} (직접 입력)</span>
                </label>
                {otherSelected && (
                  <input
                    className="other-input"
                    placeholder="내용을 입력해 주세요"
                    value={otherText}
                    onChange={(e) =>
                      setAnswer(question.id, e.target.value.trim() ? `${label}: ${e.target.value}` : label)
                    }
                  />
                )}
              </>
            )}
          </div>
        );
      })()}

      {question.type === "multiple" && (
        <>
          {(question.maxSelections || question.minSelections) && (
            <div className="multi-counter">
              {question.minSelections ? `최소 ${question.minSelections}개 · ` : ""}
              {question.maxSelections ? `최대 ${question.maxSelections}개 선택` : "여러 개 선택 가능"}
              {question.maxSelections && (
                <span className="multi-count-badge">
                  {(Array.isArray(value) ? (value as string[]).length : 0)}/{question.maxSelections}
                </span>
              )}
            </div>
          )}
          <div className="option-list">
            {question.options?.map((option) => {
              const picked = Array.isArray(value) ? (value as string[]) : [];
              const isChecked = picked.includes(option);
              const isFull = Boolean(question.maxSelections) && picked.length >= (question.maxSelections as number);
              const isDisabled = !isChecked && isFull;
              return (
                <label className={`option ${isDisabled ? "is-disabled" : ""}`} key={option}>
                  <input
                    type="checkbox"
                    name={question.id}
                    value={option}
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={() => toggleMultiple(question.id, option, question.maxSelections)}
                  />
                  <span>{option}</span>
                </label>
              );
            })}
            {question.allowOther && (() => {
              const label = otherLabelOf(question);
              const picked = Array.isArray(value) ? (value as string[]) : [];
              const otherItem = picked.find((p) => isOtherValue(p, label));
              const otherChecked = Boolean(otherItem);
              const otherText = otherItem && otherItem.startsWith(`${label}: `) ? otherItem.slice(label.length + 2) : "";
              const isFull = Boolean(question.maxSelections) && picked.length >= (question.maxSelections as number);
              return (
                <>
                  <label className={`option ${!otherChecked && isFull ? "is-disabled" : ""}`}>
                    <input
                      type="checkbox"
                      checked={otherChecked}
                      disabled={!otherChecked && isFull}
                      onChange={() => {
                        const base = picked.filter((p) => !isOtherValue(p, label));
                        setAnswer(question.id, otherChecked ? base : [...base, label]);
                      }}
                    />
                    <span>{label} (직접 입력)</span>
                  </label>
                  {otherChecked && (
                    <input
                      className="other-input"
                      placeholder="내용을 입력해 주세요"
                      value={otherText}
                      onChange={(e) => {
                        const base = picked.filter((p) => !isOtherValue(p, label));
                        const next = e.target.value.trim() ? `${label}: ${e.target.value}` : label;
                        setAnswer(question.id, [...base, next]);
                      }}
                    />
                  )}
                </>
              );
            })()}
          </div>
        </>
      )}

      {question.type === "ranking" && (() => {
        const labels = rankLabels(question.rankCount ?? 3);
        const options = question.options ?? [];
        return (
          <div className="rank-list">
            <p className="rank-hint">중요한 순서대로 선택해 주세요. 같은 항목을 여러 순위에 중복 선택할 수 없습니다.</p>
            {labels.map((label) => {
              const chosenHere = mapValue[label] ?? "";
              const chosenElsewhere = Object.entries(mapValue)
                .filter(([key]) => key !== label)
                .map(([, val]) => val);
              return (
                <div className="rank-row" key={label}>
                  <span className="rank-badge">{label}</span>
                  <select
                    className="rank-select"
                    value={chosenHere}
                    onChange={(e) => setRankValue(question.id, labels, label, e.target.value)}
                  >
                    <option value="">선택 안 함</option>
                    {options.map((option) => (
                      <option key={option} value={option} disabled={chosenElsewhere.includes(option)}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        );
      })()}

      {question.type === "matrix" && (
        <div className="matrix-wrap">
          {question.matrixMultiple && (
            <p className="matrix-hint">각 항목마다 해당하는 것을 모두 선택할 수 있습니다.</p>
          )}
          <table className={`matrix-table ${question.matrixMultiple ? "is-multiple" : ""}`}>
            <thead>
              <tr>
                <th className="matrix-corner" />
                {question.columns?.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {question.rows?.map((row) => {
                const cell = mapValue[row];
                const rowPicked = Array.isArray(cell) ? cell : cell ? [cell] : [];
                return (
                  <tr key={row}>
                    <th scope="row" className="matrix-row-label">{row}</th>
                    {question.columns?.map((column) => (
                      <td key={column}>
                        <label className="matrix-cell">
                          {question.matrixMultiple ? (
                            <input
                              type="checkbox"
                              name={`${question.id}__${row}`}
                              value={column}
                              checked={rowPicked.includes(column)}
                              onChange={() => toggleMatrixCell(question.id, question.rows ?? [], row, column)}
                            />
                          ) : (
                            <input
                              type="radio"
                              name={`${question.id}__${row}`}
                              value={column}
                              checked={cell === column}
                              onChange={() => setMatrixCell(question.id, question.rows ?? [], row, column)}
                            />
                          )}
                          <span className="matrix-dot" />
                        </label>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {question.type === "grid" && (
        <div className="matrix-wrap">
          <table className="matrix-table grid-table">
            <thead>
              <tr>
                <th className="matrix-corner" />
                {question.gridColumns?.map((col) => (
                  <th key={col.label}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {question.rows?.map((row) => (
                <tr key={row}>
                  <th scope="row" className="matrix-row-label">{row}</th>
                  {question.gridColumns?.map((col) => {
                    const cell = gridValue[row]?.[col.label] ?? "";
                    return (
                      <td key={col.label} className="grid-cell">
                        {col.type === "select" ? (
                          <select
                            className="grid-input"
                            value={cell}
                            onChange={(e) => setGridCell(question.id, question.rows ?? [], row, col.label, e.target.value)}
                          >
                            <option value="">선택</option>
                            {col.options?.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="grid-input"
                            type={col.type === "number" ? "number" : "text"}
                            inputMode={col.type === "number" ? "decimal" : undefined}
                            placeholder={col.placeholder}
                            value={cell}
                            onChange={(e) => setGridCell(question.id, question.rows ?? [], row, col.label, e.target.value)}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {question.type === "text" && (
        <input className="input" value={String(value ?? "")} required={question.required} placeholder={question.placeholder} onChange={(e) => setAnswer(question.id, e.target.value)} />
      )}

      {question.type === "textarea" && (
        <textarea className="textarea" value={String(value ?? "")} required={question.required} placeholder={question.placeholder} onChange={(e) => setAnswer(question.id, e.target.value)} />
      )}

      {question.type === "number" && (
        <input className="number-input" type="number" value={String(value ?? "")} required={question.required} placeholder={question.placeholder} onChange={(e) => setAnswer(question.id, e.target.value)} />
      )}

      {question.type === "scale" && (
        <div className="scale-row">
          <div className="scale-label">{question.minLabel}</div>
          <div className="scale-options">
            {range(question.min ?? 1, question.max ?? 5).map((number) => (
              <label className="scale-option" key={number}>
                <input type="radio" name={question.id} value={number} checked={Number(value) === number} required={question.required} onChange={() => setAnswer(question.id, number)} />
                <span>{number}</span>
              </label>
            ))}
          </div>
          <div className="scale-label">{question.maxLabel}</div>
        </div>
      )}

      {question.type === "file" && (
        <FileField
          surveyId={surveyId}
          token={token}
          question={question}
          files={Array.isArray(value) ? (value as UploadedFile[]) : []}
          setFiles={(files) => setAnswer(question.id, files)}
          onUploadStart={onUploadStart}
          onUploadEnd={onUploadEnd}
        />
      )}
    </div>
  );
}

function GuidanceFiles({
  surveyId,
  token,
  scope,
  ownerId,
  files
}: {
  surveyId: string;
  token?: string;
  scope: "section" | "question";
  ownerId: string;
  files: SurveyDownloadFile[];
}) {
  return (
    <aside className="guidance-files" aria-label="안내파일">
      <strong className="guidance-files-title">안내파일</strong>
      <div className="guidance-files-list">
        {files.map((file, index) => {
          const params = new URLSearchParams({
            surveyId,
            scope,
            ownerId,
            index: String(index)
          });
          if (token) params.set("t", token);
          const viewParams = new URLSearchParams(params);
          viewParams.set("mode", "view");
          const downloadParams = new URLSearchParams(params);
          downloadParams.set("mode", "download");
          return (
            <div className="guidance-file" key={`${file.path}-${index}`}>
              <div className="guidance-file-meta">
                <span>{file.name}</span>
                <small>{formatSize(file.size)}</small>
              </div>
              <div className="guidance-file-actions">
                <a
                  href={`/api/survey-download?${viewParams.toString()}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  파일 보기
                </a>
                <a href={`/api/survey-download?${downloadParams.toString()}`}>다운로드</a>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function FileField({
  surveyId,
  token,
  question,
  files,
  setFiles,
  onUploadStart,
  onUploadEnd
}: {
  surveyId: string;
  token?: string;
  question: SurveyQuestion;
  files: UploadedFile[];
  setFiles: (files: UploadedFile[]) => void;
  onUploadStart: () => void;
  onUploadEnd: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const maxFiles = question.maxFiles ?? 1;
  const maxSizeMB = question.maxSizeMB ?? 20;
  const isFull = files.length >= maxFiles;

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (selected.length === 0) return;

    setUploadError("");

    const room = maxFiles - files.length;
    if (selected.length > room) {
      setUploadError(`최대 ${maxFiles}개까지 첨부할 수 있습니다.`);
      return;
    }

    setBusy(true);
    onUploadStart();

    try {
      const uploaded: UploadedFile[] = [];

      for (const file of selected) {
        if (file.size > maxSizeMB * 1024 * 1024) {
          throw new Error(`"${file.name}" 용량이 ${maxSizeMB}MB를 초과합니다.`);
        }

        const contentType = file.type || "application/octet-stream";

        const ticketResponse = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            survey_id: surveyId,
            token,
            question_id: question.id,
            filename: file.name,
            content_type: contentType,
            size: file.size
          })
        });

        const ticket = (await ticketResponse.json()) as {
          ok?: boolean;
          message?: string;
          upload_url?: string;
          path?: string;
        };

        if (!ticketResponse.ok || !ticket.ok || !ticket.upload_url || !ticket.path) {
          throw new Error(ticket.message || "업로드 준비에 실패했습니다.");
        }

        // Storage로 직접 업로드 (서버를 거치지 않음)
        const putResponse = await fetch(ticket.upload_url, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: file
        });

        if (!putResponse.ok) {
          throw new Error(`"${file.name}" 업로드에 실패했습니다.`);
        }

        uploaded.push({ path: ticket.path, name: file.name, size: file.size, type: contentType });
      }

      setFiles([...files, ...uploaded]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "업로드 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
      onUploadEnd();
    }
  }

  function removeFile(path: string) {
    setFiles(files.filter((file) => file.path !== path));
  }

  return (
    <div className="file-field">
      <div className="file-hint">
        {question.accept && question.accept.length > 0 && <span>{question.accept.join(", ")} · </span>}
        <span>최대 {maxSizeMB}MB · {maxFiles}개까지</span>
      </div>

      {files.length > 0 && (
        <ul className="file-list">
          {files.map((file) => (
            <li className="file-item" key={file.path}>
              <span className="file-name">{file.name}</span>
              <span className="file-size">{formatSize(file.size)}</span>
              <button type="button" className="file-remove" onClick={() => removeFile(file.path)}>
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      {!isFull && (
        <label className={`file-drop ${busy ? "is-busy" : ""}`}>
          <input
            type="file"
            multiple={maxFiles > 1}
            accept={question.accept?.join(",")}
            disabled={busy}
            onChange={handleChange}
          />
          <span>{busy ? "업로드 중..." : "파일 선택 또는 여기로 끌어다 놓기"}</span>
        </label>
      )}

      {uploadError && <div className="file-error">{uploadError}</div>}
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function getInitialAnswers(config: SurveyConfig): Answers {
  const answers: Answers = {};
  if (hasCompanyVerification(config)) answers[COMPANY_CORRECTIONS_ID] = {};
  if (hasContractVerification(config)) {
    answers[CONTRACT_MATCH_ID] = [];
    answers[CONTRACT_CORRECTION_ID] = "";
  }
  for (const section of config.sections) {
    for (const question of section.questions) {
      if (question.type === "multiple" || question.type === "file") answers[question.id] = [];
      else if (question.type === "ranking" || question.type === "matrix" || question.type === "grid") answers[question.id] = {};
      else answers[question.id] = "";
    }
  }
  return answers;
}

/** 문항 1개 검증. 문제가 있으면 메시지, 없으면 null */
function checkQuestion(question: SurveyQuestion, value: AnswerValue | undefined): string | null {
  if (question.type === "file") {
    const files = Array.isArray(value) ? (value as UploadedFile[]) : [];
    if (question.required && files.length === 0) return `"${question.title}" 문항에 파일을 첨부해 주세요.`;
    return null;
  }

  if (question.type === "multiple") {
    const picked = Array.isArray(value) ? (value as string[]) : [];
    if (question.required && picked.length === 0) return `"${question.title}" 문항을 하나 이상 선택해 주세요.`;
    if (question.minSelections && picked.length > 0 && picked.length < question.minSelections) {
      return `"${question.title}" 문항은 최소 ${question.minSelections}개를 선택해 주세요.`;
    }
    if (question.maxSelections && picked.length > question.maxSelections) {
      return `"${question.title}" 문항은 최대 ${question.maxSelections}개까지 선택할 수 있습니다.`;
    }
    if (question.allowOther) {
      const label = otherLabelOf(question);
      if (picked.includes(label)) return `"${question.title}" 문항의 기타 내용을 입력해 주세요.`;
    }
    return null;
  }

  if (question.type === "ranking") {
    const picked = isMapValue(value) ? value : {};
    const filledRanks = Object.keys(picked).length;
    if (question.required) {
      if (question.requireAllRanks) {
        const need = Math.min(question.rankCount ?? 3, (question.options ?? []).length || (question.rankCount ?? 3));
        if (filledRanks < need) return `"${question.title}" 문항의 모든 순위를 선택해 주세요.`;
      } else if (filledRanks === 0) {
        return `"${question.title}" 문항에 최소 1순위를 선택해 주세요.`;
      }
    }
    return null;
  }

  if (question.type === "grid") {
    const picked = isGridValue(value) ? value : {};
    const rows = question.rows ?? [];
    const cols = question.gridColumns ?? [];
    const filledInRow = (row: string) =>
      cols.filter((c) => String(picked[row]?.[c.label] ?? "").trim() !== "").length;
    const totalFilled = rows.reduce((sum, row) => sum + filledInRow(row), 0);
    if (question.required) {
      if (question.requireAllCells) {
        const incomplete = rows.some((row) => filledInRow(row) < cols.length);
        if (incomplete) return `"${question.title}" 문항의 모든 칸을 입력해 주세요.`;
      } else if (totalFilled === 0) {
        return `"${question.title}" 문항을 입력해 주세요.`;
      }
    }
    return null;
  }

  if (question.type === "matrix") {
    const picked = isMapValue(value) ? value : {};
    const rows = question.rows ?? [];
    const answeredRows = rows.filter((row) => {
      const cell = picked[row];
      return Array.isArray(cell) ? cell.length > 0 : Boolean(cell);
    });
    if (question.required) {
      if (question.allowRowSkip) {
        if (answeredRows.length === 0) return `"${question.title}" 문항에서 최소 한 개는 선택해 주세요.`;
      } else if (answeredRows.length < rows.length) {
        return `"${question.title}" 문항의 모든 항목에 답해 주세요.`;
      }
    }
    return null;
  }

  // single / text / textarea / number / scale — 필수 여부만 확인(형식은 서버가 재검증)
  if (question.type === "single" && question.allowOther) {
    const label = otherLabelOf(question);
    if (typeof value === "string" && value === label) return `"${question.title}" 문항의 기타 내용을 입력해 주세요.`;
  }
  if (question.required) {
    const isEmpty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);
    if (isEmpty) {
      const verb = question.type === "single" || question.type === "scale" ? "선택" : "입력";
      return `"${question.title}" 문항을 ${verb}해 주세요.`;
    }
  }
  return null;
}

/** 한 섹션 안에서 첫 번째 문제를 찾음 (숨겨진 문항은 건너뜀) */
function findSectionProblem(
  section: SurveyConfig["sections"][number],
  answers: Answers,
  visibleQuestionIds: Set<string>
): { questionId: string; message: string } | null {
  for (const question of section.questions) {
    if (!visibleQuestionIds.has(question.id)) continue;
    const message = checkQuestion(question, answers[question.id]);
    if (message) return { questionId: question.id, message };
  }
  return null;
}

/** 제출 전 클라이언트 검증: 전체에서 첫 번째 문제를 반환 (섹션 인덱스 포함) */
function findAnswerProblem(
  sections: SurveyConfig["sections"],
  answers: Answers,
  visibleQuestionIds: Set<string>
): { questionId: string; message: string; sectionIndex: number } | null {
  for (let i = 0; i < sections.length; i += 1) {
    const problem = findSectionProblem(sections[i], answers, visibleQuestionIds);
    if (problem) return { ...problem, sectionIndex: i };
  }
  return null;
}

function range(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}
