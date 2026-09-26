export interface FeatureFlags {
  enforceUserWhitelisting: boolean;
  enforceUserDailyQuota: boolean;
  dailyQuota: number;
}

export const featureFlags: FeatureFlags = {
  enforceUserWhitelisting: false,
  enforceUserDailyQuota: true,
  dailyQuota: 3,
};
