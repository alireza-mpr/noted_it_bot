import type { Model } from "./model";
import type { ModelAnswer, ModelFailure } from "./model-result";

// Represents where one provider's model usage is stored. A port: the router
// calls it, and the database adapter implements it.
export interface ModelUsageStore {
  // Returns the models that are not used up, in the order to try them.
  availableModels(now: Date): Promise<readonly Model[]>;
  // Records a model's answer.
  recordAnswer(modelAnswer: ModelAnswer, now: Date): Promise<void>;
  // Records why a model gave no answer. A rate limit makes the model used up.
  recordFailure(model: Model, modelFailure: ModelFailure, now: Date): Promise<void>;
}
