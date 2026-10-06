import { rmsToDb } from './speech-gate.js';

export interface MicLevelMonitorOptions {
  /** MediaDeviceInfo.deviceId; null = system default. */
  deviceId: string | null;
  onLevel: (levelDb: number) => void;
  /** Called when the capture track ends (mic unplugged, device revoked). */
  onEnded?: () => void;
  intervalMs?: number;
}

/** Raw capture: processing would distort the level the threshold is set against. */
const RAW_AUDIO: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

async function openMicrophone(deviceId: string | null): Promise<MediaStream> {
  if (!deviceId) return navigator.mediaDevices.getUserMedia({ audio: RAW_AUDIO, video: false });
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { ...RAW_AUDIO, deviceId: { exact: deviceId } }, video: false });
  } catch (cause) {
    // The saved mic is gone (unplugged, renamed device id) — fall back to
    // the system default rather than leaving the guard without input.
    const name = cause instanceof DOMException ? cause.name : '';
    if (name !== 'OverconstrainedError' && name !== 'NotFoundError') throw cause;
    return navigator.mediaDevices.getUserMedia({ audio: RAW_AUDIO, video: false });
  }
}

/** Samples the microphone level (dBFS) on an interval. Resolves to a stop
 *  function that releases the device. */
export async function startMicLevelMonitor({ deviceId, onLevel, onEnded, intervalMs = 50 }: MicLevelMonitorOptions): Promise<() => void> {
  const stream = await openMicrophone(deviceId);
  const tracks = stream.getAudioTracks();
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode;
  let analyser: AnalyserNode;
  try {
    context = new AudioContext();
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
  } catch (cause) {
    // Release the device — the caller never gets a stop function.
    for (const track of tracks) track.stop();
    void context?.close().catch(() => null);
    throw cause;
  }
  const buffer = new Float32Array(analyser.fftSize);

  const timer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(buffer);
    onLevel(rmsToDb(buffer));
  }, intervalMs);

  const handleEnded = () => onEnded?.();
  for (const track of tracks) track.addEventListener('ended', handleEnded);

  return () => {
    window.clearInterval(timer);
    for (const track of tracks) {
      track.removeEventListener('ended', handleEnded);
      track.stop();
    }
    source.disconnect();
    void context?.close().catch(() => null);
  };
}

/** Audio inputs with their labels. Labels are only exposed after a mic
 *  permission grant, so callers list after a monitor has started. */
export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'audioinput' && device.deviceId !== 'default' && device.deviceId !== 'communications');
}
