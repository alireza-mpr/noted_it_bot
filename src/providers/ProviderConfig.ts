import { ProviderId, ProviderKind } from "./provider";
import { ProviderLimits } from "./ProviderLimits";

export interface ProviderConfig {
  id: ProviderId;
  kind: ProviderKind;
  envSecretName: string;
  baseUrl: string;
  model: string;
  limits: ProviderLimits;
}
