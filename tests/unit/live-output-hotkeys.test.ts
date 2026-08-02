import { beforeEach, describe, expect, it, vi } from 'vitest';

const { register, unregister } = vi.hoisted(() => ({
  register: vi.fn<(accelerator: string, callback: () => void) => boolean>(),
  unregister: vi.fn<(accelerator: string) => void>(),
}));

vi.mock('electron', () => ({ globalShortcut: { register, unregister } }));

import { LiveOutputHotkeyManager } from '../../src/modules/live-outputs/hotkey-manager.js';

describe('LiveOutputHotkeyManager', () => {
  beforeEach(() => {
    register.mockReset().mockReturnValue(true);
    unregister.mockReset();
  });

  it('rejects duplicate shortcuts before registering them', () => {
    const manager = new LiveOutputHotkeyManager(vi.fn());
    const result = manager.apply(true, [
      { action: 'chrono-down.toggle', accelerator: 'Control+1' },
      { action: 'chrono-up.toggle', accelerator: 'control+1' },
    ]);
    expect(result).toMatchObject({ ok: false, error: { code: 'HOTKEY_CONFLICT' } });
    expect(register).not.toHaveBeenCalled();
  });

  it('restores the previous registration when a new shortcut is unavailable', () => {
    const manager = new LiveOutputHotkeyManager(vi.fn());
    expect(manager.apply(true, [{ action: 'chrono-down.toggle', accelerator: 'Control+1' }]).ok).toBe(true);
    register.mockImplementation((accelerator) => accelerator !== 'Control+2');

    const result = manager.apply(true, [{ action: 'chrono-up.toggle', accelerator: 'Control+2' }]);
    expect(result).toMatchObject({ ok: false, error: { code: 'HOTKEY_CONFLICT', field: 'chrono-up.toggle' } });
    expect(unregister).toHaveBeenCalledWith('Control+1');
    expect(register).toHaveBeenLastCalledWith('Control+1', expect.any(Function));
  });
});
