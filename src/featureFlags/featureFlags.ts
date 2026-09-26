export interface FeatureFlags {
  enforceUserWhitelisting: boolean;
  enforceUserDailyQuota: boolean;
  dailyQuota: number;
  defaultTimezone: string;
}

export const featureFlags: FeatureFlags = {
  enforceUserWhitelisting: false,
  enforceUserDailyQuota: true,
  dailyQuota: 3,
  defaultTimezone: "UTC",
};
