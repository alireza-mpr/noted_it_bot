import type { CalendarEventDraft } from "../../../domain/calendar-event/calendar-event-draft";
import { Logger } from "../../logging/logger";
import type { ModelAnswer, ModelFailure } from "../model-result";
import type { Router } from "../router";
import { EVENT_ANSWER_SCHEMA } from "./event-answer-schema";
import eventExtractionPrompt from "./event-extraction-prompt.txt";
import { parseEventAnswer, type DraftResult } from "./parse-event-answer";

const LOGGER = new Logger<"extraction.completed">("extraction");
const OUTCOME_OF_REASON: Record<DraftFailureReason, ExtractionOutcome> = {
  "unusable-answer": "unusable_answer",
  "no-event": "no_event",
  "repeat-declined": "repeat_declined",
};

// Represents the result of an extraction: the draft, or the reason why there
// is none. "no-model" means that no model answered.
export type ExtractionResult =
  | { ok: true; draft: CalendarEventDraft; modelAnswer: ModelAnswer }
  | { ok: false; reason: "no-model"; modelFailure: ModelFailure }
  | {
      ok: false;
      reason: DraftFailureReason;
      detail: string;
      modelAnswer: ModelAnswer;
    };

// Sends the message to the models, and turns the model answer into a draft.
// beforeFirstTry runs just before the first model is tried (see Router.ask).
// Logs one extraction.completed event: the message, the model answer, and
// the outcome.
export async function extractDraft(
  router: Pick<Router, "ask">,
  messageText: string,
  beforeFirstTry?: () => Promise<void>,
): Promise<ExtractionResult> {
  const modelResult = await router.ask(
    {
      systemPrompt: eventExtractionPrompt,
      userPrompt: messageText,
      responseSchema: EVENT_ANSWER_SCHEMA,
    },
    beforeFirstTry,
  );
  if (!modelResult.ok) {
    logExtraction(messageText, null, "no_model", null);
    return { ok: false, reason: "no-model", modelFailure: modelResult };
  }

  const draftResult = parseEventAnswer(modelResult.text);
  if (draftResult.ok) {
    logExtraction(messageText, modelResult, "draft", null);
    return { ok: true, draft: draftResult.draft, modelAnswer: modelResult };
  }
  logExtraction(
    messageText,
    modelResult,
    OUTCOME_OF_REASON[draftResult.reason],
    draftResult.detail,
  );
  return { ...draftResult, modelAnswer: modelResult };
}

// Represents why a model answer gives no draft.
type DraftFailureReason = Extract<DraftResult, { ok: false }>["reason"];

// Represents the extraction.outcome values, in snake_case for the logs.
type ExtractionOutcome =
  | "draft"
  | "no_model"
  | "unusable_answer"
  | "no_event"
  | "repeat_declined";

// Logs the message log: every message that went to extraction, with the model
// answer. /start tells users that the bot may keep their messages.
function logExtraction(
  messageText: string,
  modelAnswer: ModelAnswer | null,
  extractionOutcome: ExtractionOutcome,
  problem: string | null,
): void {
  const logAttributes = {
    "extraction.message_text": messageText,
    "extraction.model_answer": modelAnswer?.text ?? null,
    "gen_ai.request.model": modelAnswer?.model.name ?? null,
    "extraction.outcome": extractionOutcome,
    "extraction.problem": problem,
  };
  if (extractionOutcome === "unusable_answer") {
    LOGGER.warn("extraction.completed", logAttributes);
  } else {
    LOGGER.info("extraction.completed", logAttributes);
  }
}
