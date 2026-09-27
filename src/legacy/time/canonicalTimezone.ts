// Returns the standard IANA name ("asia/tehran" becomes "Asia/Tehran"), or null
// if Intl does not know it. Only Area/Location names and UTC/GMT are accepted.
// So old short names like "EST" are not treated as places.
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
