export type QuestionType =
  | "single"
  | "multiple"
  | "ranking"
  | "matrix"
  | "grid"
  | "text"
  | "textarea"
  | "number"
  | "scale"
  | "file";

/** 설문 설명·문항에 붙이는 이미지(공문, 참고자료 등). url은 https 링크 또는 data: URL */
export interface SurveyImage {
  url: string;
  caption?: string;
}

/** 입력형 표(grid)의 열 정의. 열마다 입력 방식을 다르게 지정 */
export interface GridColumn {
  /** 편집 중 안정적인 식별을 위한 내부 id(있으면 사용). 응답 저장에는 영향 없음 */
  id?: string;
  label: string;
  /** text: 단답 입력, number: 숫자 입력, select: 드롭다운 선택 */
  type: "text" | "number" | "select";
  /** select일 때의 선택지 */
  options?: string[];
  /** 입력칸 안내문(placeholder). text/number 전용 */
  placeholder?: string;
}

export type SurveyQuestion = {
  id: string;
  type: QuestionType;
  title: string;
  description?: string;
  /** 문항에 붙는 이미지 자료(참고 도표 등) */
  images?: SurveyImage[];
  required?: boolean;
  options?: string[];
  /** 객관식(단일·복수) 전용: "기타(직접 입력)" 항목을 추가 */
  allowOther?: boolean;
  /** 기타 항목 라벨 (기본 "기타") */
  otherLabel?: string;
  /** 조건부 표시: 기준 문항이 특정 값일 때만 이 문항을 보여줌(분기). 아니면 숨김+미수집 */
  showIf?: { questionId: string; values: string[] };
  placeholder?: string;
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  /** multiple 전용: 최대 선택 개수. 예) "최대 3개" → 3. 비우면 제한 없음 */
  maxSelections?: number;
  /** multiple 전용: 최소 선택 개수. 비우면 required 여부만 적용 */
  minSelections?: number;
  /** ranking 전용: 순위 개수(1순위~N순위). 기본 3. 선택지는 options 사용 */
  rankCount?: number;
  /** ranking 전용: 필수일 때 모든 순위를 채워야 통과(선택지 수가 적으면 그만큼). 기본 false(최소 1순위) */
  requireAllRanks?: boolean;
  /** matrix 전용: 행(평가 항목) 목록. 각 행마다 열 중 하나를 선택 */
  rows?: string[];
  /** matrix 전용: 열(선택지) 목록 */
  columns?: string[];
  /** matrix 전용: 한 행에서 여러 열을 선택할 수 있게 함(체크박스). 기본 false(행별 1개, 라디오) */
  matrixMultiple?: boolean;
  /** matrix 전용: 필수라도 일부 행을 비워둘 수 있게 허용(최소 1개 셀만 선택하면 통과). 기본 false(모든 행 응답 필수) */
  allowRowSkip?: boolean;
  /** grid(입력형 표) 전용: 열(입력 필드) 정의. 행은 rows 사용 */
  gridColumns?: GridColumn[];
  /** grid 전용: 필수일 때 모든 행의 모든 칸을 채워야 통과. 기본 false(최소 1칸) */
  requireAllCells?: boolean;
  /** file 전용: 허용 확장자 목록. 예: [".pdf", ".xlsx"] */
  accept?: string[];
  /** file 전용: 파일 1개당 최대 용량(MB). 기본 20 */
  maxSizeMB?: number;
  /** file 전용: 최대 첨부 개수. 기본 1 */
  maxFiles?: number;
  /**
   * 이 문항의 답을 첨부파일명·ZIP명에 쓴다.
   * "project" = 과제번호 자리, "company" = 기업명 자리.
   * 파일명은 과제번호_기업명_문항제목 순서로 조합된다.
   */
  namePart?: "project" | "company";
  /** file 전용: 파일명 뒤에 붙일 짧은 라벨. 비우면 문항 제목을 쓴다. 예: "서면실태조사표" */
  fileLabel?: string;
};

export type SurveySection = {
  id: string;
  title: string;
  description?: string;
  questions: SurveyQuestion[];
};

export type PersonalizationSource = "company" | "contract";
export type PersonalizationBlockPosition = "before_first" | "after_question" | "after_last";

/** 조사대상 엑셀의 한 열을 맞춤정보 블록에 표시하는 설정 */
export type PersonalizationFieldConfig = {
  key: string;
  label: string;
  visible: boolean;
};

/** 설문 안에 배치하는 조사대상 맞춤정보 확인·정정 블록 */
export type PersonalizationBlock = {
  id: string;
  source: PersonalizationSource;
  title: string;
  /** 비우면 첫 번째 섹션에 표시 */
  sectionId?: string;
  position: PersonalizationBlockPosition;
  /** position이 after_question일 때 기준이 되는 일반 문항 ID */
  afterQuestionId?: string;
  /** 배열 순서가 화면 표시 순서이며 visible=false면 숨김 */
  fields: PersonalizationFieldConfig[];
};

export type SurveyConfig = {
  id: string;
  agency: string;
  title: string;
  subtitle?: string;
  description: string;
  /** 설문 상단에 표시할 이미지(공문 스캔 등) */
  images?: SurveyImage[];
  notice: string[];
  startAt?: string;
  endAt?: string;
  /** true면 무기명 설문(식별정보 미수집). 기본 false */
  anonymous?: boolean;
  /** true면 제출 후 '수정 코드'를 발급해, 응답자가 코드로 자기 응답을 다시 수정할 수 있게 함 */
  allowEdit?: boolean;
  /** true면 보관(종료) 상태 — 더 이상 응답을 받지 않음. 보관함의 '보관됨'으로 분류 */
  archived?: boolean;
  /** 기업·과제·계약별 발급 링크로 KEITI 보유정보를 맞춤 표시 */
  personalization?: {
    enabled: boolean;
    /** 설문 제작 화면에서 관리하는 맞춤정보 표시 블록 */
    blocks?: PersonalizationBlock[];
    /** 1-1 기업정보 확인·정정 표 표시. 기본 true */
    companyVerification?: boolean;
    /** 1-3 기술실시계약 정보 확인·정정 표 표시. 기본 true */
    contractVerification?: boolean;
    /** 1-3 표를 이 일반 문항 바로 뒤에 배치. 비우면 첫 일반 문항 뒤 */
    contractAfterQuestionId?: string;
  };
  sections: SurveySection[];
};

export type SurveyTargetCompany = {
  name: string;
  businessNumber: string;
  representative: string;
  region: string;
  size: string;
  industry: string;
};

export type SurveyTargetContract = {
  projectName: string;
  transferInstitution: string;
  contractName: string;
  signedAt: string;
  amount: number | null;
};

/**
 * 기업+과제(+계약) 단위 조사대상. targetId는 내부 식별값이고,
 * 실제 응답 링크에는 식별정보 대신 무작위 토큰만 노출한다.
 */
export type SurveyTarget = {
  targetId: string;
  surveyId: string;
  companyId: string;
  projectId: string;
  contractId: string;
  company: SurveyTargetCompany;
  contract: SurveyTargetContract;
  active: boolean;
  expiresAt?: string;
  responseId?: string;
};

/** 응답에 보존하는 당시 표시정보. 접근 토큰과 토큰 해시는 포함하지 않는다. */
export type SurveyTargetSnapshot = Omit<SurveyTarget, "active" | "expiresAt" | "responseId">;

/** file 문항의 응답 1건 */
export type UploadedFile = {
  path: string;
  name: string;
  size: number;
  type?: string;
};
