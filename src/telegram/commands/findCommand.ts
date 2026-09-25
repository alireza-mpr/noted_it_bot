import type { CommandHandler } from "../botContext";
import { diagCommand } from "./diagCommand";
import { isLangCommand, langCommand } from "./langCommand";
import { startCommand } from "./startCommand";
import { versionCommand } from "./versionCommand";

// /diag is deliberately not registered via setMyCommands, so it stays hidden from the menu.
const EXACT_COMMANDS = new Map<string, CommandHandler>([
  ["/start", startCommand],
  ["/ver", versionCommand],
  ["/diag", diagCommand],
]);

export function findCommand(text: string | undefined): CommandHandler | undefined {
  if (text === undefined) {
    return undefined;
  }
  return EXACT_COMMANDS.get(text) ?? (isLangCommand(text) ? langCommand : undefined);
}
