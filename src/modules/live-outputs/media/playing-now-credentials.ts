import type { CredentialStatus, PlayingNowTrackSnapshot } from '../../../shared/types.js';
import { nativeImage } from 'electron';
import { decryptSecret, encryptSecret } from '../../../platforms/secret-storage.js';
import { JsonSettingsStore } from '../../base/settings-store.js';
import { LiveOutputWriter } from '../output-writer.js';

interface StoredPlayingNowCredentials {
  clientId: string;
  clientSecretEncrypted: string;
}

class PlayingNowCredentialStore extends JsonSettingsStore<StoredPlayingNowCredentials> {
  constructor(profileDirectory: string) {
    super(profileDirectory, 'playing-now-credentials.json');
  }

  protected defaults(): StoredPlayingNowCredentials {
    return { clientId: '', clientSecretEncrypted: '' };
  }

  protected parse(raw: Record<string, unknown>): StoredPlayingNowCredentials {
    return {
      clientId: typeof raw.clientId === 'string' ? raw.clientId : '',
      clientSecretEncrypted: typeof raw.clientSecretEncrypted === 'string' ? raw.clientSecretEncrypted : '',
    };
  }

  protected normalize(input: StoredPlayingNowCredentials): StoredPlayingNowCredentials {
    return { clientId: input.clientId.trim(), clientSecretEncrypted: input.clientSecretEncrypted };
  }
}

export class PlayingNowCredentialManager {
  private readonly store: PlayingNowCredentialStore;
  private readonly writer: LiveOutputWriter;
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly profileDirectory: string) {
    this.store = new PlayingNowCredentialStore(profileDirectory);
    this.writer = new LiveOutputWriter(profileDirectory);
  }

  async getStatus(): Promise<CredentialStatus> {
    try {
      const credentials = await this.loadCredentials();
      if (!credentials) return { status: 'not-configured', message: null };
      return { status: 'configured', message: null };
    } catch (cause) {
      return { status: 'error', message: cause instanceof Error ? cause.message : String(cause) };
    }
  }

  async save(clientId: string, clientSecret: string): Promise<CredentialStatus> {
    const validation = await this.test({ clientId: clientId.trim(), clientSecret });
    if (validation.status !== 'configured') return validation;
    await this.store.save({ clientId: clientId.trim(), clientSecretEncrypted: encryptSecret(clientSecret) });
    this.accessToken = null;
    return { status: 'configured', message: 'Spotify credentials are valid' };
  }

  async remove(): Promise<void> {
    await this.store.save({ clientId: '', clientSecretEncrypted: '' });
    this.accessToken = null;
  }

  async test(input?: { clientId: string; clientSecret: string }): Promise<CredentialStatus> {
    try {
      const credentials = input ?? await this.loadCredentials();
      if (!credentials) return { status: 'not-configured', message: null };
      await this.fetchToken(credentials.clientId, credentials.clientSecret, false);
      return { status: 'configured', message: 'Spotify credentials are valid' };
    } catch (cause) {
      return { status: 'error', message: cause instanceof Error ? cause.message : String(cause) };
    }
  }

  async enrich(track: PlayingNowTrackSnapshot, writeArtwork: boolean): Promise<PlayingNowTrackSnapshot> {
    if (!track.song) return track;
    const credentials = await this.loadCredentials();
    if (!credentials) return track;
    const token = await this.getToken(credentials);
    const query = encodeURIComponent(`track:${track.song}${track.artist ? ` artist:${track.artist}` : ''}`);
    const response = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Spotify search failed (${response.status})`);
    const payload = await response.json() as {
      tracks?: { items?: Array<{ album?: { name?: string; images?: Array<{ url?: string }> } }> };
    };
    const item = payload.tracks?.items?.[0];
    const imageUrl = item?.album?.images?.[0]?.url;
    let artworkPath = track.artworkPath;
    if (imageUrl && writeArtwork) {
      const imageResponse = await fetch(imageUrl);
      if (imageResponse.ok) {
        const image = nativeImage.createFromBuffer(Buffer.from(await imageResponse.arrayBuffer()));
        if (!image.isEmpty()) {
          await this.writer.writeBuffer('Images/AlbumImage.png', image.toPNG());
          artworkPath = this.writer.resolve('Images/AlbumImage.png');
        }
      }
    }
    return { ...track, album: track.album || item?.album?.name || '', artworkPath };
  }

  private async loadCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
    const stored = await this.store.load();
    const clientSecret = (() => {
      try { return decryptSecret(stored.clientSecretEncrypted); }
      catch { throw new Error('Spotify credentials could not be decrypted on this machine'); }
    })();
    if (!stored.clientId || !clientSecret) return null;
    return { clientId: stored.clientId, clientSecret };
  }

  private async getToken(credentials: { clientId: string; clientSecret: string }): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 30_000) return this.accessToken.value;
    return this.fetchToken(credentials.clientId, credentials.clientSecret, true);
  }

  private async fetchToken(clientId: string, clientSecret: string, cache: boolean): Promise<string> {
    const body = new URLSearchParams({ grant_type: 'client_credentials' });
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf-8').toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!response.ok) throw new Error(`Spotify authentication failed (${response.status})`);
    const payload = await response.json() as { access_token?: string; expires_in?: number };
    if (!payload.access_token) throw new Error('Spotify authentication returned no access token');
    if (cache) this.accessToken = { value: payload.access_token, expiresAt: Date.now() + (payload.expires_in ?? 3_600) * 1_000 };
    return payload.access_token;
  }
}
