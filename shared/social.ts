export type SocialPlatform =
  | "x"
  | "threads"
  | "instagram"
  | "facebook"
  | "tiktok";

export interface OfficialSocialProvider {
  platform: SocialPlatform;
  name: string;
  product: string;
  endpointTemplate: string;
  method: "GET" | "POST";
  documentation: string;
  scope: string;
  accessRequirements: string[];
  credentialVariables: string[];
  targetVariables: string[];
}

export interface OfficialSocialState extends OfficialSocialProvider {
  enabled: false;
  collectorImplemented: false;
  credentialsPresent: boolean;
  stage: "configuration_missing" | "implementation_pending";
  missingVariables: string[];
  message: string;
}

/** Future collectors must return actual official-API records, never placeholders. */
export interface OfficialSocialPost {
  platform: SocialPlatform;
  id: string;
  text: string;
  url: string;
  publishedAt: string;
  authorName?: string;
}
