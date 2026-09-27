import eventExtractPrompt from "../prompts/event_extract.txt";
import type { ProviderFailure } from "../providers/providerClient";
import type { Router } from "../router/router";
import { EVENT_SCHEMA } from "./event_schema";
import type { ExtractedEvent } from "./extractedEvent";
import { describeError, Logger } from "../logging/logger";

const logger = new Logger("extractEvent");

// On failure: why no model answered (the last provider failure).
export type ExtractionResult = { ok: true; event: ExtractedEvent; model: string } | ProviderFailure;

// Asks the models to read the event in a message. onModelFound runs just
// before the first model is tried (see Router.generate).
export async function extractEvent(
  router: Router,
  telegramMessageText: string,
  onModelFound?: () => Promise<void>,
): Promise<ExtractionResult> {
  try {
    const answer = await router.generate(
      {
        systemPrompt: eventExtractPrompt,
        userPrompt: telegramMessageText,
        responseSchema: EVENT_SCHEMA,
      },
      onModelFound,
    );
    if (!answer.ok) {
      return answer;
    }

    const event: ExtractedEvent = JSON.parse(answer.text);
    logger.info("extracted", { sourceText: telegramMessageText, event });
    return { ok: true, event, model: answer.model };
  } catch (err) {
    logger.error("threw", describeError(err));
    return { ok: false, kind: "internal", detail: String(err) };
  }
}
