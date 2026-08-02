import { globalShortcut } from 'electron';

import type { LiveOutputHotkeyBinding, LiveOutputHotkeyAction, LiveOutputOperationResult } from '../../shared/types.js';

export class LiveOutputHotkeyManager {
  private enabled = false;
  private bindings: LiveOutputHotkeyBinding[] = [];
  private registered: string[] = [];

  constructor(private readonly onAction: (action: LiveOutputHotkeyAction) => void) {}

  apply(enabled: boolean, bindings: LiveOutputHotkeyBinding[]): LiveOutputOperationResult<void> {
    const previousEnabled = this.enabled;
    const previousBindings = this.bindings;
    this.unregisterAll();
    const attempted = this.register(enabled, bindings);
    if (attempted.ok) {
      this.enabled = enabled;
      this.bindings = structuredClone(bindings);
      return attempted;
    }
    this.unregisterAll();
    const restored = this.register(previousEnabled, previousBindings);
    this.enabled = restored.ok ? previousEnabled : false;
    this.bindings = restored.ok ? previousBindings : [];
    return attempted;
  }

  dispose(): void {
    this.unregisterAll();
    this.enabled = false;
    this.bindings = [];
  }

  private register(enabled: boolean, bindings: LiveOutputHotkeyBinding[]): LiveOutputOperationResult<void> {
    if (!enabled) return { ok: true, value: undefined };
    const active = bindings.filter((binding): binding is LiveOutputHotkeyBinding & { accelerator: string } => !!binding.accelerator);
    const normalized = active.map((binding) => binding.accelerator.toLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      return { ok: false, error: { code: 'HOTKEY_CONFLICT', message: 'The same shortcut is assigned more than once' } };
    }
    for (const binding of active) {
      const registered = (() => {
        try { return globalShortcut.register(binding.accelerator, () => this.onAction(binding.action)); }
        catch { return false; }
      })();
      if (!registered) {
        return { ok: false, error: { code: 'HOTKEY_CONFLICT', message: `Shortcut is unavailable: ${binding.accelerator}`, field: binding.action } };
      }
      this.registered.push(binding.accelerator);
    }
    return { ok: true, value: undefined };
  }

  private unregisterAll(): void {
    for (const accelerator of this.registered) globalShortcut.unregister(accelerator);
    this.registered = [];
  }
}
