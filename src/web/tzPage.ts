import type { MessageId } from "../interactiveMessages/messages";
import { translateStatic } from "../translation/translate";
import TZ_PAGE_CSS from "./tzPage.css";
import TZ_PAGE_HTML from "./tzPage.html";
import { TZ_CITIES } from "./tzCities";

const RTL_LANGUAGES = new Set(["fa", "ar"]);

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Fills {{name}} placeholders in one pass, so inserted text is never scanned
// for placeholders itself.
function fillTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, name: string) => values[name] ?? "",
  );
}

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

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

export function pageSecurityHeaders(nonce: string): Record<string, string> {
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

export interface TzPageInput {
  lang: string;
  saveToken: string;
  nonce: string;
}

export function renderTzPage({ lang, saveToken, nonce }: TzPageInput): string {
  const t = (id: MessageId) => translateStatic(id, lang);
  const config = {
    token: saveToken,
    lang,
    cities: TZ_CITIES,
    strings: {
      title: t("PAGE_TITLE"),
      detected: t("PAGE_DETECTED"),
      localTime: t("PAGE_LOCAL_TIME"),
      confirm: t("PAGE_CONFIRM"),
      choose: t("PAGE_CHOOSE"),
      search: t("PAGE_SEARCH"),
      save: t("PAGE_SAVE"),
      saved: t("PAGE_SAVED"),
      expired: t("PAGE_EXPIRED"),
      error: t("PAGE_ERROR"),
    },
  };
  const dir = RTL_LANGUAGES.has(lang) ? "rtl" : "ltr";

  return fillTemplate(TZ_PAGE_HTML.trimEnd(), {
    lang: escapeHtml(lang),
    dir,
    title: escapeHtml(t("PAGE_TITLE")),
    nonce,
    style: TZ_PAGE_CSS,
    config: jsonForScript(config),
  });
}

export function renderMessagePage(
  lang: string,
  message: string,
  nonce: string,
): string {
  return `<!doctype html>
<html lang="${escapeHtml(lang)}" dir="${RTL_LANGUAGES.has(lang) ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(translateStatic("PAGE_TITLE", lang))}</title>
<style nonce="${nonce}">${TZ_PAGE_CSS}</style>
</head>
<body><main><h1>${escapeHtml(translateStatic("PAGE_TITLE", lang))}</h1><p id="status">${escapeHtml(message)}</p></main></body>
</html>`;
}
