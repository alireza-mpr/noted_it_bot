import diagPingPrompt from "../../prompts/diag_ping.txt";
import type { Router } from "../../router/router";
import type { Replier } from "../replier";
import { describeError, Logger } from "../../logging/logger";

const logger = new Logger("diagCommandHandler");

interface DiagCheck {
  name: string;
  run: (router: Router) => Promise<string | null>;
}

const DIAG_CHECKS: DiagCheck[] = [
  {
    name: "Gemini",
    run: async (router) => {
      const answer = await router.generate({
        userPrompt: diagPingPrompt.trim(),
        temperature: 0,
      });
      if (answer.result === "failed") {
        return answer.failure.kind;
      }
      return answer.text.trim() === "PONG" ? null : "unexpected reply";
    },
  },
];

async function runDiagnostics(router: Router): Promise<string> {
  const lines = await Promise.all(
    DIAG_CHECKS.map(async (check) => {
      const problem = await check.run(router).catch((err) => {
        logger.error("diag check threw", {
          check: check.name,
          ...describeError(err),
        });
        return "threw";
      });
      logger.info("diag check completed", {
        check: check.name,
        healthy: problem === null,
      });
      return `${check.name}: ${problem === null ? "OK" : `Broken (${problem})`}`;
    }),
  );
  return lines.join("\n");
}

export async function diagCommandHandler(
  router: Router,
  replier: Replier,
): Promise<void> {
  await replier.sendPlain(await runDiagnostics(router));
}
