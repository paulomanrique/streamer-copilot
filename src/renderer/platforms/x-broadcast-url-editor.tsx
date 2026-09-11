import type { PlatformAccount } from '../../shared/types.js';
import { LiveUrlAccountAction } from './live-url-editor.js';

/** Same shapes `parseBroadcastId` (main process) accepts: a broadcast URL or a
 *  bare broadcast id. Validated here so a typo surfaces in the modal instead of
 *  silently falling back to auto-detection at connect time. */
function isValidBroadcastRef(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true; // empty = clear the override
  try {
    const url = new URL(trimmed);
    if (/\/i\/broadcasts\/[^/?#]+/.test(url.pathname)) return true;
  } catch {
    /* not a URL — fall through to the bare-id check */
  }
  return /^[A-Za-z0-9]+$/.test(trimmed);
}

/** Edits the broadcast (live) URL of an existing X account. */
export function XAccountActions({ account, onChanged }: { account: PlatformAccount; onChanged: () => void }) {
  return (
    <LiveUrlAccountAction
      account={account}
      onChanged={onChanged}
      dataKey="broadcastUrl"
      title="X live URL"
      subtitle={<>Account <span className="text-gray-300">{account.label}</span> · @{account.channel}</>}
      inputLabel="Broadcast URL"
      placeholder="https://x.com/i/broadcasts/..."
      help="The URL set here takes priority over live auto-detection. Each broadcast gets a new URL, so paste the current live. Leave blank to fall back to auto-detection by @handle."
      invalidMessage="Invalid URL. Use https://x.com/i/broadcasts/<id> (or just the id)."
      isValid={isValidBroadcastRef}
    />
  );
}
