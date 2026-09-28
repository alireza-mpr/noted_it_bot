import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { LogEvent } from "../../../src/adapters/logging/log-event";
import type { ModelRequest, ModelResult } from "../../../src/adapters/models/model-result";
import { GEMINI_MODELS } from "../../../src/adapters/models/providers/model-list";
import type { LinkButton, TelegramSendResult } from "../../../src/adapters/telegram/telegram-client";
import type { TelegramUpdate } from "../../../src/adapters/telegram/telegram-update";
import { handleUpdate, type UpdateContext } from "../../../src/app/handle-update";
import type { SupportedLanguage } from "../../../src/domain/user/supported-language";
import { newUser, type User } from "../../../src/domain/user/user";
import { TRANSLATIONS } from "../../../src/i18n/translation";
import { axiomEventsOf } from "../adapters/logging/axiom-events-of";
import { modelAnswerOf } from "../adapters/models/model-answer-of";
import { InMemoryUserRepository } from "./in-memory-user-repository";

const USER_ID = 42;
const CHAT_ID = 42;
const NOW = new Date("2026-09-28T02:00:00Z");
// Alice's Telegram app is in Persian.
const ALICE = { username: "alice", firstName: "Alice", lastName: "Smith", telegramLanguageCode: "fa" };

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Represents a Telegram client that keeps what it sends. sendMessage can be
// made to throw, e.g. when the network fails.
class FakeTelegramClient {
  readonly sentTexts: string[] = [];
  readonly linkButtons: LinkButton[] = [];
  readonly sentFileNames: string[] = [];
  failsToSend = false;

  async sendMessage(_chatId: number, text: string, linkButton: LinkButton | null): Promise<TelegramSendResult> {
    if (this.failsToSend) {
      throw new Error("network down");
    }
    this.sentTexts.push(text);
    if (linkButton !== null) {
      this.linkButtons.push(linkButton);
    }
    return { ok: true };
  }

  async sendDocument(_chatId: number, documentFile: { fileName: string }): Promise<TelegramSendResult> {
    this.sentFileNames.push(documentFile.fileName);
    return { ok: true };
  }
}

interface TestSetup {
  storedUsers?: User[];
  modelResult?: ModelResult;
  userLoadFails?: boolean;
  sendFails?: boolean;
}

// Handles one update, and returns what was sent, stored, asked and logged.
async function sendUpdate(telegramUpdate: TelegramUpdate, testSetup: TestSetup = {}) {
  const userRepository = new InMemoryUserRepository(testSetup.storedUsers ?? []);
  if (testSetup.userLoadFails) {
    userRepository.load = async () => {
      throw new Error("D1 is down");
    };
  }
  const fakeTelegramClient = new FakeTelegramClient();
  fakeTelegramClient.failsToSend = testSetup.sendFails ?? false;
  const modelRequests: ModelRequest[] = [];
  const updateContext: UpdateContext = {
    router: {
      ask: async (modelRequest: ModelRequest) => {
        modelRequests.push(modelRequest);
        return testSetup.modelResult ?? { ...modelAnswerOf(GEMINI_MODELS[0]), text: "PONG" };
      },
    },
    userRepository,
    telegramClient: fakeTelegramClient,
    dailyQuota: { kind: "limited", unitsPerDay: 5 },
    isDailyQuotaShown: true,
    appVersion: "0.2.41-beta-1a2b3c4",
    webhookSecret: "test-secret-value",
    workerOrigin: "https://bot.example",
    now: NOW,
  };
  const logEvents = await axiomEventsOf(() => handleUpdate(telegramUpdate, updateContext));
  return { fakeTelegramClient, userRepository, modelRequests, logEvents };
}

function messageUpdateOf(text: string | null): TelegramUpdate {
  return { kind: "message", message: { chatId: CHAT_ID, sender: { userId: USER_ID, userProfile: ALICE }, text } };
}

// Returns Alice as stored, with the language she chose.
function storedAliceWith(chosenLanguage: SupportedLanguage | null): User {
  const alice = newUser(USER_ID, ALICE);
  return { ...alice, settings: { ...alice.settings, language: chosenLanguage }, version: 1 };
}

function eventNamed(logEvents: LogEvent[], eventName: string): LogEvent | undefined {
  return logEvents.find((logEvent) => logEvent.eventName === eventName);
}

