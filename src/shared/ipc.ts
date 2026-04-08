import type {
  AppInfo,
  CloneProfileInput,
  CreateProfileInput,
  DeleteProfileInput,
  ProfilesSnapshot,
  RenameProfileInput,
  ScheduledMessage,
  ScheduledMessageDeleteInput,
  ScheduledMessageUpsertInput,
  ScheduledStatusItem,
  SelectProfileInput,
  VoiceCommand,
  VoiceCommandDeleteInput,
  VoiceCommandUpsertInput,
  VoiceSpeakPayload,
} from './types.js';

export const IPC_CHANNELS = {
  appGetInfo: 'app:get-info',
  profilesList: 'profiles:list',
  profilesSelect: 'profiles:select',
  profilesCreate: 'profiles:create',
  profilesRename: 'profiles:rename',
  profilesClone: 'profiles:clone',
  profilesDelete: 'profiles:delete',
  profilesPickDirectory: 'profiles:pick-directory',
  scheduledList: 'scheduled:list',
  scheduledUpsert: 'scheduled:upsert',
  scheduledDelete: 'scheduled:delete',
  scheduledStatus: 'scheduled:status',
  voiceList: 'voice:list',
  voiceUpsert: 'voice:upsert',
  voiceDelete: 'voice:delete',
  voicePreviewSpeak: 'voice:preview-speak',
  voiceSpeak: 'voice:speak',
} as const;

export interface CopilotApi {
  getAppInfo: () => Promise<AppInfo>;
  listProfiles: () => Promise<ProfilesSnapshot>;
  selectProfile: (input: SelectProfileInput) => Promise<ProfilesSnapshot>;
  createProfile: (input: CreateProfileInput) => Promise<ProfilesSnapshot>;
  renameProfile: (input: RenameProfileInput) => Promise<ProfilesSnapshot>;
  cloneProfile: (input: CloneProfileInput) => Promise<ProfilesSnapshot>;
  deleteProfile: (input: DeleteProfileInput) => Promise<ProfilesSnapshot>;
  pickProfileDirectory: () => Promise<string | null>;
  listScheduledMessages: () => Promise<ScheduledMessage[]>;
  upsertScheduledMessage: (input: ScheduledMessageUpsertInput) => Promise<ScheduledMessage[]>;
  deleteScheduledMessage: (input: ScheduledMessageDeleteInput) => Promise<ScheduledMessage[]>;
  onScheduledStatus: (listener: (items: ScheduledStatusItem[]) => void) => () => void;
  listVoiceCommands: () => Promise<VoiceCommand[]>;
  upsertVoiceCommand: (input: VoiceCommandUpsertInput) => Promise<VoiceCommand[]>;
  deleteVoiceCommand: (input: VoiceCommandDeleteInput) => Promise<VoiceCommand[]>;
  previewVoiceSpeak: (input: VoiceSpeakPayload) => Promise<void>;
  onVoiceSpeak: (listener: (payload: VoiceSpeakPayload) => void) => () => void;
}
