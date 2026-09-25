import { START_MESSAGE } from "../../lib/interactiveMessages/messages";
import type { CommandHandler } from "../botContext";

export const startCommand: CommandHandler = async ({ replier }) => {
  await replier.say(START_MESSAGE, "Noted");
};
