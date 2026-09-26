export interface FeatureFlags {
  enforceUserWhitelisting: boolean;
  enforceUserDailyQuota: boolean;
  dailyQuota: number;
}

export const featureFlags: FeatureFlags = {
  enforceUserWhitelisting: true,
  enforceUserDailyQuota: true,
  dailyQuota: 3,
};
