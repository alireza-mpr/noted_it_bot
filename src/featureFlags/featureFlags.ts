export interface FeatureFlags {
  enforceUserDailyQuota: boolean;
  dailyQuota: number;
  defaultTimezone: string;
}

export const featureFlags: FeatureFlags = {
  enforceUserDailyQuota: true,
  dailyQuota: 3,
  defaultTimezone: "UTC",
};
