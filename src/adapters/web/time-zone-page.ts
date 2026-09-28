import { toBase64Url } from "../../generic/encoding/base64-url";
import { escapeHtml } from "../../generic/html/escape-html";
import type { BotMessageId } from "../../i18n/bot-message";
import type { SupportedLanguage } from "../../domain/user/supported-language";
import { translate } from "../../i18n/translation";
import { TIME_ZONE_CITIES } from "./time-zone-cities";
import TIME_ZONE_PAGE_CSS from "./time-zone-page.css";
import TIME_ZONE_PAGE_HTML from "./time-zone-page.html";

const RIGHT_TO_LEFT_LANGUAGES: ReadonlySet<SupportedLanguage> = new Set(["fa", "ar"]);
const NONCE_BYTE_COUNT = 16;
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

// Returns the headers of every page: HTML, never cached, and a strict Content
// Security Policy. Only the page's own script and style, which carry the
// nonce, may run, and the page may only call this Worker.
export function pageHeadersOf(nonce: string): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
  };
}

// Returns a new random nonce, for one response.
export function newNonce(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(NONCE_BYTE_COUNT)));
}

// Returns the time zone page in the language. The save token lets the page
// save the time zone.
export function timeZonePageOf(
  language: SupportedLanguage,
  saveToken: string,
  nonce: string,
): string {
  const translated = (botMessageId: BotMessageId) => translate(botMessageId, language);
  const pageConfig = {
    token: saveToken,
    lang: language,
    cities: TIME_ZONE_CITIES,
    strings: {
      title: translated("PAGE_TITLE"),
      detected: translated("PAGE_DETECTED"),
      localTime: translated("PAGE_LOCAL_TIME"),
      confirm: translated("PAGE_CONFIRM"),
      choose: translated("PAGE_CHOOSE"),
      search: translated("PAGE_SEARCH"),
      save: translated("PAGE_SAVE"),
      saved: translated("PAGE_SAVED"),
      expired: translated("PAGE_EXPIRED"),
      error: translated("PAGE_ERROR"),
    },
  };
  return fillNamedPlaceholders(TIME_ZONE_PAGE_HTML.trimEnd(), {
    lang: language,
    dir: textDirectionOf(language),
    title: escapeHtml(translated("PAGE_TITLE")),
    nonce,
    style: TIME_ZONE_PAGE_CSS,
    config: jsonForScript(pageConfig),
  });
}

// Returns a page with one message in the language, e.g. that the link has
// expired.
export function messagePageOf(
  language: SupportedLanguage,
  message: string,
  nonce: string,
): string {
  const title = escapeHtml(translate("PAGE_TITLE", language));
  return `<!doctype html>
<html lang="${language}" dir="${textDirectionOf(language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
<style nonce="${nonce}">${TIME_ZONE_PAGE_CSS}</style>
</head>
<body><main><h1>${title}</h1><p id="status">${escapeHtml(message)}</p></main></body>
</html>`;
}

function textDirectionOf(language: SupportedLanguage): "rtl" | "ltr" {
  return RIGHT_TO_LEFT_LANGUAGES.has(language) ? "rtl" : "ltr";
}

// Returns the template with each {{name}} filled, in one pass, so an inserted
// value is never searched for placeholders again.
function fillNamedPlaceholders(
  template: string,
  valueByName: Record<string, string>,
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_placeholder, name: string) => valueByName[name] ?? "",
  );
}

// Returns the value as JSON that is safe inside an HTML <script> tag: it can
// never close the tag or start HTML.
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .split(LINE_SEPARATOR)
    .join("\\u2028")
    .split(PARAGRAPH_SEPARATOR)
    .join("\\u2029");
}
