// Represents how many messages a user can send to a model per day: no limit
// when the daily quota is off (APP_CONFIG.enforceUserDailyQuota), or a number
// of units.
export type DailyQuota =
  | { kind: "off" }
  | { kind: "limited"; unitsPerDay: number };
