/**
 * Side-effect barrel that registers every renderer-side settings module.
 *
 * Importing this module once wires every `RendererSettingsModule` into the
 * registry defined in `./registry.ts`. `SettingsWorkspace` reads from the
 * registry to populate its sidebar — adding a new module is a single entry
 * file plus a line here, with no edit to `SettingsWorkspace`.
 *
 * The App group's General / Profiles entries stay hardcoded in
 * `SettingsWorkspace` because they need ambient props from `App.tsx` (the
 * profile-management callbacks aren't yet available through a store hook).
 */
import './sound-settings-module.js';
import './text-settings-module.js';
import './welcome-settings-module.js';
import './music-settings-module.js';
import './polls-settings-module.js';
import './raffles-settings-module.js';
import './suggestions-settings-module.js';
import './overlays-settings-module.js';
import './obs-settings-module.js';
