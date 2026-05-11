import { useEffect, useState } from 'react';

import type { PlatformAccount, PlatformAccountConnectionStatus } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { getPlatformProviderOrFallback } from '../platforms/registry.js';

interface StatusBarProps {
  activeProfileName: string;
  obsConnected: boolean;
}

function dotClass(providerId: string, status: PlatformAccountConnectionStatus): string {
  if (status === 'connected') return `${getPlatformProviderOrFallback(providerId).accentBg} pulse-dot`;
  if (status === 'connecting' || status === 'watching' || status === 'captcha') return 'bg-yellow-400 animate-pulse';
  if (status === 'error') return 'bg-red-500';
  return 'bg-gray-600';
}

export function StatusBar({ activeProfileName, obsConnected }: StatusBarProps) {
  const { messages, t } = useI18n();
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [statuses, setStatuses] = useState<Record<string, PlatformAccountConnectionStatus>>({});

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const list = await window.copilot.accountsList();
        if (cancelled) return;
        const visible = list.filter((a) => a.enabled);
        setAccounts(visible);
        const entries = await Promise.all(
          visible.map(async (a) => {
            const s = await window.copilot.accountsGetStatus({ id: a.id });
            return [a.id, s?.status ?? 'disconnected'] as const;
          }),
        );
        if (cancelled) return;
        setStatuses(Object.fromEntries(entries));
      } catch {
        // silently ignore — chips will simply stay empty
      }
    };

    void refresh();
    // Apply incremental updates from the push channel only — re-listing
    // accounts on every status ping flooded the IPC bus and raced with
    // dev-mode main-process restarts.
    const unsub = window.copilot.onAccountStatus((status) => {
      setStatuses((prev) => ({ ...prev, [status.accountId]: status.status }));
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const statusLabel = (status: PlatformAccountConnectionStatus): string => {
    if (status === 'connecting') return t('Connecting...');
    if (status === 'watching') return t('Watching for live');
    return messages.common.status[status as keyof typeof messages.common.status] ?? status;
  };

  return (
    <footer className="h-8 bg-gray-900 border-t border-gray-800 flex items-center px-4 gap-4 shrink-0 text-xs text-gray-500 overflow-x-auto whitespace-nowrap">
      {accounts.map((account) => {
        const status = statuses[account.id] ?? 'disconnected';
        const providerLabel = getPlatformProviderOrFallback(account.providerId).displayName;
        const display = status === 'connected'
          ? (account.label || account.channel || statusLabel(status))
          : statusLabel(status);
        return (
          <div key={account.id} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${dotClass(account.providerId, status)}`} />
            <span>
              {providerLabel}: <span className="text-gray-300">{display}</span>
            </span>
          </div>
        );
      })}

      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${obsConnected ? 'bg-cyan-500' : 'bg-gray-600'}`} />
        <span>
          OBS: <span className="text-gray-300">{obsConnected ? messages.common.status.connected : messages.common.status.offline}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5 ml-auto">
        <span className="w-2 h-2 rounded-full bg-violet-500" />
        <span>
          {t('Profile')}: <span className="text-gray-300">{activeProfileName}</span>
        </span>
      </div>
    </footer>
  );
}
