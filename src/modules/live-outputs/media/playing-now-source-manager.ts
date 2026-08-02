import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  LiveOutputControlAction,
  PlayingNowLiveOutputConfig,
  PlayingNowSourceCapability,
  PlayingNowTrackSnapshot,
} from '../../../shared/types.js';

const execFile = promisify(execFileCallback);

interface WindowsMediaResult {
  sources?: PlayingNowSourceCapability[];
  track?: PlayingNowTrackSnapshot;
  ok?: boolean;
}

export class PlayingNowSourceManager {
  private lastAutoSourceId: string | null = null;
  private lastAutoSourceAt = 0;

  async listSources(): Promise<PlayingNowSourceCapability[]> {
    if (process.platform === 'win32') {
      try {
        const result = await invokeWindowsMedia({ action: 'list' });
        return result.sources ?? [];
      } catch (cause) {
        return [unavailableSource('windows-system', 'Windows media sessions', cause)];
      }
    }
    if (process.platform === 'linux') {
      return [unavailableSource('linux-mpris', 'Linux MPRIS', 'MPRIS provider is not initialized')];
    }
    return [unavailableSource('macos-system', 'macOS media controls', 'macOS does not expose a stable public system-wide Now Playing API')];
  }

  async read(config: PlayingNowLiveOutputConfig): Promise<PlayingNowTrackSnapshot> {
    if (process.platform !== 'win32') return idleTrack();
    const requestedSourceId = config.sourceMode === 'pinned' ? config.sourceId : this.stableAutoSource();
    try {
      const result = await invokeWindowsMedia({
        action: 'get',
        sourceId: requestedSourceId,
        fallbackToCurrent: config.sourceMode === 'auto' || config.fallbackToSystemSession,
      });
      const track = result.track ?? idleTrack();
      if (config.sourceMode === 'auto' && track.sourceId) {
        this.lastAutoSourceId = track.sourceId;
        this.lastAutoSourceAt = Date.now();
      }
      return track;
    } catch {
      return idleTrack('error');
    }
  }

  async test(sourceId: string): Promise<PlayingNowTrackSnapshot> {
    if (process.platform !== 'win32') return idleTrack('unavailable');
    const result = await invokeWindowsMedia({ action: 'get', sourceId, fallbackToCurrent: false });
    return result.track ?? idleTrack();
  }

  async control(sourceId: string | null, action: LiveOutputControlAction): Promise<void> {
    if (process.platform !== 'win32') throw new Error('Media controls are unavailable on this operating system');
    const result = await invokeWindowsMedia({ action: 'control', sourceId, control: action, fallbackToCurrent: !sourceId });
    if (!result.ok) throw new Error('The selected media session rejected the control');
  }

  private stableAutoSource(): string | null {
    return this.lastAutoSourceId && Date.now() - this.lastAutoSourceAt < 3_000 ? this.lastAutoSourceId : null;
  }
}

function idleTrack(state: PlayingNowTrackSnapshot['state'] = 'idle'): PlayingNowTrackSnapshot {
  return {
    sourceId: null, sourceLabel: null, state,
    artist: '', song: '', album: '', artworkPath: null,
    positionSeconds: null, durationSeconds: null,
  };
}

function unavailableSource(id: string, label: string, cause: unknown): PlayingNowSourceCapability {
  return {
    id, label, applicationId: id, status: 'unavailable', sourceType: 'system-session',
    canPlay: false, canPause: false, canStop: false, canPrevious: false, canNext: false,
    error: cause instanceof Error ? cause.message : String(cause),
  };
}

async function invokeWindowsMedia(payload: { action: 'list' | 'get' | 'control'; sourceId?: string | null; control?: string; fallbackToCurrent?: boolean }): Promise<WindowsMediaResult> {
  const jsonBase64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');
  const script = WINDOWS_MEDIA_SCRIPT.replace('__PAYLOAD__', jsonBase64);
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    timeout: 8_000,
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!line) throw new Error('Windows media bridge returned no data');
  return JSON.parse(line) as WindowsMediaResult;
}

const WINDOWS_MEDIA_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__PAYLOAD__')) | ConvertFrom-Json
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
function Await-WinRT($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1
  } | Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}
