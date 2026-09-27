import type { Model } from "./model";
import type { ModelRequest, ModelResult } from "./model-result";

// Represents a client for one provider's API. A port: the router calls it, and
// each provider implements it. HTTP errors and timeouts come back as a
// ModelFailure; a thrown error means a bug.
export interface ProviderClient {
  call(model: Model, modelRequest: ModelRequest): Promise<ModelResult>;
}
