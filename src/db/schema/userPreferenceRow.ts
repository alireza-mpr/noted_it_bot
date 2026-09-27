export interface UserPreferenceRow {
  userId: number;
  lang: string | null;
  // null until the user sets one with /tz. Until then, events use floating
  // times, and "today" uses appConfig.defaultTimezone.
  timezone: string | null;
}
