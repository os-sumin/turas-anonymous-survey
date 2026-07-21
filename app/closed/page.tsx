import { loadSurveyConfig } from "@/lib/survey-store";
import CloseButton from "@/components/CloseButton";

export const dynamic = "force-dynamic";

type Props = { searchParams: { surveyId?: string } };

export default async function ClosedPage({ searchParams }: Props) {
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
        <h1 className="title">{config ? config.title : "설문조사"}</h1>
        <div className="icon-circle">×</div>
        <p className="message">
          답변이 종료된 설문입니다. 더 이상 응답할 수 없습니다.
          <br />
          답변 도중 이 페이지로 넘어왔다면 응답이 제출되지 않은 것입니다.
        </p>
        <p className="message-sub">문의사항은 담당자에게 연락해 주세요.</p>
        <CloseButton />
      </section>

      <div className="footer-note">Powered by TURAS Survey</div>
    </main>
  );
}
