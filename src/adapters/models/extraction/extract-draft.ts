import { APP_CONFIG } from "../../../config/app-config";
import type { CalendarEventDraft } from "../../../domain/calendar-event/calendar-event-draft";
import { Logger } from "../../logging/logger";
import type { ModelAnswer, ModelFailure, ModelRequest } from "../model-result";
import type { Router } from "../router";
import { EVENT_ANSWER_SCHEMA } from "./event-answer-schema";
import eventExtractionPrompt from "./event-extraction-prompt.txt";
import { parseEventAnswer, type DraftResult } from "./parse-event-answer";

const LOGGER = new Logger<"extraction.completed" | "extraction.escalated">("extraction");
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
// An unsure answer from a light model is asked again of a strong model.
// beforeFirstTry runs just before the first model is tried (see Router.ask).
// Logs one extraction.completed event: the message, the model answer used,
// and the outcome.
export async function extractDraft(
  router: Pick<Router, "ask">,
  messageText: string,
  beforeFirstTry?: () => Promise<void>,
): Promise<ExtractionResult> {
  const modelRequest: ModelRequest = {
    systemPrompt: eventExtractionPrompt,
    userPrompt: messageText,
    responseSchema: EVENT_ANSWER_SCHEMA,
  };
  const modelResult = await router.ask(modelRequest, beforeFirstTry);
  if (!modelResult.ok) {
    logExtraction(messageText, null, "no_model", null);
    return { ok: false, reason: "no-model", modelFailure: modelResult };
  }

  const firstAnswer = parsedAnswerOf(modelResult);
  const usedAnswer = isUnsure(firstAnswer)
    ? await answerOfStrongModel(router, modelRequest, firstAnswer)
    : firstAnswer;
  return extractionResultOf(messageText, usedAnswer);
}

// Returns the answer to use when the first answer is unsure: a strong model's
// answer, even if it is unsure too, or the first answer when no strong model
// gives a usable one.
async function answerOfStrongModel(
  router: Pick<Router, "ask">,
  modelRequest: ModelRequest,
  firstAnswer: ParsedAnswer,
): Promise<ParsedAnswer> {
  const modelResult = await router.ask(modelRequest, undefined, { onlyTier: "strong" });
  if (!modelResult.ok) {
    logEscalation(firstAnswer, null, "no_strong_model");
    return firstAnswer;
  }
  const strongAnswer = parsedAnswerOf(modelResult);
  if (isUnusable(strongAnswer.draftResult)) {
    logEscalation(firstAnswer, strongAnswer, "strong_answer_unusable");
    return firstAnswer;
  }
  logEscalation(firstAnswer, strongAnswer, "strong_answer_used");
  return strongAnswer;
}

// Returns true when a light model gave a draft with a confidence below the
// limit. A draft from a strong model is final.
function isUnsure(parsedAnswer: ParsedAnswer): boolean {
  const { modelAnswer, draftResult } = parsedAnswer;
  return (
    modelAnswer.model.tier === "light" &&
    draftResult.ok &&
    draftResult.draft.confidence < APP_CONFIG.escalateBelowConfidence
  );
}

function isUnusable(draftResult: DraftResult): boolean {
  return !draftResult.ok && draftResult.reason === "unusable-answer";
}

function parsedAnswerOf(modelAnswer: ModelAnswer): ParsedAnswer {
  return { modelAnswer, draftResult: parseEventAnswer(modelAnswer.text) };
}

// Returns the extraction result of the answer used, and logs it.
function extractionResultOf(messageText: string, parsedAnswer: ParsedAnswer): ExtractionResult {
  const { modelAnswer, draftResult } = parsedAnswer;
  if (draftResult.ok) {
    logExtraction(messageText, modelAnswer, "draft", null);
    return { ok: true, draft: draftResult.draft, modelAnswer };
  }
  logExtraction(
    messageText,
    modelAnswer,
    OUTCOME_OF_REASON[draftResult.reason],
    draftResult.detail,
  );
  return { ...draftResult, modelAnswer };
}

// Logs the message log: every message that went to extraction, with the model
// answer used.
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

// Logs an unsure answer that was asked again of a strong model: both models,
// both confidences, and which answer was used. Used to tune
// APP_CONFIG.escalateBelowConfidence.
function logEscalation(
  firstAnswer: ParsedAnswer,
  strongAnswer: ParsedAnswer | null,
  escalationOutcome: EscalationOutcome,
): void {
  LOGGER.info("extraction.escalated", {
    "extraction.first_model": firstAnswer.modelAnswer.model.name,
    "extraction.first_confidence": confidenceOf(firstAnswer.draftResult),
    "extraction.strong_model": strongAnswer?.modelAnswer.model.name ?? null,
    "extraction.strong_confidence": strongAnswer === null ? null : confidenceOf(strongAnswer.draftResult),
    "extraction.escalation_outcome": escalationOutcome,
  });
}

function confidenceOf(draftResult: DraftResult): number | null {
  return draftResult.ok ? draftResult.draft.confidence : null;
}

// Represents a model answer and what parsing it gave.
interface ParsedAnswer {
  modelAnswer: ModelAnswer;
  draftResult: DraftResult;
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

// Represents the extraction.escalation_outcome values: which answer was used,
// and why.
type EscalationOutcome =
  | "strong_answer_used"
  | "no_strong_model"
  | "strong_answer_unusable";
