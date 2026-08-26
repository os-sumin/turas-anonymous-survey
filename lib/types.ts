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
  sections: SurveySection[];
};

/** file 문항의 응답 1건 */
export type UploadedFile = {
  path: string;
  name: string;
  size: number;
  type?: string;
};
