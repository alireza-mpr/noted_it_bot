export interface UserPreferenceRow {
  userId: number;
  lang: string | null;
  // null until the user picks one with /tz; appConfig.defaultTimezone applies meanwhile.
  timezone: string | null;
}
