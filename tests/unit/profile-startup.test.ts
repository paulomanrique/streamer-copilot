import { describe, expect, it } from 'vitest';

import { readSkipPromptPreference, shouldPromptProfileSelector } from '../../src/renderer/profile-startup.js';

describe('profile startup selector decision', () => {
  it('opens when forceOpen is true even if preference skips prompt', () => {
    expect(shouldPromptProfileSelector({ forceOpen: true, skipPromptPreference: true })).toBe(true);
  });

  it('opens when preference is not set to skip', () => {
    expect(shouldPromptProfileSelector({ forceOpen: false, skipPromptPreference: false })).toBe(true);
  });

  it('does not open when preference is set to skip and forceOpen is false', () => {
    expect(shouldPromptProfileSelector({ forceOpen: false, skipPromptPreference: true })).toBe(false);
  });

  it('interprets stored skip preference key value', () => {
    expect(readSkipPromptPreference('1')).toBe(true);
    expect(readSkipPromptPreference(null)).toBe(false);
    expect(readSkipPromptPreference('0')).toBe(false);
  });
});
