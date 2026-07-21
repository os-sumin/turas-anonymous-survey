"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SurveyConfig, SurveyQuestion, UploadedFile } from "@/lib/types";

type Props = { config: SurveyConfig; token?: string };
type AnswerValue = string | string[] | number | UploadedFile[];
type Answers = Record<string, AnswerValue>;

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

  function toggleMultiple(questionId: string, option: string) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? (prev[questionId] as string[]) : [];
      const next = current.includes(option) ? current.filter((item) => item !== option) : [...current, option];
      return { ...prev, [questionId]: next };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (uploadingCount > 0) {
      setError("파일 업로드가 끝난 뒤 제출해 주세요.");
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
  onUploadStart,
  onUploadEnd
}: {
  surveyId: string;
  question: SurveyQuestion;
  value: AnswerValue;
  setAnswer: (questionId: string, value: AnswerValue) => void;
  toggleMultiple: (questionId: string, option: string) => void;
  onUploadStart: () => void;
  onUploadEnd: () => void;
}) {
  return (
    <div className="question">
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
        <div className="option-list">
          {question.options?.map((option) => (
            <label className="option" key={option}>
              <input type="checkbox" name={question.id} value={option} checked={Array.isArray(value) && (value as string[]).includes(option)} onChange={() => toggleMultiple(question.id, option)} />
              <span>{option}</span>
            </label>
          ))}
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

      {/* 필수 문항인데 첨부가 없으면 브라우저 기본 검증에 걸리도록 */}
      {question.required && files.length === 0 && (
        <input
          className="file-required-guard"
          required
          tabIndex={-1}
          aria-hidden="true"
          value=""
          onChange={() => undefined}
        />
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
      answers[question.id] =
        question.type === "multiple" || question.type === "file" ? [] : "";
    }
  }
  return answers;
}

function range(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}
