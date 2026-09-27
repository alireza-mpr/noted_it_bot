import { ProviderLimits } from "./ProviderLimits";

export interface ProviderConfig {
  id: string;
  envSecretName: string;
  baseUrl: string;
  model: string;
  limits: ProviderLimits;
}
