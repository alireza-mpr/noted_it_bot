import { describe, expect, it } from "vitest";
import { isFromTelegram } from "../../../../src/adapters/telegram/webhook-auth";

const WEBHOOK_SECRET = "test-webhook-secret";

function webhookRequest(headers: Record<string, string>): Request {
  return new Request("https://bot.example/", { method: "POST", headers, body: "{}" });
}

describe("isFromTelegram", () => {
  it("accepts a request with the webhook secret", () => {
    expect(isFromTelegram(webhookRequest({ "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET }), WEBHOOK_SECRET)).toBe(true);
  });

  it("refuses a request with a wrong secret, even one of the same length", () => {
    expect(isFromTelegram(webhookRequest({ "X-Telegram-Bot-Api-Secret-Token": "wrong" }), WEBHOOK_SECRET)).toBe(false);
    expect(isFromTelegram(webhookRequest({ "X-Telegram-Bot-Api-Secret-Token": "test-webhook-secreT" }), WEBHOOK_SECRET)).toBe(
      false,
    );
  });

  it("refuses a request with no secret", () => {
    expect(isFromTelegram(webhookRequest({}), WEBHOOK_SECRET)).toBe(false);
  });
});
