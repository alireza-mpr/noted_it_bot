import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1UserSettingsStore } from "../../../../src/adapters/database/d1-user-settings-store";
import { timeZoneNamed } from "../../../../src/generic/date-time/time-zone";

const TEST_DB = (env as unknown as { TEST_DB: D1Database }).TEST_DB;
const USER_ID = 42;

describe("D1UserSettingsStore", () => {
  let userSettingsStore: D1UserSettingsStore;

  beforeEach(async () => {
    await TEST_DB.exec("DROP TABLE IF EXISTS user_preference");
    userSettingsStore = new D1UserSettingsStore(TEST_DB);
  });

  it("gives a user who chose nothing null for each setting", async () => {
    expect(await userSettingsStore.read(USER_ID)).toEqual({ language: null, timeZone: null });
  });

  it("keeps the language and the time zone apart", async () => {
    await userSettingsStore.setLanguage(USER_ID, "fa");
    await userSettingsStore.setTimeZone(USER_ID, timeZoneNamed("Asia/Tehran"));

    expect(await userSettingsStore.read(USER_ID)).toEqual({ language: "fa", timeZone: "Asia/Tehran" });
  });

  it("resets the language to Telegram's, and keeps the time zone", async () => {
    await userSettingsStore.setTimeZone(USER_ID, timeZoneNamed("Asia/Tehran"));
    await userSettingsStore.setLanguage(USER_ID, "fa");
    await userSettingsStore.setLanguage(USER_ID, null);

    expect(await userSettingsStore.read(USER_ID)).toEqual({ language: null, timeZone: "Asia/Tehran" });
  });

  it("reads a stored name that is not a time zone as no time zone", async () => {
    await userSettingsStore.read(USER_ID);
    await TEST_DB.prepare("INSERT INTO user_preference (userId, lang, timezone) VALUES (?, NULL, 'Mars/Olympus')")
      .bind(USER_ID)
      .run();

    expect(await userSettingsStore.read(USER_ID)).toEqual({ language: null, timeZone: null });
  });
});
