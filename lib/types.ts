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
