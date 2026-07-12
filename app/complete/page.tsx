import Link from "next/link";

export default function CompletePage() {
  return (
    <main className="page-shell">
      <section className="simple-card">
        <h1 className="title">설문 응답이 제출되었습니다.</h1>
        <div className="icon-circle icon-success">✓</div>
        <p className="message">
          소중한 의견을 남겨주셔서 감사합니다.
          <br />
          응답 내용은 통계 분석 및 정책방향 검토 목적으로 활용됩니다.
        </p>
        <Link className="exit-btn" href="/">나가기</Link>
      </section>
    </main>
  );
}
