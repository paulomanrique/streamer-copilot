import type { AppInfo, ProfilesSnapshot, SelectProfileInput } from './types.js';

export const IPC_CHANNELS = {
  appGetInfo: 'app:get-info',
  profilesList: 'profiles:list',
  profilesSelect: 'profiles:select',
} as const;

export interface CopilotApi {
  getAppInfo: () => Promise<AppInfo>;
  listProfiles: () => Promise<ProfilesSnapshot>;
  selectProfile: (input: SelectProfileInput) => Promise<ProfilesSnapshot>;
}