function Source-Id($session) { return 'windows:' + $session.SourceAppUserModelId }
function Session-Capability($session) {
  $controls = $session.GetPlaybackInfo().Controls
  return [ordered]@{
    id = Source-Id $session
    label = $session.SourceAppUserModelId
    applicationId = $session.SourceAppUserModelId
    status = 'available'
    sourceType = 'system-session'
    canPlay = [bool]$controls.IsPlayEnabled
    canPause = [bool]$controls.IsPauseEnabled
    canStop = [bool]$controls.IsStopEnabled
    canPrevious = [bool]$controls.IsPreviousEnabled
    canNext = [bool]$controls.IsNextEnabled
    error = $null
  }
}
function Session-Track($session) {
  if ($null -eq $session) { return $null }
  $properties = Await-WinRT $session.TryGetMediaPropertiesAsync() ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $playback = $session.GetPlaybackInfo()
  $timeline = $session.GetTimelineProperties()
  $status = switch ([string]$playback.PlaybackStatus) {
    'Playing' { 'playing' }
    'Paused' { 'paused' }
    'Stopped' { 'stopped' }
    default { 'idle' }
  }
  return [ordered]@{
    sourceId = Source-Id $session
    sourceLabel = $session.SourceAppUserModelId
    state = $status
    artist = [string]$properties.Artist
    song = [string]$properties.Title
    album = [string]$properties.AlbumTitle
    artworkPath = $null
    positionSeconds = [math]::Max(0, $timeline.Position.TotalSeconds)
    durationSeconds = [math]::Max(0, ($timeline.EndTime - $timeline.StartTime).TotalSeconds)
  }
}
function Legacy-Processes {
  return @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -and @('spotify', 'foobar2000', 'winamp', 'vlc', 'itunes', 'music') -contains $_.ProcessName.ToLowerInvariant()
  })
}
function Legacy-Source-Id($process) { return 'window:' + $process.ProcessName.ToLowerInvariant() + ':' + $process.Id }
function Legacy-Capability($process) {
  return [ordered]@{
    id = Legacy-Source-Id $process
    label = $process.ProcessName + ' (window title)'
    applicationId = $process.ProcessName
    status = 'available'
    sourceType = 'window-title'
    canPlay = $false
    canPause = $false
    canStop = $false
    canPrevious = $false
    canNext = $false
    error = $null
  }
}
function Legacy-Track($process) {
  if ($null -eq $process) { return $null }
  $artist = ''
  $song = [string]$process.MainWindowTitle
  $album = ''
  $name = $process.ProcessName.ToLowerInvariant()
  if ($name -eq 'itunes') {
    try {
      $itunes = [Runtime.InteropServices.Marshal]::GetActiveObject('iTunes.Application')
      $track = $itunes.CurrentTrack
      if ($null -ne $track) {
        $artist = [string]$track.Artist
        $song = [string]$track.Name
        $album = [string]$track.Album
      }
    } catch { }
  }
  if (-not $artist) {
    $song = $song -replace '^\d+\.\s*', ''
    $song = $song -replace '\s+-\s+(Winamp|VLC media player)$', ''
    $song = $song -replace '\s+\[foobar2000\]$', ''
    if ($song.Contains('♫')) {
      $parts = @($song.Split('♫') | ForEach-Object { ([string]$_).Trim().Trim("'") })
      if ($parts.Count -ge 2) { $song = $parts[0]; $artist = $parts[1] }
    } elseif ($song.Contains(' - ')) {
      $parts = @($song.Split(@(' - '), 2, [StringSplitOptions]::None))
      if ($parts.Count -eq 2) { $artist = $parts[0].Trim(); $song = $parts[1].Trim() }
    }
  }
  return [ordered]@{
    sourceId = Legacy-Source-Id $process
    sourceLabel = $process.ProcessName
    state = 'playing'
    artist = $artist
    song = $song
    album = $album
    artworkPath = $null
    positionSeconds = $null
    durationSeconds = $null
  }
}
$manager = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$sessions = @($manager.GetSessions())
$legacy = @(Legacy-Processes)
if ($payload.action -eq 'list') {
  $sources = @($sessions | ForEach-Object { Session-Capability $_ })
  $sessionApps = @($sessions | ForEach-Object { ([string]$_.SourceAppUserModelId).ToLowerInvariant() })
  $sources += @($legacy | Where-Object {
    $processName = $_.ProcessName.ToLowerInvariant()
    -not ($sessionApps | Where-Object { $_.Contains($processName) })
  } | ForEach-Object { Legacy-Capability $_ })
  [ordered]@{ sources = $sources } | ConvertTo-Json -Compress -Depth 6
  exit
}
$session = $null
if ($payload.sourceId -and ([string]$payload.sourceId).StartsWith('window:')) {
  $legacyProcess = $legacy | Where-Object { (Legacy-Source-Id $_) -eq [string]$payload.sourceId } | Select-Object -First 1
  if ($payload.action -eq 'get') {
    [ordered]@{ track = Legacy-Track $legacyProcess } | ConvertTo-Json -Compress -Depth 6
    exit
  }
}
if ($payload.sourceId) { $session = $sessions | Where-Object { (Source-Id $_) -eq [string]$payload.sourceId } | Select-Object -First 1 }
if ($null -eq $session -and ((-not $payload.sourceId) -or [bool]$payload.fallbackToCurrent)) { $session = $manager.GetCurrentSession() }
if ($payload.action -eq 'get') {
  $track = Session-Track $session
  if ($null -eq $track -and ((-not $payload.sourceId) -or [bool]$payload.fallbackToCurrent)) { $track = Legacy-Track ($legacy | Select-Object -First 1) }
  [ordered]@{ track = $track } | ConvertTo-Json -Compress -Depth 6
  exit
}
if ($null -eq $session) { [ordered]@{ ok = $false } | ConvertTo-Json -Compress; exit }
$operation = switch ([string]$payload.control) {
  'play' { $session.TryPlayAsync() }
  'pause' { $session.TryPauseAsync() }
  'stop' { $session.TryStopAsync() }
  'previous' { $session.TrySkipPreviousAsync() }
  'next' { $session.TrySkipNextAsync() }
  default { $null }
}
if ($null -eq $operation) { [ordered]@{ ok = $false } | ConvertTo-Json -Compress; exit }
$ok = Await-WinRT $operation ([bool])
[ordered]@{ ok = [bool]$ok } | ConvertTo-Json -Compress
`;
