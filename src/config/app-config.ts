// Represents the bot's settings that are the same for every user.
export interface AppConfig {
  enforceUserDailyQuota: boolean;
  dailyQuota: number;
  showDailyQuota: boolean;
  floatingTimeZoneName: string;
}

// Represents the settings the bot runs with.
export const APP_CONFIG: AppConfig = {
  enforceUserDailyQuota: true,
  dailyQuota: 10,
  // Hidden while few people use the bot, so a new user doesn't feel limited.
  // A user who used up the quota is still told why.
  showDailyQuota: false,
  floatingTimeZoneName: "UTC",
};
