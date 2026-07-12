import Link from "next/link";
import { getSurveyConfig } from "@/lib/survey.config";

type Props = { searchParams: { surveyId?: string } };

export default function ClosedPage({ searchParams }: Props) {
  const config = searchParams.surveyId ? getSurveyConfig(searchParams.surveyId) : null;

  return (
    <main className="page-shell">
      <header className="header">
        <div>
          <div className="logo-text">{config?.agency || "TURAS Survey"}</div>
          <div className="logo-sub">Anonymous response page</div>
        </div>
      </header>

      <section className="simple-card">
        <h1 className="title">{config ? `(${config.agency}) ${config.title}` : "설문조사"}</h1>
        <div className="icon-circle">×</div>
        <p className="message">
          [답변종료된 설문 입니다. 더 이상 답변할 수 없습니다.
          <br />
          만약 답변 중에 이 페이지로 넘어왔다면 답변이 제출되지 않은 것입니다.]
        </p>
        <Link className="exit-btn" href="/">나가기</Link>
      </section>

      <div className="footer-note">Powered by TURAS Survey</div>
    </main>
  );
}
