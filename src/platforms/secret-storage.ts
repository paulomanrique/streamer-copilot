import { safeStorage } from 'electron';

/**
 * Encryption-at-rest helpers for platform credentials (OAuth tokens, client
 * secrets). Backed by Electron's `safeStorage`, which uses the OS keychain
 * (Keychain on macOS, DPAPI on Windows, libsecret on Linux).
 *
 * Two schemes live here:
 *
 * - `encryptSecret` / `decryptSecret`: raw base64, no marker. Kept for the
 *   YouTube OAuth store, whose persisted values predate the marker scheme.
 * - `encryptMarked` / `decryptMarked`: marker-prefixed, so a legacy plaintext
 *   value is unambiguously distinguishable from an encrypted one on read. Use
 *   this for any store that may still hold plaintext written by older builds.
 */

const ENC_PREFIX = 'scp:enc:v1:';

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption is not available on this machine');
  }
  return safeStorage.encryptString(plain).toString('base64');
}

export function decryptSecret(encrypted: string): string {
  if (!encrypted) return '';
  if (!safeStorage.isEncryptionAvailable()) return '';
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
}

/**
 * Encrypt `plain` and tag it with a version marker. When the OS keychain is
 * unavailable (e.g. a Linux box with no libsecret) the value is returned
 * unmarked plaintext as a best-effort fallback rather than throwing — the app
 * stays usable and the value is migrated automatically once a keychain exists.
 */
export function encryptMarked(plain: string): string {
  if (!plain) return '';
  if (!safeStorage.isEncryptionAvailable()) return plain;
  return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64');
}

/**
 * Decrypt a value produced by {@link encryptMarked}. Unmarked values are
 * treated as legacy plaintext and returned as-is. Returns '' if a marked value
 * cannot be decrypted (keychain unavailable or corrupted blob).
 */
export function decryptMarked(value: string): string {
  if (!value) return '';
  if (!value.startsWith(ENC_PREFIX)) return value;
  if (!safeStorage.isEncryptionAvailable()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'));
  } catch {
    return '';
  }
}

/** True when `value` is a non-empty secret that is not yet encrypted at rest. */
export function isPlaintextSecret(value: string | undefined | null): boolean {
  return !!value && !value.startsWith(ENC_PREFIX);
}
