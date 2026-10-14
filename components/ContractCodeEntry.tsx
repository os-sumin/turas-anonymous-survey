"use client";

import { FormEvent, useState } from "react";
import type { SurveyTarget } from "@/lib/types";

type LookupResult = {
  ok?: boolean;
  message?: string;
  access_token?: string;
  target?: SurveyTarget;
};

export default function ContractCodeEntry({
  surveyId,
  companyToken,
  companyName,
  contractCount
}: {
  surveyId: string;
  companyToken?: string;
  companyName?: string;
  contractCount?: number;
}) {
  const [code, setCode] = useState("");
  const [target, setTarget] = useState<SurveyTarget | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = code.trim().replace(/\s+/g, "").toUpperCase();
    if (!normalized) {
      setError("안내 메일에 기재된 계약ID를 입력해 주세요.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/target/access-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey_id: surveyId, contract_id: normalized, company_token: companyToken })
      });
      const result = await response.json() as LookupResult;
      if (!response.ok || !result.ok || !result.target || !result.access_token) {
        throw new Error(result.message || "계약ID를 확인하지 못했습니다.");
      }
      setCode(normalized);
      setTarget(result.target);
      setAccessToken(result.access_token);
    } catch (reason) {
      setTarget(null);
      setAccessToken("");
      setError(reason instanceof Error ? reason.message : "계약ID를 확인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setTarget(null);
    setAccessToken("");
    setError("");
    setCode("");
  }

  function startSurvey() {
    if (!accessToken) return;
    window.location.assign(`/survey/${encodeURIComponent(surveyId)}?t=${encodeURIComponent(accessToken)}`);
  }

  return (
    <div className="contract-code-entry">
      <div className="contract-code-title">
        <span>Q0.</span>
        <div>
          <h2>{companyName ? `${companyName}의 응답 대상 계약 선택` : "응답 기업 및 대상 기술 기본 정보"}</h2>
          <p>
            {companyName
              ? `귀사에 등록된 계약 ${contractCount || 1}건 중 응답할 계약ID를 입력하면 해당 과제정보가 표시됩니다.`
              : "안내 메일에 기재된 계약ID를 입력하면 귀사가 응답할 기술의 계약정보가 표시됩니다."}
          </p>
        </div>
      </div>

      {!target ? (
        <form className="contract-code-form" onSubmit={lookup}>
          <label htmlFor="contract-code">계약ID <strong>필수</strong></label>
          <div className="contract-code-input-row">
            <input
              id="contract-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="예: C-0001"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={busy}
              autoFocus
            />
            <button type="submit" className="submit-btn contract-code-submit" disabled={busy}>
              {busy ? "확인 중..." : "계약정보 확인"}
            </button>
          </div>
          {error && <div className="error contract-code-error">{error}</div>}
        </form>
      ) : (
        <div className="contract-code-result">
          <div className="contract-code-confirmed">계약ID {target.contractId}</div>
          <dl className="contract-code-summary">
            <SummaryRow label="소속 기업명" value={target.company.name} />
            <SummaryRow
              label="이전받은 기술명(계약 건명)"
              value={[target.projectId, target.contract.contractName || target.contract.projectName].filter(Boolean).join(" / ")}
            />
            <SummaryRow label="이전기관" value={target.contract.transferInstitution} />
            <SummaryRow label="계약기간" value={formatPeriod(target.contract.periodStart, target.contract.periodEnd)} />
            {target.company.businessNumber && (
              <SummaryRow label="사업자등록번호" value={target.company.businessNumber} />
            )}
          </dl>
          {target.responseId && <div className="submitted-notice">이 계약ID로 이미 응답이 제출되었습니다.</div>}
          <p className="contract-code-question">표시된 정보가 귀사가 응답할 기술이 맞습니까?</p>
          <p className="contract-code-help">정보가 다르면 코드를 다시 확인해 주세요. 세부 정보의 정정은 설문 안에서 입력할 수 있습니다.</p>
          <div className="contract-code-actions">
            <button type="button" className="step-btn prev" onClick={reset}>아니요, 다시 입력</button>
            <button type="button" className="submit-btn" onClick={startSurvey} disabled={Boolean(target.responseId)}>
              {target.responseId ? "이미 제출된 응답입니다" : "예, 설문 시작"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "보유정보 없음"}</dd>
    </div>
  );
}

function formatPeriod(start?: string, end?: string) {
  if (start && end) return `${start} ~ ${end}`;
  return start || end || "보유정보 없음";
}
