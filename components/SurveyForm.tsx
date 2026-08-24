"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SurveyConfig, SurveyQuestion, UploadedFile } from "@/lib/types";

type Props = { config: SurveyConfig; token?: string };
type MapValue = Record<string, string | string[]>;
type AnswerValue = string | string[] | number | UploadedFile[] | MapValue;
type Answers = Record<string, AnswerValue>;

/** 순위 라벨 만들기: ["1순위", "2순위", "3순위"] */
function rankLabels(count: number): string[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => `${i + 1}순위`);
}

/** 순위·행렬 답변처럼 객체형 값인지 확인 (배열/파일 제외) */
function isMapValue(value: AnswerValue | undefined): value is MapValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function SurveyForm({ config, token }: Props) {
  const router = useRouter();
  const initialAnswers = useMemo(() => getInitialAnswers(config), [config]);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [error, setError] = useState("");

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (uploadingCount > 0) {
      setError("파일 업로드가 끝난 뒤 제출해 주세요.");
      return;
    }

    // 브라우저 기본 검증이 닿지 않는 문항(파일·복수선택·순위·행렬) 확인
    const problem = findAnswerProblem(config, answers);
    if (problem) {
      setError(problem.message);
      document.getElementById(`q-${problem.questionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey_id: config.id, answers, token })
      });

      const result = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "응답 제출 중 오류가 발생했습니다.");
      }

      router.push(`/complete?surveyId=${encodeURIComponent(config.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "응답 제출 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="form-body" onSubmit={handleSubmit}>
      {error && <div className="error">{error}</div>}

      {config.sections.map((section) => (
        <section className="section" key={section.id}>
          <h2 className="section-title">{section.title}</h2>
          {section.description && <p className="section-description">{section.description}</p>}
          {section.questions.map((question) => (
            <QuestionField
              key={question.id}
              surveyId={config.id}
              question={question}
              value={answers[question.id]}
              setAnswer={setAnswer}
              toggleMultiple={toggleMultiple}
              setRankValue={setRankValue}
              setMatrixCell={setMatrixCell}
              toggleMatrixCell={toggleMatrixCell}
              onUploadStart={() => setUploadingCount((n) => n + 1)}
              onUploadEnd={() => setUploadingCount((n) => Math.max(0, n - 1))}
            />
          ))}
        </section>
      ))}

      <div className="actions">
        <button className="submit-btn" type="submit" disabled={isSubmitting || uploadingCount > 0}>
          {isSubmitting ? "제출 중..." : uploadingCount > 0 ? "파일 업로드 중..." : "제출하기"}
        </button>
      </div>
    </form>
  );
}

function QuestionField({
  surveyId,
  question,
  value,
  setAnswer,
  toggleMultiple,
  setRankValue,
  setMatrixCell,
  toggleMatrixCell,
  onUploadStart,
  onUploadEnd
}: {
  surveyId: string;
  question: SurveyQuestion;
  value: AnswerValue;
  setAnswer: (questionId: string, value: AnswerValue) => void;
  toggleMultiple: (questionId: string, option: string, maxSelections?: number) => void;
  setRankValue: (questionId: string, labels: string[], label: string, option: string) => void;
  setMatrixCell: (questionId: string, rows: string[], row: string, column: string) => void;
  toggleMatrixCell: (questionId: string, rows: string[], row: string, column: string) => void;
  onUploadStart: () => void;
  onUploadEnd: () => void;
}) {
  const mapValue = isMapValue(value) ? value : {};
  return (
    <div className="question" id={`q-${question.id}`}>
      <div className="question-title">
        {question.title}
        {question.required && <span className="required">*</span>}
      </div>
      {question.description && <p className="question-desc">{question.description}</p>}

      {question.type === "single" && (
        <div className="option-list">
          {question.options?.map((option) => (
            <label className="option" key={option}>
              <input type="radio" name={question.id} value={option} checked={value === option} required={question.required} onChange={() => setAnswer(question.id, option)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
      )}

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

function FileField({
  surveyId,
  question,
  files,
  setFiles,
  onUploadStart,
  onUploadEnd
}: {
  surveyId: string;
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
  for (const section of config.sections) {
    for (const question of section.questions) {
      if (question.type === "multiple" || question.type === "file") answers[question.id] = [];
      else if (question.type === "ranking" || question.type === "matrix") answers[question.id] = {};
      else answers[question.id] = "";
    }
  }
  return answers;
}

/** 제출 전 클라이언트 검증: 문제가 있으면 해당 문항 id와 메시지를 반환 */
function findAnswerProblem(config: SurveyConfig, answers: Answers): { questionId: string; message: string } | null {
  for (const section of config.sections) {
    for (const question of section.questions) {
      const value = answers[question.id];

      if (question.type === "file") {
        const files = Array.isArray(value) ? (value as UploadedFile[]) : [];
        if (question.required && files.length === 0) {
          return { questionId: question.id, message: `"${question.title}" 문항에 파일을 첨부해 주세요.` };
        }
      }

      if (question.type === "multiple") {
        const picked = Array.isArray(value) ? (value as string[]) : [];
        if (question.required && picked.length === 0) {
          return { questionId: question.id, message: `"${question.title}" 문항을 하나 이상 선택해 주세요.` };
        }
        if (question.minSelections && picked.length > 0 && picked.length < question.minSelections) {
          return { questionId: question.id, message: `"${question.title}" 문항은 최소 ${question.minSelections}개를 선택해 주세요.` };
        }
        if (question.maxSelections && picked.length > question.maxSelections) {
          return { questionId: question.id, message: `"${question.title}" 문항은 최대 ${question.maxSelections}개까지 선택할 수 있습니다.` };
        }
      }

      if (question.type === "ranking") {
        const picked = isMapValue(value) ? value : {};
        if (question.required && Object.keys(picked).length === 0) {
          return { questionId: question.id, message: `"${question.title}" 문항에 최소 1순위를 선택해 주세요.` };
        }
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
            // 일부 행은 비워도 되지만, 최소 한 행은 선택해야 함
            if (answeredRows.length === 0) {
              return { questionId: question.id, message: `"${question.title}" 문항에서 최소 한 개는 선택해 주세요.` };
            }
          } else if (answeredRows.length < rows.length) {
            return { questionId: question.id, message: `"${question.title}" 문항의 모든 항목에 답해 주세요.` };
          }
        }
      }
    }
  }
  return null;
}

function range(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}
