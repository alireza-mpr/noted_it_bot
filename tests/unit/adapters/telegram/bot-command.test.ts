import { describe, expect, it } from "vitest";
import { parseBotCommand } from "../../../../src/adapters/telegram/bot-command";

describe("parseBotCommand", () => {
  it("reads the command's name and the text after it", () => {
    expect(parseBotCommand("/tz")).toEqual({ name: "tz", argumentText: null });
    expect(parseBotCommand("/tz Melbourne")).toEqual({ name: "tz", argumentText: "Melbourne" });
    expect(parseBotCommand("/tz   Japan  ")).toEqual({ name: "tz", argumentText: "Japan" });
    expect(parseBotCommand("/tz\nTokyo")).toEqual({ name: "tz", argumentText: "Tokyo" });
    expect(parseBotCommand("/start abc123")).toEqual({ name: "start", argumentText: "abc123" });
  });

  it("drops the bot's name, and reads the name in lower case", () => {
    expect(parseBotCommand("/tz@noted_it_bot Paris")).toEqual({ name: "tz", argumentText: "Paris" });
    expect(parseBotCommand("/LANG fa")).toEqual({ name: "lang", argumentText: "fa" });
  });

  it("reads any other text that starts with / as a command, e.g. an unknown one", () => {
    expect(parseBotCommand("/tzx")).toEqual({ name: "tzx", argumentText: null });
    expect(parseBotCommand("/help")).toEqual({ name: "help", argumentText: null });
    expect(parseBotCommand("/")).toEqual({ name: "", argumentText: null });
  });

  it("gives null for text that does not start with /", () => {
    for (const text of ["tz Melbourne", "hello /tz", "", " /start"]) {
      expect(parseBotCommand(text), text).toBeNull();
    }
  });
});
