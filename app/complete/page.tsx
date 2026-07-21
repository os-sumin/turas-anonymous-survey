import { loadSurveyConfig } from "@/lib/survey-store";
import CloseButton from "@/components/CloseButton";

export const dynamic = "force-dynamic";

type Props = { searchParams: { surveyId?: string } };

export default async function CompletePage({ searchParams }: Props) {
  const config = searchParams.surveyId ? await loadSurveyConfig(searchParams.surveyId) : null;

  return (
    <main className="page-shell">
      <header className="header">
        <div>
          <div className="logo-text">{config?.agency || "TURAS Survey"}</div>
          <div className="logo-sub">Survey response page</div>
        </div>
      </header>

      <section className="simple-card">
        <h1 className="title">설문 응답이 제출되었습니다.</h1>
        <div className="icon-circle icon-success">✓</div>
        {config && <p className="complete-survey-title">{config.title}</p>}
        <p className="message">
          응답해 주셔서 감사합니다.
          <br />
          제출하신 내용은 조사 및 검토 목적으로만 활용됩니다.
        </p>
        <p className="message-sub">이 창은 닫으셔도 됩니다.</p>
        <CloseButton />
      </section>

      <div className="footer-note">Powered by TURAS Survey</div>
    </main>
  );
}
