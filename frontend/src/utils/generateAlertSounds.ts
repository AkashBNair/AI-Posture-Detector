/**
 * Generates custom alert sounds using Web Audio API.
 * Creates unique sounds for each alert type.
 * Call generateAndDownloadAll() from the browser console to download them.
 */

type ToneConfig = {
  frequency: number;
  duration: number;
  type: OscillatorType;
  volume: number;
  fadeOut?: boolean;
};

type AlertSound = {
  name: string;
  tones: { startTime: number; config: ToneConfig }[];
};

// ── Alert Sound Definitions ───────────────────────────────────────

const ALERT_SOUNDS: AlertSound[] = [
  {
    // 💧 Water drop sound — soft, pleasant
    name: 'water-alert',
    tones: [
      { startTime: 0.0, config: { frequency: 1200, duration: 0.08, type: 'sine', volume: 0.4, fadeOut: true } },
      { startTime: 0.1, config: { frequency: 800, duration: 0.15, type: 'sine', volume: 0.5, fadeOut: true } },
      { startTime: 0.3, config: { frequency: 600, duration: 0.2, type: 'sine', volume: 0.3, fadeOut: true } },
    ],
  },
  {
    // ⚠️ Posture alert — attention-grabbing double beep
    name: 'posture-alert',
    tones: [
      { startTime: 0.0, config: { frequency: 880, duration: 0.15, type: 'triangle', volume: 0.5 } },
      { startTime: 0.25, config: { frequency: 880, duration: 0.15, type: 'triangle', volume: 0.5 } },
      { startTime: 0.5, config: { frequency: 1100, duration: 0.2, type: 'triangle', volume: 0.4, fadeOut: true } },
    ],
  },
  {
    // 📏 Distance alert — rising tone warning
    name: 'distance-alert',
    tones: [
      { startTime: 0.0, config: { frequency: 400, duration: 0.15, type: 'square', volume: 0.3 } },
      { startTime: 0.2, config: { frequency: 600, duration: 0.15, type: 'square', volume: 0.35 } },
      { startTime: 0.4, config: { frequency: 800, duration: 0.2, type: 'square', volume: 0.3, fadeOut: true } },
    ],
  },
  {
    // ⏸️ Break start — calm chime
    name: 'break-start',
    tones: [
      { startTime: 0.0, config: { frequency: 523, duration: 0.3, type: 'sine', volume: 0.4, fadeOut: true } },
      { startTime: 0.35, config: { frequency: 659, duration: 0.3, type: 'sine', volume: 0.4, fadeOut: true } },
      { startTime: 0.7, config: { frequency: 784, duration: 0.4, type: 'sine', volume: 0.35, fadeOut: true } },
    ],
  },
  {
    // 🚀 Focus start — energizing rising tones
    name: 'focus-start',
    tones: [
      { startTime: 0.0, config: { frequency: 440, duration: 0.12, type: 'sine', volume: 0.4 } },
      { startTime: 0.15, config: { frequency: 554, duration: 0.12, type: 'sine', volume: 0.4 } },
      { startTime: 0.3, config: { frequency: 659, duration: 0.12, type: 'sine', volume: 0.45 } },
      { startTime: 0.45, config: { frequency: 880, duration: 0.3, type: 'sine', volume: 0.5, fadeOut: true } },
    ],
  },
  {
    // 🔔 Generic alert — simple notification ding
    name: 'alert',
    tones: [
      { startTime: 0.0, config: { frequency: 1000, duration: 0.12, type: 'sine', volume: 0.5 } },
      { startTime: 0.2, config: { frequency: 1200, duration: 0.15, type: 'sine', volume: 0.45 } },
      { startTime: 0.45, config: { frequency: 1000, duration: 0.25, type: 'sine', volume: 0.4, fadeOut: true } },
    ],
  },
];

// ── Sound Generator ───────────────────────────────────────────────

async function generateSound(sound: AlertSound): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const totalDuration = Math.max(
    ...sound.tones.map((t) => t.startTime + t.config.duration)
  ) + 0.1; // small padding

  const offlineCtx = new OfflineAudioContext(1, sampleRate * totalDuration, sampleRate);

  for (const tone of sound.tones) {
    const { frequency, duration, type, volume, fadeOut } = tone.config;

    const oscillator = offlineCtx.createOscillator();
    const gainNode = offlineCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(offlineCtx.destination);

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    gainNode.gain.setValueAtTime(volume, tone.startTime);

    if (fadeOut) {
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        tone.startTime + duration
      );
    } else {
      gainNode.gain.setValueAtTime(volume, tone.startTime + duration - 0.01);
      gainNode.gain.linearRampToValueAtTime(0, tone.startTime + duration);
    }

    oscillator.start(tone.startTime);
    oscillator.stop(tone.startTime + duration);
  }

  return offlineCtx.startRendering();
}

// ── Convert AudioBuffer to WAV Blob ───────────────────────────────

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Audio data
  const channelData = buffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ── Download a single sound ───────────────────────────────────────

async function downloadSound(sound: AlertSound): Promise<void> {
  const buffer = await generateSound(sound);
  const blob = audioBufferToWav(buffer);
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${sound.name}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log(`✅ Downloaded: ${sound.name}.wav`);
}

// ── Download all sounds ───────────────────────────────────────────

export async function generateAndDownloadAll(): Promise<void> {
  console.log('🔊 Generating alert sounds...');
  for (const sound of ALERT_SOUNDS) {
    await downloadSound(sound);
  }
  console.log('✅ All sounds downloaded! Move them to public/ folder.');
}

// ── Preview a sound (play without downloading) ────────────────────

export async function previewSound(name: string): Promise<void> {
  const sound = ALERT_SOUNDS.find((s) => s.name === name);
  if (!sound) {
    console.error(`Sound "${name}" not found. Available: ${ALERT_SOUNDS.map(s => s.name).join(', ')}`);
    return;
  }

  const buffer = await generateSound(sound);

  const ctx = new AudioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();

  console.log(`🔊 Playing: ${name}`);
}

// ── Generate blobs for runtime use (no download needed) ───────────

const soundCache: Map<string, HTMLAudioElement> = new Map();

export async function getAlertAudio(name: string): Promise<HTMLAudioElement | null> {
  if (soundCache.has(name)) {
    return soundCache.get(name)!;
  }

  const sound = ALERT_SOUNDS.find((s) => s.name === name);
  if (!sound) return null;

  const buffer = await generateSound(sound);
  const blob = audioBufferToWav(buffer);
  const url = URL.createObjectURL(blob);

  const audio = new Audio(url);
  audio.volume = 1;
  soundCache.set(name, audio);

  return audio;
}

// Make functions available in browser console for testing
if (typeof window !== 'undefined') {
  (window as any).generateAlertSounds = generateAndDownloadAll;
  (window as any).previewAlertSound = previewSound;
}