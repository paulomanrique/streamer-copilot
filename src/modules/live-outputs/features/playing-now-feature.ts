import type { PlayingNowLiveOutputConfig, PlayingNowTrackSnapshot } from '../../../shared/types.js';
import type { LiveOutputFeature, LiveOutputFeatureRuntime } from '../feature-registry.js';
import { descriptor } from '../feature-registry.js';
import { applyTemplate } from '../template-engine.js';

export type PlayingNowReader = (config: PlayingNowLiveOutputConfig) => Promise<PlayingNowTrackSnapshot>;

interface PlayingNowRuntimeData {
  dueAt: number;
  track: PlayingNowTrackSnapshot | null;
  error: string | null;
}

function data(runtime: LiveOutputFeatureRuntime): PlayingNowRuntimeData {
  return runtime.data as unknown as PlayingNowRuntimeData;
}

function truncate(value: string, limit: number): string {
  const points = [...value];
  if (limit <= 0 || points.length <= limit) return value;
  return `${points.slice(0, Math.max(0, limit - 1)).join('')}…`;
}

export function createPlayingNowFeature(reader: PlayingNowReader): LiveOutputFeature<PlayingNowLiveOutputConfig> {
  return {
    descriptor: descriptor('playing-now', 'playing-now', 'TextFiles/TrackInfo.txt', [
      ['$artist', 'Track artist', 'Artist'], ['$song', 'Track title', 'Song'], ['$album', 'Album', 'Album'],
      ['$ARTIST', 'Uppercase artist', 'ARTIST'], ['$SONG', 'Uppercase title', 'SONG'], ['$ALBUM', 'Uppercase album', 'ALBUM'],
    ], ['play', 'pause', 'stop', 'previous', 'next']),
    createRuntime(config, now) {
      return { status: config.enabled ? 'ready' : 'disabled', data: { dueAt: now, track: null, error: null } };
    },
    async tick(config, runtime, now) {
      const state = data(runtime);
      if (!config.enabled) return { status: 'disabled', renderedText: '', nextTransitionAt: null, details: {} };
      if (!state.track || now >= state.dueAt) {
        try {
          state.track = await reader(config);
          state.error = null;
        } catch (cause) {
          state.error = cause instanceof Error ? cause.message : String(cause);
        }
        state.dueAt = now + 1_000;
      }
      const track = state.track;
      if (!track || track.state === 'idle' || track.state === 'stopped' || track.state === 'unavailable') {
        return {
          status: state.error ? 'degraded' : 'ready',
          renderedText: config.noMediaText,
          nextTransitionAt: new Date(state.dueAt).toISOString(),
          details: { ...(track ?? {}), error: state.error },
        };
      }
      const artist = truncate(track.artist, config.truncate.artist);
      const song = truncate(track.song, config.truncate.song);
      const album = truncate(track.album, config.truncate.album);
      return {
        status: state.error || track.state === 'error' ? 'degraded' : (track.state === 'paused' ? 'paused' : 'running'),
        renderedText: applyTemplate(config.format, {
          '$artist': artist, '$song': song, '$album': album,
          '$ARTIST': artist.toLocaleUpperCase(), '$SONG': song.toLocaleUpperCase(), '$ALBUM': album.toLocaleUpperCase(),
        }),
        nextTransitionAt: new Date(state.dueAt).toISOString(),
        details: { ...track, artist, song, album, error: state.error },
      };
    },
  };
}
