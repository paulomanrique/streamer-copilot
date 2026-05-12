import type { ComponentType, ReactElement } from 'react';

import type { TranslationMessages } from '../i18n/types.js';

/**
 * Renderer-side module registry.
 *
 * Each entry describes a self-contained settings page that the
 * `SettingsWorkspace` sidebar can render — id (route key), the i18n key for
 * its sidebar label, an SVG icon node, and the React component itself.
 *
 * The expectation is that registered modules are **props-free**: they pull
 * whatever data they need from `useAppStore` and `window.copilot` on their
 * own. Pages that still need ambient props (the App group's General /
 * Profiles, the Voice page) stay hardcoded in `SettingsWorkspace` until
 * they're rewritten to be self-contained — there's no rush, the registry
 * doesn't preclude them.
 *
 * Adding a new module to the Modules group is a single
 * `registerRendererModule(...)` call from the module's barrel entry; no
 * edits to `SettingsWorkspace` are required.
 */
/** Sidebar group a module shows up under. Greater values render lower. */
export type RendererSettingsGroup = 'Modules' | 'Integrations';

export interface RendererSettingsModule {
  /** Unique route id used by the sidebar to switch between views. */
  id: string;
  /** Which sidebar section the entry shows up under. */
  group: RendererSettingsGroup;
  /** Key on `messages.settings` for the sidebar label, when one exists. */
  labelKey?: keyof TranslationMessages['settings'];
  /** Verbatim label shown when `labelKey` is absent or the i18n key resolves
   *  to undefined. Required so every module has a working sidebar label
   *  even before its translation lands. */
  fallbackLabel: string;
  /** SVG node rendered as the sidebar icon (24x24 viewBox, w-4 h-4). */
  icon: ReactElement;
  /** The React component rendered when the user picks this item. Must take
   *  no props — read state from the store / IPC directly. */
  SettingsPage: ComponentType;
}

const modules = new Map<string, RendererSettingsModule>();

export function registerRendererModule(module: RendererSettingsModule): void {
  modules.set(module.id, module);
}

/** Every registered module, ordered by registration. Consumers typically
 *  re-sort by the localized label before rendering. */
export function listRendererModules(): RendererSettingsModule[] {
  return [...modules.values()];
}

export function getRendererModule(id: string): RendererSettingsModule | null {
  return modules.get(id) ?? null;
}
