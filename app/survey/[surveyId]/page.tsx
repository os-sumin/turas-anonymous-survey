import { notFound, redirect } from "next/navigation";
import SurveyForm from "@/components/SurveyForm";
import { loadSurveyConfig } from "@/lib/survey-store";
import { getEffectiveEndAt, isSurveyClosed } from "@/lib/survey-utils";
import { isPersonalizedSurvey, resolveSurveyTarget } from "@/lib/target-store";

// Firestore에서 설문을 읽으므로 매 요청마다 최신 상태를 반영
export const dynamic = "force-dynamic";

type Props = {
  params: { surveyId: string };
  searchParams: { t?: string; edit?: string };
};

export default async function SurveyPage({ params, searchParams }: Props) {
  const config = await loadSurveyConfig(params.surveyId);
  if (!config) notFound();

  if (isSurveyClosed(config)) {
    redirect(`/closed?surveyId=${encodeURIComponent(config.id)}`);
  }

  const resolvedTarget = isPersonalizedSurvey(config)
    ? await resolveSurveyTarget(config.id, searchParams.t)
    : null;

  if (resolvedTarget && !resolvedTarget.ok) {
    return (
      <main className="page-shell">
        <section className="survey-card target-access-error">
          <div className="badge">{config.agency}</div>
          <h1 className="title">조사 링크를 확인해 주세요</h1>
          <p className="subtitle">{resolvedTarget.message}</p>
          <p className="target-access-help">안내받으신 최신 설문 링크로 다시 접속해 주십시오.</p>
        </section>
      </main>
    );
  }

  const target = resolvedTarget?.ok ? resolvedTarget.value.target : undefined;

  return (
    <main className="page-shell">
      <header className="header">
        <div>
          <div className="logo-text">TURAS Survey</div>
          <div className="logo-sub">
            {config.personalization?.enabled
              ? "기업·과제 맞춤형 응답 화면"
              : config.anonymous === false
                ? "기명 설문 응답 화면"
                : "무기명 설문 응답 화면"}
          </div>
        </div>
        <div className="logo-sub">응답 마감: {formatDate(getEffectiveEndAt(config))}</div>
      </header>

      <section className="survey-card">
        <div className="card-head">
          <div className="badge">{config.agency}</div>
          <h1 className="title">{config.title}</h1>
          {config.subtitle && <p className="subtitle survey-description">{config.subtitle}</p>}
          <p className="subtitle survey-description">{config.description}</p>
          {config.images && config.images.length > 0 && (
            <div className="survey-images">
              {config.images.map((image, index) => (
                <figure className="survey-image" key={`${image.url}-${index}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt={image.caption || `설문 이미지 ${index + 1}`} />
                  {image.caption && <figcaption>{image.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}
          {config.notice.length > 0 && (
            <div className="notice-box">
              <ul>{config.notice.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
        </div>

        <SurveyForm config={config} token={searchParams.t} editCode={searchParams.edit} target={target} />
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
