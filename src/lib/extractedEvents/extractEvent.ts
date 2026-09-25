import eventExtractPrompt from "../../../prompts/event_extract.txt";
import type { ProviderFailure } from "../providers/providerClient";
import type { Router } from "../../router/router";
import { EVENT_SCHEMA } from "./event_schema";
import type { ExtractedEvent } from "./extractedEvent";

export interface DownstreamResult {
  result: "ok" | "failed";
  message: string;
  failure?: ProviderFailure;
}

const PROVIDER_FAILURE: DownstreamResult = {
  result: "failed",
  message: "Sorry! I couldn't speak with any provider",
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
      return { ...PROVIDER_FAILURE, failure: answer.failure };
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
      ...PROVIDER_FAILURE,
      failure: { kind: "internal", detail: String(err) },
    };
  }
}
