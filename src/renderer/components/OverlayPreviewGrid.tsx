import type { OverlayServerInfo } from '../../shared/ipc.js';

interface OverlayPreviewGridProps {
  info: OverlayServerInfo | null;
}

interface PreviewTile {
  label: string;
  /** URL of the live overlay (loaded inside an iframe). */
  url: string | null;
  /** Aspect-ratio class — chat overlay is tall, the rest are wide. */
  aspect: string;
}

/**
 * Live previews of the four customizable overlays, rendered as iframes
 * pointing at the local overlay server. The visual style editor's WS push
 * lands inside each iframe via the same channel OBS uses, so adjusting a
 * slider above updates these in real time.
 *
 * `pointer-events: none` keeps the previews non-interactive — clicking
 * them shouldn't scrub a chat-list or interact with the wheel.
 */
export function OverlayPreviewGrid({ info }: OverlayPreviewGridProps) {
  // `?preview=1` tells each overlay it's running inside the editor iframe
  // (today only the now-playing overlay reads it — to silence audio and
  // render a placeholder card when nothing's queued — but every preview
  // gets the flag for consistency as we add more in-app cues).
  const tiles: PreviewTile[] = [
    { label: 'Chat — Overlay', url: withPreviewFlag(info?.urls.chat), aspect: 'aspect-[3/4]' },
    { label: 'Now playing', url: withPreviewFlag(info?.urls.nowPlaying), aspect: 'aspect-[16/7]' },
    { label: 'Sorteio', url: withPreviewFlag(info?.urls.raffles), aspect: 'aspect-[16/9]' },
    { label: 'Enquete', url: withPreviewFlag(info?.urls.polls), aspect: 'aspect-[16/9]' },
  ];

  return (
    <section className="rounded-lg border border-gray-700 bg-gray-800/40 p-4">
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-gray-100">Previews ao vivo</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          O mesmo conteúdo que o OBS recebe. Mudanças no editor aplicam aqui em tempo real.
        </p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <PreviewTile key={tile.label} tile={tile} />
        ))}
      </div>
    </section>
  );
}

function withPreviewFlag(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.includes('?') ? `${url}&preview=1` : `${url}?preview=1`;
}

function PreviewTile({ tile }: { tile: PreviewTile }) {
  return (
    <div className={`relative ${tile.aspect} rounded-md overflow-hidden border border-gray-700 bg-black/60`}>
      {tile.url ? (
        <iframe
          src={tile.url}
          title={tile.label}
          className="absolute inset-0 w-full h-full pointer-events-none"
          // Sandboxing keeps the previews from popping dialogs / navigating
          // the parent if any overlay tries to. Same-origin keeps the WS
          // connection to 127.0.0.1 working.
          sandbox="allow-scripts allow-same-origin"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
          Servidor não está rodando
        </div>
      )}
      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] uppercase tracking-wider text-gray-200">
        {tile.label}
      </span>
    </div>
  );
}
