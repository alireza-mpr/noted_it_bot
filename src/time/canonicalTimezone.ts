// The canonical IANA name ("asia/tehran" becomes "Asia/Tehran"), or null when
// Intl doesn't know it. Only Area/Location names and UTC/GMT are accepted, so
// legacy aliases such as "EST" don't slip through as if they were places.
export function canonicalTimezone(name: string): string | null {
  const trimmed = name.trim();
  if (!/^[A-Za-z_+\-0-9]+(\/[A-Za-z_+\-0-9]+)+$/.test(trimmed) && !/^(utc|gmt)$/i.test(trimmed)) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat("en", { timeZone: trimmed }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}
