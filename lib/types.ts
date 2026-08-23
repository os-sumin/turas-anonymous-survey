export type QuestionType =
  | "single"
  | "multiple"
  | "ranking"
  | "matrix"
  | "text"
  | "textarea"
  | "number"
  | "scale"
  | "file";

export type SurveyQuestion = {
  id: string;
  type: QuestionType;
  title: string;
  description?: string;
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
  notice: string[];
  startAt?: string;
  endAt?: string;
  /** true면 무기명 설문(식별정보 미수집). 기본 false */
  anonymous?: boolean;
  sections: SurveySection[];
};

/** file 문항의 응답 1건 */
export type UploadedFile = {
  path: string;
  name: string;
  size: number;
  type?: string;
};
