export type RecognitionMode = "all" | "letters" | "digits";
export interface Prediction {
  mode: RecognitionMode; prediction: string; confidence: number; probabilities: {label:string; probability:number}[];
  processed_image: string; latency_ms:number; model:string; uncertain:boolean; warning:string;
  ambiguous_labels?:string[]; ambiguity_reason?:string|null; requires_type_choice?:boolean;
}
export interface HistoryItem extends Prediction { id:string; timestamp:string; image:string; source:string; expected?:string }
export interface Sample { id:string; label:string; image:string; source:string }
export interface Metrics {
  model:string; dataset:string; classes:string[]; train_samples:number; validation_samples:number; test_samples:number;
  accuracy:number; macro_f1:number; digit_accuracy?:number; letter_accuracy?:number; case_policy?:string; best_validation_accuracy:number; epochs:number; seed:number; parameters:number; training_seconds:number;
  history:{epoch:number; loss:number; train_accuracy:number; validation_accuracy:number}[];
  per_class:{label:string; precision:number; recall:number; f1:number; support:number}[];
  confusion_matrix:number[][]; architecture:string[]; scope:string;
}
