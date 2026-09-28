// Matches a text that starts with "/": the command word, and the text after
// it.
const BOT_COMMAND = /^\/(\S*)\s*([\s\S]*)$/;

// Represents a command a user sends the bot, e.g. "/lang fa": its name in
// lower case, and the text after it, or null when there is none.
export interface BotCommand {
  name: string;
  argumentText: string | null;
}

// Returns the bot command in the text, or null if the text does not start
// with "/". The bot's name after the command is dropped, e.g.
// "/lang@noted_it_bot fa" gives { name: "lang", argumentText: "fa" }.
export function parseBotCommand(text: string): BotCommand | null {
  const botCommandMatch = BOT_COMMAND.exec(text);
  if (botCommandMatch === null) {
    return null;
  }
  const [, commandWord, argumentText] = botCommandMatch;
  const trimmedArgumentText = argumentText.trim();
  return {
    name: commandWord.split("@")[0].toLowerCase(),
    argumentText: trimmedArgumentText === "" ? null : trimmedArgumentText,
  };
}
