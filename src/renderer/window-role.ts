/** Which UI this renderer instance mounts. Main opens the same bundle in two
 *  windows: the main window (dashboard + media playback) and the settings
 *  window, flagged with `?window=settings` (see loadRenderer in main/index.ts). */
export type WindowRole = 'main' | 'settings';

export const WINDOW_ROLE: WindowRole =
  new URLSearchParams(window.location.search).get('window') === 'settings' ? 'settings' : 'main';
