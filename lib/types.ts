export type QuestionType = "single" | "multiple" | "text" | "textarea" | "number" | "scale";

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
  sections: SurveySection[];
};
