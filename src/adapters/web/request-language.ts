import {
  parseLanguageCode,
  type SupportedLanguage,
} from "../../domain/user/supported-language";

// Returns the browser's first language, from the Accept-Language header, if
// the bot replies in it; otherwise English. e.g. "fa-IR,fa;q=0.9,en;q=0.8"
// gives "fa".
export function requestLanguageOf(request: Request): SupportedLanguage {
  const acceptLanguage = request.headers.get("Accept-Language");
  const firstLanguageTag = acceptLanguage?.split(",")[0].split(";")[0] ?? null;
  return (
    (firstLanguageTag === null ? null : parseLanguageCode(firstLanguageTag)) ??
    "en"
  );
}
