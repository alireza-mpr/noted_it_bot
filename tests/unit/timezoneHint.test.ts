import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Router } from "../../src/router/router";
import { isTzCommand } from "../../src/telegram/commands/tzCommandHandler";
import { canonicalTimezone, resolveTimezoneFromHint } from "../../src/time/timezoneHint";

function routerReplying(text: string) {
  const generate = vi.fn(async (_request: unknown) => ({ result: "ok", model: "m", text, totalTokens: 1 }));
  return { router: { generate } as unknown as Router, generate };
}

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

describe("canonicalTimezone", () => {
  it("accepts IANA names and normalises their case", () => {
    expect(canonicalTimezone("Australia/Melbourne")).toBe("Australia/Melbourne");
    expect(canonicalTimezone("asia/tehran")).toBe("Asia/Tehran");
    expect(canonicalTimezone("America/Argentina/Buenos_Aires")).not.toBeNull();
    expect(canonicalTimezone("  Europe/Paris ")).toBe("Europe/Paris");
    expect(canonicalTimezone("utc")).toBe("UTC");
  });

  it("rejects places, invented zones and legacy abbreviations", () => {
    for (const bad of ["Melbourne", "Iran", "Mars/Olympus", "EST", "PST8PDT", "Asia/", "/Tehran", "", "Asia/Tehran; DROP"]) {
      expect(canonicalTimezone(bad), bad).toBeNull();
    }
  });
});

describe("resolveTimezoneFromHint", () => {
  it("returns an exact zone name without calling a model", async () => {
    const { router, generate } = routerReplying("unused");
    expect(await resolveTimezoneFromHint(router, "asia/tehran")).toBe("Asia/Tehran");
    expect(generate).not.toHaveBeenCalled();
  });

  it("asks the model for a city or country and validates the answer", async () => {
    const { router, generate } = routerReplying("Australia/Melbourne");
    expect(await resolveTimezoneFromHint(router, "Melbourne")).toBe("Australia/Melbourne");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toMatchObject({ userPrompt: "Melbourne", temperature: 0 });
  });

  it("tolerates quotes, a trailing full stop and surrounding whitespace in the reply", async () => {
    expect(await resolveTimezoneFromHint(routerReplying('  "Asia/Tehran".\n').router, "Iran")).toBe("Asia/Tehran");
  });

  it("returns null when the model says UNKNOWN", async () => {
    expect(await resolveTimezoneFromHint(routerReplying("UNKNOWN").router, "Atlantis")).toBeNull();
  });

  it("never stores a zone the model invented or a sentence instead of a name", async () => {
    expect(await resolveTimezoneFromHint(routerReplying("Mars/Olympus").router, "Mars")).toBeNull();
    expect(await resolveTimezoneFromHint(routerReplying("I think it is Asia/Tehran").router, "Iran")).toBeNull();
    expect(await resolveTimezoneFromHint(routerReplying("EST").router, "New York")).toBeNull();
  });

  it("returns null when every model fails or the router throws", async () => {
    const failing = { generate: async () => ({ result: "failed", failure: { kind: "rateLimited", detail: "q" } }) } as unknown as Router;
    const throwing = { generate: async () => { throw new Error("boom"); } } as unknown as Router;
    expect(await resolveTimezoneFromHint(failing, "Melbourne")).toBeNull();
    expect(await resolveTimezoneFromHint(throwing, "Melbourne")).toBeNull();
  });
});

describe("isTzCommand", () => {
  it("matches /tz with or without an argument, and the @bot form", () => {
    for (const text of ["/tz", "/tz Melbourne", "/tz   Iran", "/tz@noted_it_bot Paris", "/tz\nTokyo"]) {
      expect(isTzCommand(text), text).toBe(true);
    }
  });

  it("does not match other text or commands", () => {
    for (const text of ["/tzx", "/timezone", "/lang fa", "tz Melbourne", "hello /tz", "", undefined]) {
      expect(isTzCommand(text), String(text)).toBe(false);
    }
  });
});
