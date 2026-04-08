export interface ProfileSelectorDecisionInput {
  forceOpen: boolean;
  skipPromptPreference: boolean;
}

export function shouldPromptProfileSelector(input: ProfileSelectorDecisionInput): boolean {
  if (input.forceOpen) return true;
  return !input.skipPromptPreference;
}

export function readSkipPromptPreference(rawValue: string | null): boolean {
  return rawValue === '1';
}
