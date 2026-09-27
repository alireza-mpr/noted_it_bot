import diagPingPrompt from "../../prompts/diag_ping.txt";
import type { Router } from "../../router/router";
import type { Replier } from "../replier";
import { describeError, Logger } from "../../logging/logger";

const logger = new Logger("diagCommandHandler");

// Asks the models to reply "PONG". Returns the problem, or null if they did.
async function checkModels(router: Router): Promise<string | null> {
  const answer = await router.generate({ userPrompt: diagPingPrompt.trim(), temperature: 0 });
  if (!answer.ok) {
    return answer.kind;
  }
  return answer.text.trim() === "PONG" ? null : "unexpected reply";
}

// Replies "Gemini: OK", or "Gemini: Broken (<problem>)".
export async function diagCommandHandler(router: Router, replier: Replier): Promise<void> {
  const problem = await checkModels(router).catch((err) => {
    logger.error("diag check threw", { check: "Gemini", ...describeError(err) });
    return "threw";
  });
  logger.info("diag check completed", { check: "Gemini", healthy: problem === null });
  await replier.sendPlain(`Gemini: ${problem === null ? "OK" : `Broken (${problem})`}`);
}
