import { START_MESSAGE } from "../../lib/interactiveMessages/messages";
import type { Replier } from "../replier";

export async function startCommandHandler(replier: Replier): Promise<void> {
  await replier.say(START_MESSAGE, "Noted");
}
