// Represents the bot's settings that are the same for every user.
export interface AppConfig {
  enforceUserDailyQuota: boolean;
  dailyQuota: number;
  showDailyQuota: boolean;
  floatingTimeZoneName: string;
  escalateBelowConfidence: number;
}

// Represents the settings the bot runs with.
export const APP_CONFIG: AppConfig = {
  enforceUserDailyQuota: true,
  dailyQuota: 10,
  // Hidden while few people use the bot, so a new user doesn't feel limited.
  // A user who used up the quota is still told why.
  showDailyQuota: false,
  floatingTimeZoneName: "UTC",
  // A light model's answer with a lower confidence is asked again of a strong
  // model. A first guess: tune it with the extraction.escalated logs.
  escalateBelowConfidence: 0.7,
};
