import { create } from 'zustand';

import type { ProfilesSnapshot } from '../shared/types.js';

interface AppStore extends ProfilesSnapshot {
  setProfiles: (snapshot: ProfilesSnapshot) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeProfileId: '',
  profiles: [],
  setProfiles: (snapshot) =>
    set({
      activeProfileId: snapshot.activeProfileId,
      profiles: snapshot.profiles,
    }),
}));
