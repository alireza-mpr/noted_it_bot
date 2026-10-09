import { expect } from "vitest";
import type { EventAnswer } from "../../../src/adapters/models/extraction/event-answer-schema";
import type { ModelResult } from "../../../src/adapters/models/model-result";
import { GEMINI_MODELS } from "../../../src/adapters/models/providers/model-list";
import {
  createEventFromMessage,
  type EventRequestContext,
} from "../../../src/app/create-event-from-message";
import { QUOTA_RESET_AFTER_MS } from "../../../src/domain/quota/daily-quota-rule";
import type { QuotaUsage } from "../../../src/domain/quota/quota-usage";
import type { SupportedLanguage } from "../../../src/domain/user/supported-language";
import { newUser, type User } from "../../../src/domain/user/user";
import type { IanaTimeZone } from "../../../src/generic/date-time/time-zone";
import { modelAnswerOf } from "../adapters/models/model-answer-of";
import { FakeReplier } from "./fake-replier";
import { FakeRouter } from "./fake-router";
import { InMemoryUserRepository } from "./in-memory-user-repository";

const DAILY_QUOTA = 5;
const WAIT_MS = (2 * 60 + 5) * 60_000;

export const USER_ID = 42;
export const ALICE = { username: "alice", firstName: "Alice", lastName: null, telegramLanguageCode: "en" };

// Represents how a test runs a message: what the model answers, the user's
// quota, language and time zone, and now.
export interface TestSetup {
  modelResult?: ModelResult;
  // null means the daily quota is off.
  remainingQuota?: number | null;
  isDailyQuotaShown?: boolean;
  language?: SupportedLanguage;
  userTimeZone?: IanaTimeZone | null;
  now?: Date;
}

// Runs one message through the use case, and returns what it sent and used.
export async function sendMessage(messageText: string | null, testSetup: TestSetup = {}) {
  const now = testSetup.now ?? new Date("2026-09-28T02:00:00Z");
  const remainingQuota = testSetup.remainingQuota === undefined ? DAILY_QUOTA : testSetup.remainingQuota;
  const storedUser: User = {
    ...newUser(USER_ID, ALICE),
    settings: { language: null, timeZone: testSetup.userTimeZone ?? null },
    quotaUsage: quotaUsageWith(remainingQuota ?? DAILY_QUOTA, now),
    version: 1,
  };
  const fakeRouter = new FakeRouter(testSetup.modelResult ?? { ...modelAnswerOf(GEMINI_MODELS[0]), text: answerWith() });
  const fakeReplier = new FakeReplier();
  const userRepository = new InMemoryUserRepository([storedUser]);
  const eventRequestContext: EventRequestContext = {
    router: fakeRouter,
    userRepository,
    dailyQuota: remainingQuota === null ? { kind: "off" } : { kind: "limited", unitsPerDay: DAILY_QUOTA },
    isDailyQuotaShown: testSetup.isDailyQuotaShown ?? true,
    replier: fakeReplier,
    language: testSetup.language ?? "en",
    now,
  };
  await createEventFromMessage({ user: storedUser, messageText }, eventRequestContext);
  return { fakeRouter, fakeReplier, userRepository, storedQuotaUsage: () => userRepository.storedUsers.get(USER_ID)?.quotaUsage };
}

// Returns the calendar file and caption sent for a model answer.
export async function sentCalendarFileOf(answerText: string, testSetup: TestSetup = {}) {
  const { fakeReplier } = await sendMessage("text", {
    modelResult: { ...modelAnswerOf(GEMINI_MODELS[0]), text: answerText },
    ...testSetup,
  });
  expect(fakeReplier.calendarFiles).toHaveLength(1);
  const { calendarFile, htmlCaption } = fakeReplier.calendarFiles[0];
  return { icsContent: calendarFile.content, htmlCaption };
}

// Returns a model answer for a 20:00 one-off event on 23 Sep 2030, with no
// time zone, by default.
export function answerWith(overrides: Partial<EventAnswer> = {}): string {
  return JSON.stringify({
    title: "Event",
    calendar: "gregorian",
    date_kind: "absolute",
    year: 2030,
    month: 9,
    day: 23,
    start_time: "20:00",
    end_time: null,
    timezone_hint: null,
    location: null,
    recurrence: null,
    confidence: 0.95,
    ...overrides,
  });
}

// Returns the quota usage of a user with this many units left. A user with
// none left can try again WAIT_MS after now.
function quotaUsageWith(remainingQuota: number, now: Date): QuotaUsage {
  return remainingQuota === DAILY_QUOTA
    ? { kind: "unused" }
    : { kind: "used", remainingQuota, lastUsedAt: new Date(now.getTime() + WAIT_MS - QUOTA_RESET_AFTER_MS) };
}
