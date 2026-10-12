import type { ModelTier } from "./model";
import type { ModelFailure, ModelRequest, ModelResult } from "./model-result";
import type { ModelUsageStore } from "./model-usage-store";
import type { ProviderClient } from "./provider-client";
import {
  logModelAnswered,
  logModelFailed,
  logModelsListed,
  logModelTried,
  logNoModelAnswered,
  logRouterFailed,
} from "./router-log";

const NO_MODEL_AVAILABLE: ModelFailure = {
  ok: false,
  kind: "rate-limited",
  limitWindow: null,
  retryAfterSeconds: null,
  httpStatus: null,
  detail: "no model is under its limits",
};

// Represents a provider for the router: its client, and where its model usage
// is stored.
export interface RoutedProvider {
  providerClient: ProviderClient;
  modelUsageStore: ModelUsageStore;
}

// Represents how the router picks models for one request. onlyTier limits it
// to the models of one tier, e.g. "strong" for a second opinion.
export interface RouteOptions {
  onlyTier?: ModelTier;
}

// Represents the router: tries the models in order until one answers. See
// ADR-4 in ARCHITECTURE_DECISIONS_REGISTRY.md.
export class Router {
  constructor(private readonly routedProviders: readonly RoutedProvider[]) {}

  // Tries each provider's available models in order, until one answers.
  // Returns the answer, or the last failure. beforeFirstTry runs once, just
  // before the first model is tried (e.g. to tell the user that work has
  // started). It does not run when no model is available.
  async ask(
    modelRequest: ModelRequest,
    beforeFirstTry: () => Promise<void> = async () => {},
    routeOptions: RouteOptions = {},
  ): Promise<ModelResult> {
    try {
      return await this.tryProviders(modelRequest, beforeFirstTry, routeOptions);
    } catch (error) {
      logRouterFailed(error);
      return {
        ok: false,
        kind: "internal",
        httpStatus: null,
        detail: String(error),
      };
    }
  }

  private async tryProviders(
    modelRequest: ModelRequest,
    beforeFirstTry: () => Promise<void>,
    routeOptions: RouteOptions,
  ): Promise<ModelResult> {
    let lastModelFailure = NO_MODEL_AVAILABLE;
    let firstTryDone = false;
    const { onlyTier } = routeOptions;
    for (const { providerClient, modelUsageStore } of this.routedProviders) {
      const availableModels = (await modelUsageStore.availableModels(new Date())).filter(
        (model) => onlyTier === undefined || model.tier === onlyTier,
      );
      logModelsListed(availableModels);
      for (const model of availableModels) {
        if (!firstTryDone) {
          firstTryDone = true;
          await beforeFirstTry();
        }
        logModelTried(model);
        const modelResult = await providerClient.call(model, modelRequest);
        if (modelResult.ok) {
          await modelUsageStore.recordAnswer(modelResult, new Date());
          logModelAnswered(modelResult);
          return modelResult;
        }
        lastModelFailure = modelResult;
        await modelUsageStore.recordFailure(model, modelResult, new Date());
        logModelFailed(model, modelResult);
        // A bad API key breaks every model of this provider, so try the next
        // provider. Any other failure says nothing about the provider's other
        // models (e.g. a removed model, a 503, or an empty answer).
        if (modelResult.kind === "unauthorized") {
          break;
        }
      }
    }
    logNoModelAnswered();
    return lastModelFailure;
  }
}
