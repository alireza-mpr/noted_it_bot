import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../../src/app/worker";
import type { Env } from "../../../src/config/env";

const TEST_DB = (env as unknown as { TEST_DB: D1Database }).TEST_DB;
const WEBHOOK_SECRET = "test-secret-value";
const WORKER_ENV: Env = {
  BOT_TOKEN: "test-bot-token",
  WEBHOOK_SECRET,
  APP_VERSION: "0.2.41-beta-1a2b3c4",
  BOT_EDITION: "english",
  GEMINI_API_KEY: "test-gemini-key",
  GROQ_API_KEY: "test-groq-key",
  // No Axiom token: the logs are not sent.
  AXIOM_TOKEN: "",
  USAGE_DB: TEST_DB,
};
const VERSION_UPDATE = {
  update_id: 1,
  message: { chat: { id: 42 }, from: { id: 42, first_name: "Alice", language_code: "en" }, text: "/ver" },
};

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

beforeEach(async () => {
  await TEST_DB.exec("DROP TABLE IF EXISTS users");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Stubs fetch for the Telegram API, and returns the texts the bot sends.
// When failsToSend is true, every call to Telegram throws.
function stubTelegram(failsToSend = false): string[] {
  const sentTexts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      if (failsToSend) {
        throw new Error("network down");
      }
      sentTexts.push(JSON.parse(init.body as string).text);
      return new Response("{}");
    }),
  );
  return sentTexts;
}

async function responseTo(request: Request, workerEnv: Env = WORKER_ENV): Promise<Response> {
  const executionContext = createExecutionContext();
  const response = await worker.fetch(request, workerEnv, executionContext);
  await waitOnExecutionContext(executionContext);
  return response;
}

function webhookRequestOf(body: string, secretToken: string | null = WEBHOOK_SECRET): Request {
  return new Request("https://bot.example/", {
    method: "POST",
    headers: secretToken === null ? {} : { "X-Telegram-Bot-Api-Secret-Token": secretToken },
    body,
  });
}

describe("worker", () => {
  it("handles a Telegram update, and answers 200", async () => {
    const sentTexts = stubTelegram();

    const response = await responseTo(webhookRequestOf(JSON.stringify(VERSION_UPDATE)));

    expect(response.status).toBe(200);
    expect(sentTexts).toEqual(["0.2.41-beta-1a2b3c4"]);
  });

  it("refuses a webhook call without the right secret with 401, and handles nothing", async () => {
    const sentTexts = stubTelegram();

    for (const secretToken of [null, "wrong-secret"]) {
      const response = await responseTo(webhookRequestOf(JSON.stringify(VERSION_UPDATE), secretToken));

      expect(response.status, String(secretToken)).toBe(401);
    }
    expect(sentTexts).toEqual([]);
  });

  it("answers 200 even when handling the update fails", async () => {
    stubTelegram(true);

    expect((await responseTo(webhookRequestOf(JSON.stringify(VERSION_UPDATE)))).status).toBe(200);
  });

  it("refuses every request with 500 when BOT_EDITION is not set up, so Telegram sends the update again later", async () => {
    const sentTexts = stubTelegram();

    for (const botEditionName of ["", "fa"]) {
      const brokenEnv = { ...WORKER_ENV, BOT_EDITION: botEditionName };

      expect((await responseTo(webhookRequestOf(JSON.stringify(VERSION_UPDATE)), brokenEnv)).status).toBe(500);
      expect((await responseTo(new Request("https://bot.example/tz?token=bad"), brokenEnv)).status).toBe(500);
    }
    expect(sentTexts).toEqual([]);
  });

  it("puts the edition on every log event of any request, e.g. the /tz page", async () => {
    let axiomEvents: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.includes("axiom")) {
          axiomEvents = JSON.parse(init.body as string);
        }
        return new Response("{}");
      }),
    );

    await responseTo(new Request("https://bot.example/tz?token=bad"), {
      ...WORKER_ENV,
      BOT_EDITION: "persian",
      AXIOM_TOKEN: "test-token",
    });

    expect(axiomEvents.length).toBeGreaterThan(0);
    for (const axiomEvent of axiomEvents) {
      expect(axiomEvent["bot.edition"]).toBe("persian");
    }
  });

  it("answers 200 to an update it cannot read", async () => {
    const sentTexts = stubTelegram();

    expect((await responseTo(webhookRequestOf("not json"))).status).toBe(200);
    expect(sentTexts).toEqual([]);
  });

  it("serves the time zone page routes", async () => {
    stubTelegram();

    const pageResponse = await responseTo(new Request("https://bot.example/tz?token=bad"));
    const saveResponse = await responseTo(
      new Request("https://bot.example/tz/save", { method: "POST", body: "not json" }),
    );

    expect(pageResponse.status).toBe(403);
    expect(pageResponse.headers.get("Content-Type")).toContain("text/html");
    expect(saveResponse.status).toBe(400);
  });

  it("answers OK to any other request", async () => {
    const response = await responseTo(new Request("https://bot.example/"));

    expect([response.status, await response.text()]).toEqual([200, "OK"]);
  });
});
