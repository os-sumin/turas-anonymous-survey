import type { SurveyConfig } from "./types";

export const surveys: Record<string, SurveyConfig> = {
  nipa_ai_ict_2027: {
    id: "nipa_ai_ict_2027",
    agency: "정보통신산업진흥원",
    title: "2027년 AI ICT 재정지원 방향 수요조사",
    subtitle: "AI·ICT 분야 재정지원 수요 및 정책개선 의견수렴",
    description: "본 설문은 향후 AI·ICT 분야 재정지원 방향 설정을 위한 의견수렴 목적으로 진행됩니다.",
    notice: [
      "본 설문은 무기명으로 운영되며, 기업명·사업자번호·과제번호·담당자명 등 식별정보를 수집하지 않습니다.",
      "응답 결과는 통계 분석 및 정책방향 검토 목적으로만 활용됩니다.",
      "자유기재 문항에는 기업을 특정할 수 있는 정보를 입력하지 않는 것을 권장드립니다."
    ],
    endAt: "2027-12-31T23:59:59+09:00",
    sections: [
      {
        id: "section_1",
        title: "1. 기업의 AI·ICT 활용 및 사업화 현황",
        description: "현재 AI·ICT 기술 활용 수준과 사업화 단계를 확인합니다.",
        questions: [
          {
            id: "q1",
            type: "single",
            title: "현재 귀사의 AI·ICT 기술 활용 단계는 어디에 가장 가깝습니까?",
            required: true,
            options: ["기술 검토 단계", "시제품 또는 PoC 단계", "실증·고도화 단계", "상용화 초기 단계", "매출 발생 및 확산 단계", "해당 없음"]
          },
          {
            id: "q2",
            type: "multiple",
            title: "AI·ICT 사업화 과정에서 가장 큰 애로사항은 무엇입니까?",
            required: true,
            options: ["기술 고도화 필요", "실증·테스트베드 부족", "인증·규제 대응", "판로·수요처 확보", "전문인력 부족", "자금 및 투자 부족", "데이터 확보 어려움", "기타"]
          },
          {
            id: "q3",
            type: "scale",
            title: "향후 1~3년 내 AI·ICT 관련 매출 발생 가능성을 어떻게 보십니까?",
            required: true,
            min: 1,
            max: 5,
            minLabel: "매우 낮음",
            maxLabel: "매우 높음"
          }
        ]
      },
      {
        id: "section_2",
        title: "2. 재정지원 수요",
        description: "필요한 지원 유형과 우선순위를 확인합니다.",
        questions: [
          {
            id: "q4",
            type: "multiple",
            title: "가장 필요한 재정지원 유형을 선택해 주세요.",
            required: true,
            options: ["R&D 후속개발 지원", "실증·PoC 지원", "AI 인프라·클라우드 비용 지원", "데이터 구축·구매 지원", "인증·시험평가 지원", "사업화·마케팅 지원", "해외진출 지원", "인력양성 지원", "투자연계 또는 융자 지원"]
          },
          {
            id: "q5",
            type: "single",
            title: "재정지원 방식으로 가장 적절하다고 생각하는 형태는 무엇입니까?",
            required: true,
            options: ["정부출연금", "매칭펀드", "바우처", "융자", "민간투자 연계", "세액공제·간접지원", "기타"]
          },
          {
            id: "q6",
            type: "number",
            title: "희망하는 과제당 지원 규모는 어느 정도입니까? (단위: 백만원)",
            required: false,
            placeholder: "예: 300"
          }
        ]
      },
      {
        id: "section_3",
        title: "3. 정책 개선 및 기타 의견",
        questions: [
          {
            id: "q7",
            type: "textarea",
            title: "AI·ICT 재정지원 사업에서 개선이 필요하다고 생각하는 부분을 자유롭게 작성해 주세요.",
            required: false,
            placeholder: "예: 평가 방식, 지원기간, 사업비 사용기준, 행정절차, 성과관리 등"
          },
          {
            id: "q8",
            type: "textarea",
            title: "향후 신규 지원사업으로 필요하다고 생각하는 아이디어가 있다면 작성해 주세요.",
            required: false,
            placeholder: "기업을 특정할 수 있는 정보는 입력하지 않는 것을 권장합니다."
          }
        ]
      }
    ]
  }
};

export function getSurveyConfig(surveyId: string): SurveyConfig | null {
  return surveys[surveyId] ?? null;
}

export function getDefaultSurveyId(): string {
  return process.env.NEXT_PUBLIC_DEFAULT_SURVEY_ID || "nipa_ai_ict_2027";
}
