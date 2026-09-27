// Represents the bot's settings that are the same for every user.
export interface AppConfig {
  enforceUserDailyQuota: boolean;
  dailyQuota: number;
  floatingTimeZoneName: string;
}

// Represents the settings the bot runs with.
export const APP_CONFIG: AppConfig = {
  enforceUserDailyQuota: true,
  dailyQuota: 5,
  floatingTimeZoneName: "UTC",
};
