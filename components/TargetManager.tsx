"use client";

import { useEffect, useState } from "react";

const PASSWORD_STORAGE_KEY = "turas_admin_password";

export default function TargetManager() {
  const [password, setPassword] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [surveyId, setSurveyId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const stored = sessionStorage.getItem(PASSWORD_STORAGE_KEY);
    if (stored) setPassword(stored);
    const params = new URLSearchParams(window.location.search);
    setSurveyId(params.get("surveyId") || "");
    setBaseUrl(window.location.origin);
  }, []);

  function submitPassword() {
    const value = passwordInput.trim();
    if (!value) return;
    sessionStorage.setItem(PASSWORD_STORAGE_KEY, value);
    setPassword(value);
    setPasswordInput("");
  }

  async function downloadTemplate() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/targets/template", {
        headers: { "x-admin-password": password }
      });
      await saveResponseFile(response, "TURAS_맞춤형설문_조사대상_업로드양식.xlsx");
      setMessage("업로드 양식을 내려받았습니다.");
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  async function importTargets() {
    if (!surveyId.trim()) {
      setMessage("설문 ID를 입력해 주세요.");
      return;
    }
    if (!file) {
      setMessage("조사대상 엑셀 파일을 선택해 주세요.");
      return;
    }

    setBusy(true);
    setMessage("조사대상 등록 및 개별 링크 생성 중...");
    try {
      const form = new FormData();
      form.set("survey_id", surveyId.trim());
      form.set("base_url", baseUrl.trim());
      form.set("file", file);
      const response = await fetch("/api/admin/targets/import", {
        method: "POST",
        headers: { "x-admin-password": password },
        body: form
      });
      const count = response.headers.get("X-Imported-Count");
      const warningCount = Number(response.headers.get("X-Import-Warning-Count") || "0");
      await saveResponseFile(response, `${surveyId}_기업과제별_설문링크.xlsx`);
      setMessage(
        `${count || "전체"}개 조사대상을 등록하고 개별 링크 엑셀을 생성했습니다.` +
        (warningCount > 0 ? ` ${warningCount}개 행은 설문 표시정보가 일부 비어 있으므로 결과 엑셀의 처리결과를 확인해 주세요.` : "")
      );
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  function handleError(error: unknown) {
    const text = error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";
    if (text === "관리자 인증이 필요합니다.") {
      sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
      setPassword("");
    }
    setMessage(text);
  }

  if (!password) {
    return (
      <main className="builder-gate">
        <div className="builder-gate-card">
          <h1>조사대상 관리</h1>
          <p>관리자 비밀번호를 입력해 주세요.</p>
          <input
            type="password"
            value={passwordInput}
            autoFocus
            onChange={(event) => setPasswordInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submitPassword()}
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
          <div className="builder-logo">맞춤형 설문 조사대상 관리</div>
          <div className="builder-sub">기업+과제+계약별 개별 링크 발급</div>
        </div>
        <div className="builder-actions">
          <a className="builder-btn secondary" href="/admin/builder">설문 편집</a>
          <a className="builder-btn secondary" href="/admin/responses">응답 현황</a>
        </div>
      </header>

      <div className="target-manager-shell">
        <section className="builder-card">
          <h1>1. 조사대상 양식 준비</h1>
          <p className="target-manager-note">
            양식의 기업ID·과제ID와 설문 제작 화면에서 표시하도록 선택한 정보 열은 필수입니다.
            동일 기업·과제에 계약이 여러 건이면 계약ID도 반드시 구분해 주세요.
          </p>
          <button className="builder-btn secondary" type="button" onClick={downloadTemplate} disabled={busy}>
            업로드 양식 내려받기
          </button>
        </section>

        <section className="builder-card">
          <h1>2. 조사대상 등록 및 링크 생성</h1>
          <div className="builder-grid target-manager-grid">
            <label>
              설문 ID
              <input value={surveyId} onChange={(event) => setSurveyId(event.target.value)} placeholder="예: keiti_2026" />
            </label>
            <label>
              설문 서비스 주소
              <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://survey.example.com" />
            </label>
            <label className="builder-col-span">
              조사대상 엑셀
              <input
                type="file"
                accept=".xlsx"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
            </label>
          </div>
          <button className="builder-btn primary target-import-button" type="button" onClick={importTargets} disabled={busy}>
            {busy ? "처리 중..." : "등록하고 개별 링크 엑셀 받기"}
          </button>
          {message && <div className="response-notice target-manager-message">{message}</div>}
          <p className="target-manager-warning">
            같은 조사대상을 다시 등록하면 새 링크가 발급되고 이전 링크는 사용할 수 없습니다. 기존 응답은 삭제되지 않습니다.
          </p>
        </section>
      </div>
    </main>
  );
}

async function saveResponseFile(response: Response, fallbackName: string) {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(response.status === 401 ? "관리자 인증이 필요합니다." : body?.message || "파일 생성에 실패했습니다.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fallbackName;
  anchor.click();
  URL.revokeObjectURL(url);
}
