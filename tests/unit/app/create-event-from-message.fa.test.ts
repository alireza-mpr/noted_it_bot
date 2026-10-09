import { beforeAll, describe, expect, it, vi } from "vitest";
import { GEMINI_MODELS } from "../../../src/adapters/models/providers/model-list";
import type { BotMessageId } from "../../../src/i18n/bot-message";
import { translate } from "../../../src/i18n/translation";
import { modelAnswerOf } from "../adapters/models/model-answer-of";
import { sendMessage, sentCalendarFileOf } from "./send-message";

// "Game night, Saturday 26 September, 6 to 9:30pm", as a user forwarded it.
const GAME_NIGHT_MESSAGE =
  "🎲 گیم‌نایت شنبه ۲۶ سپتامبر\n\n در\n Notting Hill Neighbourhood House \n\n🕕 ساعت ۶:۰۰ تا ۹:۳۰ شب";
// The model's answer to it, exactly as a model returned it.
const GAME_NIGHT_ANSWER =
  '{"title":"گیم‌نایت","calendar":"Gregorian","date_kind":"absolute","year":null,"month":9,"day":26,"start_time":"18:00","end_time":"21:30","timezone_hint":null,"location":"Notting Hill Neighbourhood House","recurrence":null,"confidence":1}';

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

describe("the game night message, forwarded on 27 September 2026", () => {
  const farsiSetup = { language: "fa" as const, now: new Date("2026-09-27T02:00:00Z") };
  const fa = (botMessageId: BotMessageId) => translate(botMessageId, "fa");

  it("is 26 Sep 2026, not 2027, at the written floating 18:00, and says it has passed", async () => {
    const { icsContent, htmlCaption } = await sentCalendarFileOf(GAME_NIGHT_ANSWER, farsiSetup);

    // No time zone in the message and none set with /tz: floating 18:00, which
    // a Melbourne calendar shows as 18:00 on the 26th.
    expect(icsContent).toContain("DTSTART:20260926T180000");
    expect(icsContent).toContain("DTEND:20260926T213000");
    expect(htmlCaption).toContain(fa("PAST_EVENT_NOTE"));
    expect(htmlCaption).toContain(fa("TZ_FLOATING_NOTE"));
    expect(htmlCaption).not.toContain("🤔 ");
  });

  it("with the written weekday (SA): the same date, and no wrong weekday note", async () => {
    const withWeekday = GAME_NIGHT_ANSWER.replace('"day":26,', '"day":26,"weekday":"SA",');
    const { icsContent, htmlCaption } = await sentCalendarFileOf(withWeekday, farsiSetup);

    expect(icsContent).toContain("DTSTART:20260926T180000");
    expect(htmlCaption).not.toContain("🤔 ");
  });

  it("a week before, it is a future event with no past date note", async () => {
    const { htmlCaption } = await sentCalendarFileOf(GAME_NIGHT_ANSWER, { ...farsiSetup, now: new Date("2026-09-19T02:00:00Z") });

    expect(htmlCaption).not.toContain(fa("PAST_EVENT_NOTE"));
  });

  it("sends the message itself to the model", async () => {
    const { fakeRouter } = await sendMessage(GAME_NIGHT_MESSAGE, {
      modelResult: { ...modelAnswerOf(GEMINI_MODELS[0]), text: GAME_NIGHT_ANSWER },
    });

    expect(fakeRouter.modelRequests[0].userPrompt).toBe(GAME_NIGHT_MESSAGE);
  });
});
