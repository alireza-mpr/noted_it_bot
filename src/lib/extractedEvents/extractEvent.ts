import eventExtractPrompt from "../../../prompts/event_extract.txt";
import type { LlmClient, LlmFailure } from "../providers/providerClient";
import { EVENT_SCHEMA } from "./event_schema";
import type { ExtractedEvent } from "./extractedEvent";

export interface DownstreamResult {
  result: "ok" | "failed";
  message: string;
  failure?: LlmFailure;
}

const GEMINI_FAILURE: DownstreamResult = {
  result: "failed",
  message: "Sorry! I couldn't speak with Gemini",
};

export async function extractEvent(
  llm: LlmClient,
  telegramMessageText: string,
): Promise<DownstreamResult> {
  try {
    const answer = await llm.generate({
      systemPrompt: eventExtractPrompt,
      userPrompt: telegramMessageText,
      responseSchema: EVENT_SCHEMA,
    });
    if (answer.result === "failed") {
      return { ...GEMINI_FAILURE, failure: answer.failure };
    }

    const event: ExtractedEvent = JSON.parse(answer.text);
    console.log(
      "extractEvent: extracted",
      JSON.stringify({ source: telegramMessageText, event }),
    );
    return { result: "ok", message: JSON.stringify(event) };
  } catch (err) {
    console.error("extractEvent: threw", err);
    return {
      ...GEMINI_FAILURE,
      failure: { kind: "internal", detail: String(err) },
    };
  }
}
