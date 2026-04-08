export interface AppInfo {
  appName: string;
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
}

export interface ProfileSummary {
  id: string;
  name: string;
  directory: string;
  lastUsedAt: string;
}

export interface ProfilesSnapshot {
  activeProfileId: string;
  profiles: ProfileSummary[];
}

export interface SelectProfileInput {
  profileId: string;
}
