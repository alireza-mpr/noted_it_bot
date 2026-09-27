export interface AppConfig {
  enforceUserDailyQuota: boolean;
  dailyQuota: number;
  defaultTimezone: string;
}

export const appConfig: AppConfig = {
  enforceUserDailyQuota: true,
  dailyQuota: 5,
  defaultTimezone: "UTC",
};
