import { useEffect, useState } from 'react';

import type { PlatformAccount, YouTubeChatChannel, YouTubeSettings } from '../../shared/types.js';

/**
 * Botão + modal que permite ao streamer trocar o canal usado pelo scraper
 * do YouTube como remetente das mensagens.
 *
 * Por que existe: depois de logar no Google, a conta cookie-based pode ter
 * múltiplos canais (brand accounts). O scraper precisa saber qual canal usa
 * pra enviar mensagens via InnerTube. Sem essa escolha o YouTubeChatAdapter
 * acaba pegando o primeiro da lista — que raramente é o canal de live.
 */
export function YouTubeAccountActions({ account: _account }: { account: PlatformAccount }) {
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<YouTubeChatChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [pendingPageId, setPendingPageId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [list, settings] = await Promise.all([
        window.copilot.youtubeGetChatChannels(),
        window.copilot.youtubeGetSettings(),
      ]);
      setChannels(list);
      const inferred = settings.chatChannelPageId ?? list.find((c) => c.isSelected)?.pageId ?? null;
      setCurrentPageId(inferred);
      setPendingPageId(inferred);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!pendingPageId) return;
    const selected = channels.find((c) => c.pageId === pendingPageId);
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const settings: YouTubeSettings = await window.copilot.youtubeGetSettings();
      await window.copilot.youtubeSaveSettings({
        ...settings,
        chatChannelPageId: selected.pageId,
        chatChannelName: selected.name,
      });
      setCurrentPageId(selected.pageId);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-2 py-1 rounded bg-red-600/20 border border-red-500/40 text-xs text-red-200 hover:bg-red-600/30"
        title="Escolher o canal que vai enviar mensagens"
      >
        Canal
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && setOpen(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <header className="px-5 py-4 border-b border-gray-700">
              <h3 className="font-semibold text-gray-100">Trocar canal do YouTube</h3>
              <p className="text-xs text-gray-500 mt-1">
                Escolha qual canal do seu login Google será usado para enviar mensagens.
              </p>
            </header>
            <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
              {loading ? (
                <p className="text-sm text-gray-500">Carregando canais...</p>
              ) : error ? (
                <p className="text-sm text-rose-400">{error}</p>
              ) : channels.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Nenhum canal disponível. Faça login no YouTube primeiro pelo botão
                  &quot;Login&quot; do card desta conta.
                </p>
              ) : (
                channels.map((channel) => {
                  const isPending = pendingPageId === channel.pageId;
                  const isCurrent = currentPageId === channel.pageId;
                  return (
                    <label
                      key={channel.pageId}
                      className={[
                        'flex items-center gap-3 px-3 py-2 rounded border cursor-pointer transition-colors',
                        isPending ? 'border-violet-500/60 bg-violet-600/10' : 'border-gray-700 bg-gray-800/40 hover:bg-gray-800',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="yt-channel"
                        checked={isPending}
                        onChange={() => setPendingPageId(channel.pageId)}
                        className="accent-violet-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-100 truncate">{channel.name || '(sem nome)'}</span>
                          {isCurrent ? <span className="text-[10px] uppercase text-violet-300">atual</span> : null}
                        </div>
                        {channel.handle ? (
                          <span className="text-xs text-gray-500 truncate">{channel.handle}</span>
                        ) : null}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <footer className="px-5 py-3 border-t border-gray-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !pendingPageId || pendingPageId === currentPageId}
                className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm text-white disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
