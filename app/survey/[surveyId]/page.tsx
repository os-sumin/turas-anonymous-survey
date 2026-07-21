import { notFound, redirect } from "next/navigation";
import SurveyForm from "@/components/SurveyForm";
import { loadSurveyConfig } from "@/lib/survey-store";
import { getEffectiveEndAt, isSurveyClosed } from "@/lib/survey-utils";

// Firestore에서 설문을 읽으므로 매 요청마다 최신 상태를 반영
export const dynamic = "force-dynamic";

type Props = {
  params: { surveyId: string };
  searchParams: { t?: string };
};

export default async function SurveyPage({ params, searchParams }: Props) {
  const config = await loadSurveyConfig(params.surveyId);
  if (!config) notFound();

  if (isSurveyClosed(config)) {
    redirect(`/closed?surveyId=${encodeURIComponent(config.id)}`);
  }

  return (
    <main className="page-shell">
      <header className="header">
        <div>
          <div className="logo-text">TURAS Survey</div>
          <div className="logo-sub">
            {config.anonymous === false ? "Survey response page" : "Anonymous response page"}
          </div>
        </div>
        <div className="logo-sub">응답 마감: {formatDate(getEffectiveEndAt(config))}</div>
      </header>

      <section className="survey-card">
        <div className="card-head">
          <div className="badge">{config.agency}</div>
          <h1 className="title">{config.title}</h1>
          {config.subtitle && <p className="subtitle">{config.subtitle}</p>}
          <p className="subtitle">{config.description}</p>
          {config.notice.length > 0 && (
            <div className="notice-box">
              <ul>{config.notice.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
        </div>

        <SurveyForm config={config} token={searchParams.t} />
      </section>

      <div className="footer-note">Powered by TURAS Survey</div>
    </main>
  );
}

function formatDate(value?: string) {
  if (!value) return "별도 안내";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "별도 안내";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul"
  }).format(date);
}
