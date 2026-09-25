import type { Env } from "../../env";
import type { Replier } from "../replier";

export async function versionCommandHandler(
  env: Env,
  replier: Replier,
): Promise<void> {
  await replier.sendPlain(env.APP_VERSION);
}
