import diagPingPrompt from "../../../prompts/diag_ping.txt";
import type { LlmClient } from "../../lib/providers/providerClient";
import type { CommandHandler } from "../botContext";

interface DiagCheck {
  name: string;
  run: (llm: LlmClient) => Promise<string | null>;
}

const DIAG_CHECKS: DiagCheck[] = [
  {
    name: "Gemini",
    run: async (llm) => {
      const answer = await llm.generate({
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

async function runDiagnostics(llm: LlmClient): Promise<string> {
  const lines = await Promise.all(
    DIAG_CHECKS.map(async (check) => {
      const problem = await check.run(llm).catch((err) => {
        console.error(`Diag check "${check.name}" threw`, err);
        return "threw";
      });
      return `${check.name}: ${problem === null ? "OK" : `Broken (${problem})`}`;
    }),
  );
  return lines.join("\n");
}

export const diagCommand: CommandHandler = async ({ llm, replier }) => {
  await replier.sendPlain(await runDiagnostics(llm));
};
