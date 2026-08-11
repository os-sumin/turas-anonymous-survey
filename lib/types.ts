export type QuestionType =
  | "single"
  | "multiple"
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
