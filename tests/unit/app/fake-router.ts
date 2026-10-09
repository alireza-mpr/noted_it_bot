import type { ModelRequest, ModelResult } from "../../../src/adapters/models/model-result";

// Represents a router that gives a fixed result, after the first try.
export class FakeRouter {
  readonly modelRequests: ModelRequest[] = [];

  constructor(private readonly modelResult: ModelResult) {}

  async ask(modelRequest: ModelRequest, beforeFirstTry: () => Promise<void> = async () => {}): Promise<ModelResult> {
    this.modelRequests.push(modelRequest);
    await beforeFirstTry();
    return this.modelResult;
  }
}
