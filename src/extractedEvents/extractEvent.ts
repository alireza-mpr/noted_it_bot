import eventExtractPrompt from "../prompts/event_extract.txt";
import { NO_AVAILABLE_MODEL_MESSAGE } from "../interactiveMessages/messages";
import type { ProviderFailure } from "../providers/providerClient";
import type { Router } from "../router/router";
import { EVENT_SCHEMA } from "./event_schema";
import type { ExtractedEvent } from "./extractedEvent";
import { describeError, Logger } from "../logging/logger";

const logger = new Logger("extractEvent");

export interface DownstreamResult {
  result: "ok" | "failed";
  message: string;
  failure?: ProviderFailure;
  // The model that produced a successful answer.
  model?: string;
}

const NO_AVAILABLE_MODEL: DownstreamResult = {
  result: "failed",
  message: NO_AVAILABLE_MODEL_MESSAGE,
};

export async function extractEvent(
  router: Router,
  telegramMessageText: string,
): Promise<DownstreamResult> {
  try {
    const answer = await router.generate({
      systemPrompt: eventExtractPrompt,
      userPrompt: telegramMessageText,
      responseSchema: EVENT_SCHEMA,
    });
    if (answer.result === "failed") {
      return { ...NO_AVAILABLE_MODEL, failure: answer.failure };
    }

    const event: ExtractedEvent = JSON.parse(answer.text);
    logger.info("extracted", { sourceText: telegramMessageText, event });
    return {
      result: "ok",
      message: JSON.stringify(event),
      model: answer.model,
    };
  } catch (err) {
    logger.error("threw", describeError(err));
    return {
      ...NO_AVAILABLE_MODEL,
      failure: { kind: "internal", detail: String(err) },
    };
  }
}
