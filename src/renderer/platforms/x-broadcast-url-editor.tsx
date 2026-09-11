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
      title="URL da live do X"
      subtitle={<>Conta <span className="text-gray-300">{account.label}</span> · @{account.channel}</>}
      inputLabel="Broadcast URL"
      placeholder="https://x.com/i/broadcasts/..."
      help={
        <>
          A URL informada aqui tem prioridade sobre a auto-detecção da live. Cada transmissão
          ganha uma URL nova, então cole a da live atual. Deixe em branco para voltar à
          auto-detecção pelo @handle.
        </>
      }
      invalidMessage="URL inválida. Use https://x.com/i/broadcasts/<id> (ou apenas o id)."
      isValid={isValidBroadcastRef}
    />
  );
}
