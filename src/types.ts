export type FieldType = 'text' | 'textarea' | 'radio' | 'checkbox' | 'dropdown' | 'date' | 'time' | 'linear_scale' | 'unknown';

export interface FormField {
  label: string;
  type: FieldType;
  options?: string[];
  required: boolean;
}

export interface FormSubmissionResult {
  respondentIndex: number;
  success: boolean;
  persona?: string;
  error?: string;
}

export interface RespondentProfile {
  name: string;
  percentage: number;
  description: string;
}

export interface QuestionTarget {
  questionKeyword: string;
  targetAnswer: string;
  targetPercentage: number;
  applyToProfiles?: string[];
}

export interface SurveyConfig {
  respondentProfiles: RespondentProfile[];
  questionTargets: QuestionTarget[];
}

export interface WeightedOption {
  option: string;
  percentage: number;
}

export interface UIFieldConfig {
  label: string;
  type: FieldType;
  answerHint?: string;
  targetPercentage: number;
  applyToProfiles: string[];
  weightedOptions?: WeightedOption[];
}

export type AnswerMode = 'ai-all' | 'pct';

export interface JobRequest {
  url: string;
  respondentCount: number;
  headless: boolean;
  provider: 'claude' | 'sealion';
  respondentProfiles: RespondentProfile[];
  fieldConfigs: UIFieldConfig[];
  mode: AnswerMode;
}
