"use client";

import { useEffect, useState } from "react";

const PASSWORD_STORAGE_KEY = "turas_admin_password";

type SurveyListItem = {
  id: string;
  title: string;
  agency: string;
  source: "firestore" | "code";
  responseCount: number;
};

type Header = { id: string; title: string; type: string };

type Row = {
  responseId: string;
  submittedAt: string;
  cells: Record<string, { text: string; files?: { name: string; url: string | null }[] }>;
};

type ResponseData = {
  survey: { id: string; title: string; agency: string; endAt?: string };
  count: number;
  headers: Header[];
  rows: Row[];
  truncated: boolean;
};

export default function ResponseDashboard() {
  const [password, setPassword] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [surveyList, setSurveyList] = useState<SurveyListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const stored = sessionStorage.getItem(PASSWORD_STORAGE_KEY);
    if (stored) setPassword(stored);
  }, []);

  useEffect(() => {
    if (!password) return;
    void (async () => {
      try {
        const response = await fetch("/api/admin/surveys", { headers: { "x-admin-password": password } });
        if (response.status === 401) {
          sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
          setPassword("");
          setMessage("비밀번호가 올바르지 않습니다.");
          return;
        }
        const result = (await response.json()) as { ok?: boolean; surveys?: SurveyListItem[] };
        if (result.ok && result.surveys) {
          setSurveyList(result.surveys);
          if (!selectedId && result.surveys.length > 0) setSelectedId(result.surveys[0].id);
        }
      } catch {
        setMessage("설문 목록을 불러오지 못했습니다.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password]);

  useEffect(() => {
    if (!password || !selectedId) return;
    void loadResponses(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, selectedId]);

  async function loadResponses(surveyId: string) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/responses?surveyId=${encodeURIComponent(surveyId)}`, {
        headers: { "x-admin-password": password }
      });
      const result = (await response.json()) as ResponseData & { ok?: boolean; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message || "조회에 실패했습니다.");
      setData(result);
    } catch (err) {
      setData(null);
      setMessage(err instanceof Error ? err.message : "조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadExcel() {
    if (!selectedId) return;
    setMessage("엑셀 생성 중...");
    try {
      const response = await fetch(`/api/admin/responses/export?surveyId=${encodeURIComponent(selectedId)}`, {
        headers: { "x-admin-password": password }
      });
      if (!response.ok) throw new Error("엑셀 생성에 실패했습니다.");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${selectedId}_응답내역.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "엑셀 생성에 실패했습니다.");
    }
  }

  function submitPassword() {
    const value = passwordInput.trim();
    if (!value) return;
    sessionStorage.setItem(PASSWORD_STORAGE_KEY, value);
    setPassword(value);
    setPasswordInput("");
  }

  if (!password) {
    return (
      <main className="builder-gate">
        <div className="builder-gate-card">
          <h1>응답 현황</h1>
          <p>관리자 비밀번호를 입력해 주세요.</p>
          <input
            type="password"
            value={passwordInput}
            autoFocus
            onChange={(event) => setPasswordInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitPassword();
            }}
          />
          <button className="builder-btn primary" onClick={submitPassword}>들어가기</button>
          {message && <div className="builder-gate-error">{message}</div>}
        </div>
      </main>
    );
  }

  return (
    <main className="builder-shell">
      <header className="builder-topbar">
        <div>
          <div className="builder-logo">응답 현황</div>
          <div className="builder-sub">제출 내역 조회 및 엑셀 다운로드</div>
        </div>
        <div className="builder-actions">
          <a className="builder-btn secondary" href="/admin/builder">설문 편집</a>
          <button className="builder-btn secondary" onClick={() => loadResponses(selectedId)} disabled={loading}>
            새로고침
          </button>
          <button className="builder-btn primary" onClick={downloadExcel} disabled={!data || data.count === 0}>
            엑셀 다운로드
          </button>
        </div>
      </header>

      <div className="response-shell">
        <div className="response-toolbar">
          <select
            className="response-select"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {surveyList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} ({item.responseCount}건)
              </option>
            ))}
          </select>
          {message && <span className="response-message">{message}</span>}
        </div>

        {data && (
          <div className="response-stats">
            <div className="stat-card">
              <div className="stat-label">총 응답</div>
              <div className="stat-value">{data.count.toLocaleString()}건</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">최근 제출</div>
              <div className="stat-value small">
                {data.rows[0] ? formatKST(data.rows[0].submittedAt) : "없음"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">응답 마감</div>
              <div className="stat-value small">
                {data.survey.endAt ? formatKST(data.survey.endAt) : "별도 안내"}
              </div>
            </div>
          </div>
        )}

        {loading && <div className="empty-box">불러오는 중...</div>}

        {data && !loading && data.rows.length === 0 && (
          <div className="empty-box">아직 제출된 응답이 없습니다.</div>
        )}

        {data && !loading && data.rows.length > 0 && (
          <>
            {data.truncated && (
              <div className="response-notice">
                화면에는 최근 300건만 표시됩니다. 전체 내역은 엑셀로 받아 주세요.
              </div>
            )}
            <div className="response-table-wrap">
              <table className="response-table">
                <thead>
                  <tr>
                    <th className="col-no">#</th>
                    <th className="col-date">제출일시</th>
                    {data.headers.map((header) => (
                      <th key={header.id} title={header.title}>{header.title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, index) => (
                    <tr key={row.responseId}>
                      <td className="col-no">{index + 1}</td>
                      <td className="col-date">{formatKST(row.submittedAt)}</td>
                      {data.headers.map((header) => {
                        const cell = row.cells[header.id];
                        return (
                          <td key={header.id}>
                            {cell?.files
                              ? cell.files.map((file) =>
                                  file.url ? (
                                    <a key={file.name} className="file-link" href={file.url} target="_blank" rel="noreferrer">
                                      {file.name}
                                    </a>
                                  ) : (
                                    <span key={file.name}>{file.name}</span>
                                  )
                                )
                              : cell?.text}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function formatKST(iso: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul"
  }).format(date);
}
