import {
  PAGE_CHOOSE,
  PAGE_CONFIRM,
  PAGE_DETECTED,
  PAGE_ERROR,
  PAGE_EXPIRED,
  PAGE_LOCAL_TIME,
  PAGE_SAVE,
  PAGE_SAVED,
  PAGE_SEARCH,
  PAGE_TITLE,
} from "../interactiveMessages/messages";
import { translateStatic } from "../translation/translate";

const RTL_LANGUAGES = new Set(["fa", "ar"]);

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

const STYLE = `
:root { color-scheme: light dark; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
body { margin: 0; padding: 1.25rem; line-height: 1.5; }
main { max-width: 28rem; margin: 0 auto; }
h1 { font-size: 1.4rem; margin: 0 0 1rem; }
.zone { font-size: 1.2rem; font-weight: 600; margin: 0.25rem 0; word-break: break-word; }
button, input { font: inherit; width: 100%; box-sizing: border-box; min-height: 2.75rem; padding: 0.5rem 0.75rem; border-radius: 0.6rem; border: 1px solid #8886; margin-top: 0.5rem; }
button { cursor: pointer; background: #2481cc; color: #fff; border-color: #2481cc; }
button.secondary { background: transparent; color: inherit; border-color: #8886; }
button:disabled { opacity: 0.5; cursor: default; }
ul { list-style: none; padding: 0; margin: 0.5rem 0; }
li button { text-align: start; background: transparent; color: inherit; border-color: #8884; margin-top: 0.25rem; }
li small { display: block; opacity: 0.7; }
#status { min-height: 1.5rem; font-weight: 600; }
[hidden] { display: none !important; }
`;

const SCRIPT = `
(() => {
  const cfg = JSON.parse(document.getElementById("cfg").textContent);
  const S = cfg.strings;
  const $ = (id) => document.getElementById(id);
  const say = (text) => { $("status").textContent = text; };
  const timeIn = (zone) => {
    try { return new Intl.DateTimeFormat(cfg.lang, { timeStyle: "short", timeZone: zone }).format(new Date()); }
    catch (e) { return ""; }
  };
  const local = (zone) => S.localTime.replace("{0}", timeIn(zone));
  const pretty = (zone) => zone.replace(/_/g, " ");

  $("title").textContent = S.title;
  $("detected-label").textContent = S.detected;
  $("confirm").textContent = S.confirm;
  $("choose").textContent = S.choose;
  $("search").placeholder = S.search;
  $("search").setAttribute("aria-label", S.search);
  $("save").textContent = S.save;

  const buttons = () => document.querySelectorAll("button");
  const setBusy = (busy) => buttons().forEach((b) => { b.disabled = busy; });

  async function save(zone) {
    say("");
    setBusy(true);
    try {
      const res = await fetch("/tz/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: cfg.token, timezone: zone }),
      });
      if (res.ok) {
        $("detected").hidden = true;
        $("chooser").hidden = true;
        say("\\u2705 " + S.saved);
        return;
      }
      say(res.status === 403 ? S.expired : S.error);
    } catch (e) {
      say(S.error);
    }
    setBusy(false);
  }

  let detected = null;
  try { detected = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { detected = null; }

  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone").slice() : [];
  if (!zones.includes("UTC")) zones.push("UTC");

  let picked = null;
  function renderResults() {
    const query = $("search").value.trim().toLowerCase();
    const list = $("results");
    list.textContent = "";
    zones
      .filter((zone) => !query || pretty(zone).toLowerCase().includes(query))
      .slice(0, 40)
      .forEach((zone) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary";
        button.textContent = pretty(zone);
        const small = document.createElement("small");
        small.textContent = timeIn(zone);
        button.appendChild(small);
        button.addEventListener("click", () => {
          picked = zone;
          $("picked-zone").textContent = pretty(zone);
          $("picked-time").textContent = local(zone);
          $("save").hidden = false;
        });
        item.appendChild(button);
        list.appendChild(item);
      });
  }

  function showChooser() {
    $("detected").hidden = true;
    $("chooser").hidden = false;
    renderResults();
    $("search").focus();
  }

  $("search").addEventListener("input", renderResults);
  $("choose").addEventListener("click", showChooser);
  $("confirm").addEventListener("click", () => save(detected));
  $("save").addEventListener("click", () => { if (picked) save(picked); });

  if (detected) {
    $("detected-zone").textContent = pretty(detected);
    $("detected-time").textContent = local(detected);
    $("detected").hidden = false;
  } else {
    showChooser();
  }
})();
`;

export interface TzPageInput {
  lang: string;
  saveToken: string;
  nonce: string;
}

export function renderTzPage({ lang, saveToken, nonce }: TzPageInput): string {
  const t = (text: string) => translateStatic(text, lang);
  const config = {
    token: saveToken,
    lang,
    strings: {
      title: t(PAGE_TITLE),
      detected: t(PAGE_DETECTED),
      localTime: t(PAGE_LOCAL_TIME),
      confirm: t(PAGE_CONFIRM),
      choose: t(PAGE_CHOOSE),
      search: t(PAGE_SEARCH),
      save: t(PAGE_SAVE),
      saved: t(PAGE_SAVED),
      expired: t(PAGE_EXPIRED),
      error: t(PAGE_ERROR),
    },
  };
  const dir = RTL_LANGUAGES.has(lang) ? "rtl" : "ltr";

  return `<!doctype html>
<html lang="${escapeHtml(lang)}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(t(PAGE_TITLE))}</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<main>
<h1 id="title"></h1>
<p id="status" role="status"></p>
<section id="detected" hidden>
<p id="detected-label"></p>
<p class="zone" id="detected-zone"></p>
<p id="detected-time"></p>
<button type="button" id="confirm"></button>
<button type="button" id="choose" class="secondary"></button>
</section>
<section id="chooser" hidden>
<input id="search" type="search" autocomplete="off">
<ul id="results"></ul>
<p class="zone" id="picked-zone"></p>
<p id="picked-time"></p>
<button type="button" id="save" hidden></button>
</section>
</main>
<script type="application/json" id="cfg">${jsonForScript(config)}</script>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}

export function renderMessagePage(lang: string, message: string, nonce: string): string {
  return `<!doctype html>
<html lang="${escapeHtml(lang)}" dir="${RTL_LANGUAGES.has(lang) ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(translateStatic(PAGE_TITLE, lang))}</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body><main><h1>${escapeHtml(translateStatic(PAGE_TITLE, lang))}</h1><p id="status">${escapeHtml(message)}</p></main></body>
</html>`;
}
