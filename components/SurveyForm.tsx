"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SurveyConfig, SurveyQuestion } from "@/lib/types";

type Props = { config: SurveyConfig; token?: string };
type Answers = Record<string, string | string[] | number>;

export default function SurveyForm({ config, token }: Props) {
  const router = useRouter();
  const initialAnswers = useMemo(() => getInitialAnswers(config), [config]);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  function setAnswer(questionId: string, value: string | string[] | number) {
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
              question={question}
              value={answers[question.id]}
              setAnswer={setAnswer}
              toggleMultiple={toggleMultiple}
            />
          ))}
        </section>
      ))}

      <div className="actions">
        <button className="submit-btn" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "제출 중..." : "제출하기"}
        </button>
      </div>
    </form>
  );
}

function QuestionField({
  question,
  value,
  setAnswer,
  toggleMultiple
}: {
  question: SurveyQuestion;
  value: string | string[] | number;
  setAnswer: (questionId: string, value: string | string[] | number) => void;
  toggleMultiple: (questionId: string, option: string) => void;
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
              <input type="checkbox" name={question.id} value={option} checked={Array.isArray(value) && value.includes(option)} onChange={() => toggleMultiple(question.id, option)} />
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
    </div>
  );
}

function getInitialAnswers(config: SurveyConfig): Answers {
  const answers: Answers = {};
  for (const section of config.sections) {
    for (const question of section.questions) {
      answers[question.id] = question.type === "multiple" ? [] : "";
    }
  }
  return answers;
}

function range(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}