describe("handleUpdate: a message", () => {
  it("creates the user on first contact, and answers /start in the Telegram language", async () => {
    const { fakeTelegramClient, userRepository } = await sendUpdate(messageUpdateOf("/start"));

    expect(userRepository.storedUsers.get(USER_ID)).toMatchObject({ profile: ALICE, version: 1 });
    expect(fakeTelegramClient.sentTexts).toHaveLength(1);
    expect(fakeTelegramClient.sentTexts[0]).toMatch(/^سلام Alice! 👋 من ربات Noted هستم/);
  });

  it("puts the user, the chat and how the reply language was chosen on every event", async () => {
    const { logEvents } = await sendUpdate(messageUpdateOf("/start"));

    expect(eventNamed(logEvents, "user_activity.bot_started")).toMatchObject({
      "user.id": USER_ID,
      "user.name": "alice",
      "user.full_name": "Alice Smith",
      "telegram.chat.id": CHAT_ID,
      "telegram.user_language_code": "fa",
      "telegram.reply_language": "fa",
      "telegram.reply_language_source": "telegram",
    });
  });

  it("replies in the language the user chose", async () => {
    const { fakeTelegramClient, logEvents } = await sendUpdate(messageUpdateOf("/start"), {
      storedUsers: [storedAliceWith("de")],
    });

    expect(fakeTelegramClient.sentTexts[0]).toMatch(/^Hallo Alice! 👋 Ich bin Noted/);
    expect(eventNamed(logEvents, "user_activity.bot_started")).toMatchObject({
      "telegram.reply_language": "de",
      "telegram.reply_language_source": "user_choice",
    });
  });

  it("runs each command", async () => {
    expect((await sendUpdate(messageUpdateOf("/help"))).fakeTelegramClient.sentTexts[0]).toMatch(/^این‌طوری کار می‌کنم 👇/);
    expect((await sendUpdate(messageUpdateOf("/ver"))).fakeTelegramClient.sentTexts).toEqual(["0.2.41-beta-1a2b3c4"]);
    expect((await sendUpdate(messageUpdateOf("/diag"))).fakeTelegramClient.sentTexts).toEqual(["Models: OK"]);
    expect((await sendUpdate(messageUpdateOf("/lang@noted_it_bot de"))).userRepository.storedUsers.get(USER_ID)?.settings.language).toBe("de");
    expect((await sendUpdate(messageUpdateOf("/tz"))).fakeTelegramClient.linkButtons).toHaveLength(1);
  });

  it("gives an unknown command no reply, and logs it with the text after it", async () => {
    const { fakeTelegramClient, modelRequests, logEvents } = await sendUpdate(messageUpdateOf("/settings dark mode"));

    expect(fakeTelegramClient.sentTexts).toEqual([]);
    expect(modelRequests).toEqual([]);
    expect(eventNamed(logEvents, "user_activity.unknown_command_sent")).toMatchObject({
      "user_activity.command": "settings",
      "user_activity.command_text": "dark mode",
    });
  });

  it("sends any other text to the models, to create an event", async () => {
    const { modelRequests, logEvents } = await sendUpdate(messageUpdateOf("Game night, 26 Sep 2030, 6pm"));

    expect(modelRequests.map((modelRequest) => modelRequest.userPrompt)).toEqual(["Game night, 26 Sep 2030, 6pm"]);
    expect(eventNamed(logEvents, "user_activity.event_requested")).toBeDefined();
  });

  it("logs the command and how long the update took", async () => {
    const { logEvents } = await sendUpdate(messageUpdateOf("/ver"));

    expect(eventNamed(logEvents, "telegram.update_handled")).toMatchObject({
      "telegram.command": "ver",
      "telegram.duration_ms": expect.any(Number),
    });
  });

  it("replies with the general error in the Telegram language when the user cannot be loaded", async () => {
    const { fakeTelegramClient, logEvents } = await sendUpdate(messageUpdateOf("/ver"), { userLoadFails: true });

    expect(fakeTelegramClient.sentTexts).toEqual([TRANSLATIONS.fa.GENERIC_ERROR_MESSAGE]);
    expect(eventNamed(logEvents, "telegram.update_failed")).toMatchObject({ "exception.message": "D1 is down" });
  });

  it("does not throw when the general error cannot be sent either", async () => {
    const { logEvents } = await sendUpdate(messageUpdateOf("/ver"), { sendFails: true });

    expect(logEvents.map((logEvent) => logEvent.eventName)).toEqual([
      "user_activity.version_requested",
      "telegram.update_failed",
      "telegram.error_reply_failed",
      "telegram.update_handled",
    ]);
  });
});

describe("handleUpdate: other updates", () => {
  it("logs a block, with the user, and touches no user", async () => {
    const { userRepository, logEvents } = await sendUpdate({
      kind: "bot-blocked",
      chatId: CHAT_ID,
      sender: { userId: USER_ID, userProfile: ALICE },
    });

    expect(logEvents).toEqual([
      expect.objectContaining({ eventName: "user_activity.bot_blocked", "user_activity.via": "membership", "user.id": USER_ID }),
    ]);
    expect([userRepository.loadCount, userRepository.saveCount]).toEqual([0, 0]);
  });

  it("logs an unblock, with a null username when the user has none", async () => {
    const { logEvents } = await sendUpdate({
      kind: "bot-unblocked",
      chatId: CHAT_ID,
      sender: { userId: USER_ID, userProfile: { ...ALICE, username: null } },
    });

    expect(logEvents).toEqual([
      expect.objectContaining({ eventName: "user_activity.bot_unblocked", "user.id": USER_ID, "user.name": null }),
    ]);
  });

  it("logs an update the bot does not use, with the reason", async () => {
    const { logEvents } = await sendUpdate({ kind: "ignored", reason: "an update the bot does not use: edited_message" });

    expect(logEvents).toEqual([
      expect.objectContaining({
        eventName: "telegram.update_ignored",
        "telegram.ignore_reason": "an update the bot does not use: edited_message",
      }),
    ]);
  });
});
