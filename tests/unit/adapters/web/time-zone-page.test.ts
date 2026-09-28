import { describe, expect, it } from "vitest";
import {
  messagePageOf,
  newNonce,
  pageHeadersOf,
  timeZonePageOf,
} from "../../../../src/adapters/web/time-zone-page";
import { translate } from "../../../../src/i18n/translation";

const NONCE = "test-nonce";

// Returns the config the page's script reads.
function pageConfigOf(pageHtml: string) {
  const configMatch = /<script type="application\/json" id="cfg">(.*?)<\/script>/s.exec(pageHtml);
  if (configMatch === null) {
    throw new Error("the page has no config");
  }
  return JSON.parse(configMatch[1]);
}

describe("pageHeadersOf", () => {
  it("serves HTML that is never cached and sends no referrer", () => {
    const pageHeaders = pageHeadersOf(NONCE);

    expect(pageHeaders["Content-Type"]).toContain("text/html");
    expect(pageHeaders["Cache-Control"]).toBe("no-store");
    expect(pageHeaders["Referrer-Policy"]).toBe("no-referrer");
  });

  it("sets a strict Content Security Policy: only the nonce's script and style, and calls to this Worker", () => {
    const contentSecurityPolicy = pageHeadersOf(NONCE)["Content-Security-Policy"];

    expect(contentSecurityPolicy).toContain("default-src 'none'");
    expect(contentSecurityPolicy).toContain(`script-src 'nonce-${NONCE}'`);
    expect(contentSecurityPolicy).toContain(`style-src 'nonce-${NONCE}'`);
    expect(contentSecurityPolicy).toContain("connect-src 'self'");
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
  });
});

describe("newNonce", () => {
  it("is different for every response", () => {
    const nonces = new Set(Array.from({ length: 5 }, () => newNonce()));
    expect(nonces.size).toBe(5);
  });
});

describe("timeZonePageOf", () => {
  it("gives the page's script the save token, the cities and the texts", () => {
    const pageConfig = pageConfigOf(timeZonePageOf("fa", "save-token", NONCE));

    expect(pageConfig.token).toBe("save-token");
    expect(pageConfig.lang).toBe("fa");
    expect(pageConfig.cities.Washington).toBe("America/New_York");
    expect(pageConfig.strings.save).toBe(translate("PAGE_SAVE", "fa"));
  });

  it("puts the nonce on its only script and style, with no inline event handlers", () => {
    const pageHtml = timeZonePageOf("en", "save-token", NONCE);

    expect(pageHtml).toContain(`<script nonce="${NONCE}">`);
    expect(pageHtml).toContain(`<style nonce="${NONCE}">`);
    expect(pageHtml).not.toMatch(/\son(click|load|error)=/i);
    expect(pageHtml).not.toContain("innerHTML");
  });

  it("speaks the language, and is right-to-left for Persian and Arabic", () => {
    for (const [language, textDirection] of [["fa", "rtl"], ["ar", "rtl"], ["de", "ltr"], ["en", "ltr"]] as const) {
      const pageHtml = timeZonePageOf(language, "save-token", NONCE);
      expect(pageHtml).toContain(`<html lang="${language}" dir="${textDirection}">`);
      expect(pageHtml).toContain(`<title>${translate("PAGE_TITLE", language)}</title>`);
    }
  });

  it("never lets a value close the script tag", () => {
    const pageHtml = timeZonePageOf("en", "</script><script>alert(1)</script>", NONCE);

    expect(pageHtml).not.toContain("<script>alert(1)");
    expect(pageConfigOf(pageHtml).token).toBe("</script><script>alert(1)</script>");
  });
});

describe("messagePageOf", () => {
  it("shows the message in the language, with the page's nonce on its style", () => {
    const pageHtml = messagePageOf("fa", translate("PAGE_EXPIRED", "fa"), NONCE);

    expect(pageHtml).toContain('<html lang="fa" dir="rtl">');
    expect(pageHtml).toContain(translate("PAGE_EXPIRED", "fa"));
    expect(pageHtml).toContain(`<style nonce="${NONCE}">`);
  });

  it("escapes HTML in the message", () => {
    expect(messagePageOf("en", "<b>hi</b>", NONCE)).toContain("&lt;b&gt;hi&lt;/b&gt;");
  });
});
