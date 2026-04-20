/**
 * Centralized alert system.
 * Timers run in Service Worker — works even when tab is minimized/background.
 * Voice alerts play when tab becomes visible again.
 */

// ══════════════════════════════════════════════════════════════════
// SECTION 1: CUSTOM SOUND GENERATOR
// ══════════════════════════════════════════════════════════════════

type ToneConfig = {
  frequency: number;
  duration: number;
  type: OscillatorType;
  volume: number;
  fadeOut?: boolean;
};

type AlertSoundDef = {
  name: string;
  tones: { startTime: number; config: ToneConfig }[];
};

const ALERT_SOUNDS: AlertSoundDef[] = [
  {
    name: 'water-alert',
    tones: [
      { startTime: 0.0, config: { frequency: 1200, duration: 0.08, type: 'sine', volume: 0.4, fadeOut: true } },
      { startTime: 0.1, config: { frequency: 800, duration: 0.15, type: 'sine', volume: 0.5, fadeOut: true } },
      { startTime: 0.3, config: { frequency: 600, duration: 0.2, type: 'sine', volume: 0.3, fadeOut: true } },
    ],
  },
  {
    name: 'posture-alert',
    tones: [
      { startTime: 0.0, config: { frequency: 880, duration: 0.15, type: 'triangle', volume: 0.5 } },
      { startTime: 0.25, config: { frequency: 880, duration: 0.15, type: 'triangle', volume: 0.5 } },
      { startTime: 0.5, config: { frequency: 1100, duration: 0.2, type: 'triangle', volume: 0.4, fadeOut: true } },
    ],
  },
  {
    name: 'distance-alert',
    tones: [
      { startTime: 0.0, config: { frequency: 400, duration: 0.15, type: 'square', volume: 0.3 } },
      { startTime: 0.2, config: { frequency: 600, duration: 0.15, type: 'square', volume: 0.35 } },
      { startTime: 0.4, config: { frequency: 800, duration: 0.2, type: 'square', volume: 0.3, fadeOut: true } },
    ],
  },
  {
    name: 'break-start',
    tones: [
      { startTime: 0.0, config: { frequency: 523, duration: 0.3, type: 'sine', volume: 0.4, fadeOut: true } },
      { startTime: 0.35, config: { frequency: 659, duration: 0.3, type: 'sine', volume: 0.4, fadeOut: true } },
      { startTime: 0.7, config: { frequency: 784, duration: 0.4, type: 'sine', volume: 0.35, fadeOut: true } },
    ],
  },
  {
    name: 'focus-start',
    tones: [
      { startTime: 0.0, config: { frequency: 440, duration: 0.12, type: 'sine', volume: 0.4 } },
      { startTime: 0.15, config: { frequency: 554, duration: 0.12, type: 'sine', volume: 0.4 } },
      { startTime: 0.3, config: { frequency: 659, duration: 0.12, type: 'sine', volume: 0.45 } },
      { startTime: 0.45, config: { frequency: 880, duration: 0.3, type: 'sine', volume: 0.5, fadeOut: true } },
    ],
  },
  {
    name: 'alert',
    tones: [
      { startTime: 0.0, config: { frequency: 1000, duration: 0.12, type: 'sine', volume: 0.5 } },
      { startTime: 0.2, config: { frequency: 1200, duration: 0.15, type: 'sine', volume: 0.45 } },
      { startTime: 0.45, config: { frequency: 1000, duration: 0.25, type: 'sine', volume: 0.4, fadeOut: true } },
    ],
  },
];

async function generateSound(sound: AlertSoundDef): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const totalDuration = Math.max(...sound.tones.map((t) => t.startTime + t.config.duration)) + 0.1;
  const offlineCtx = new OfflineAudioContext(1, sampleRate * totalDuration, sampleRate);

  for (const tone of sound.tones) {
    const { frequency, duration, type, volume, fadeOut } = tone.config;
    const osc = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();
    osc.connect(gain);
    gain.connect(offlineCtx.destination);
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, tone.startTime);
    if (fadeOut) {
      gain.gain.exponentialRampToValueAtTime(0.001, tone.startTime + duration);
    } else {
      gain.gain.setValueAtTime(volume, tone.startTime + duration - 0.01);
      gain.gain.linearRampToValueAtTime(0, tone.startTime + duration);
    }
    osc.start(tone.startTime);
    osc.stop(tone.startTime + duration);
  }

  return offlineCtx.startRendering();
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const dataSize = buffer.length * 2;
  const totalSize = 44 + dataSize;
  const ab = new ArrayBuffer(totalSize);
  const v = new DataView(ab);

  function w(o: number, s: string) { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }

  w(0, 'RIFF'); v.setUint32(4, totalSize - 8, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, bitDepth, true); w(36, 'data'); v.setUint32(40, dataSize, true);

  const ch = buffer.getChannelData(0);
  let off = 44;
  for (let i = 0; i < buffer.length; i++) {
    const s = Math.max(-1, Math.min(1, ch[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([ab], { type: 'audio/wav' });
}

const soundCache: Map<string, HTMLAudioElement> = new Map();

async function getAlertAudio(name: string): Promise<HTMLAudioElement | null> {
  if (soundCache.has(name)) return soundCache.get(name)!;
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

async function playSound(name: string) {
  try {
    const audio = await getAlertAudio(name);
    if (!audio) return;
    audio.currentTime = 0;
    await audio.play();
  } catch (err) {
    console.warn(`Sound "${name}" failed:`, err);
  }
}

async function preloadSounds() {
  for (const sound of ALERT_SOUNDS) {
    await getAlertAudio(sound.name);
  }
}

// ══════════════════════════════════════════════════════════════════
// SECTION 2: SERVICE WORKER REGISTRATION + COMMUNICATION
// ══════════════════════════════════════════════════════════════════

let swRegistration: ServiceWorkerRegistration | null = null;

// Callbacks that components register to receive SW messages
type TimerCompleteCallback = (timerId: string, alertConfig: any) => void;
type TimerTickCallback = (timerId: string, secondsLeft: number) => void;

const timerCompleteCallbacks: Map<string, TimerCompleteCallback> = new Map();
const timerTickCallbacks: Map<string, TimerTickCallback> = new Map();

export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Workers not supported — background alerts will not work');
    return;
  }

  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    console.log('✅ Service Worker registered — background timers enabled');

    // Listen for messages FROM the Service Worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data;

      if (data.type === 'TIMER_COMPLETE') {
        // Play sound + voice when timer completes
        const soundName = data.alertConfig?.soundName || 'alert';
        playSound(soundName);
        setTimeout(() => speak(data.alertConfig?.voiceMessage || data.alertConfig?.title || ''), 800);

        // Notify registered callback
        const cb = timerCompleteCallbacks.get(data.timerId);
        if (cb) cb(data.timerId, data.alertConfig);
      }

      if (data.type === 'TIMER_TICK') {
        const cb = timerTickCallbacks.get(data.timerId);
        if (cb) cb(data.timerId, data.secondsLeft);
      }

      if (data.type === 'TIMER_STOPPED') {
        // Timer was stopped
      }
    });
  } catch (err) {
    console.warn('Service Worker registration failed:', err);
  }
}

// ── Send message to Service Worker ────────────────────────────────

function sendToSW(message: any) {
  if (swRegistration?.active) {
    swRegistration.active.postMessage(message);
  } else if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage(message);
  } else {
    console.warn('No active Service Worker — timer will only work in foreground');
  }
}

// ══════════════════════════════════════════════════════════════════
// SECTION 3: BACKGROUND TIMER API (what components use)
// ══════════════════════════════════════════════════════════════════

export interface TimerAlertConfig {
  title: string;
  body: string;
  voiceMessage?: string;
  soundName?: string;
  tag?: string;
  urgent?: boolean;
}

/**
 * Start a timer that runs in the Service Worker (background-safe).
 * When it completes, it shows a notification + plays sound + voice.
 */
export function startBackgroundTimer(
  timerId: string,
  durationMs: number,
  alertConfig: TimerAlertConfig,
  repeat: boolean = false
) {
  sendToSW({
    type: 'START_TIMER',
    timerId,
    durationMs,
    alertConfig,
    repeat,
  });
}

/**
 * Stop a running background timer.
 */
export function stopBackgroundTimer(timerId: string) {
  sendToSW({ type: 'STOP_TIMER', timerId });
}

/**
 * Register a callback for when a specific timer completes.
 */
export function onTimerComplete(timerId: string, callback: TimerCompleteCallback) {
  timerCompleteCallbacks.set(timerId, callback);
}

/**
 * Register a callback for timer tick updates (every second).
 */
export function onTimerTick(timerId: string, callback: TimerTickCallback) {
  timerTickCallbacks.set(timerId, callback);
}

/**
 * Remove all callbacks for a timer.
 */
export function removeTimerCallbacks(timerId: string) {
  timerCompleteCallbacks.delete(timerId);
  timerTickCallbacks.delete(timerId);
}

// ══════════════════════════════════════════════════════════════════
// SECTION 4: NOTIFICATION PERMISSION
// ══════════════════════════════════════════════════════════════════

let permissionRequested = false;

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  if (!permissionRequested) {
    permissionRequested = true;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }
  return false;
}

// ══════════════════════════════════════════════════════════════════
// SECTION 5: AUDIO KEEPALIVE
// ══════════════════════════════════════════════════════════════════

let keepAliveAudioCtx: AudioContext | null = null;
let keepAliveStarted = false;

export function startAudioKeepAlive() {
  if (keepAliveStarted) return;
  keepAliveStarted = true;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    keepAliveAudioCtx = new AudioCtx();
    const osc = keepAliveAudioCtx.createOscillator();
    const gain = keepAliveAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(keepAliveAudioCtx.destination);
    gain.gain.value = 0;
    osc.frequency.value = 1;
    osc.start();

    setInterval(() => {
      if (keepAliveAudioCtx?.state === 'suspended') {
        keepAliveAudioCtx.resume().catch(() => {});
      }
    }, 10_000);
  } catch {}
}

// ══════════════════════════════════════════════════════════════════
// SECTION 6: UNLOCK + VOICE
// ══════════════════════════════════════════════════════════════════

export function unlockAudio() {
  soundCache.forEach((audio) => {
    audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {});
  });
  if ('speechSynthesis' in window) {
    speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  }
  preloadSounds();
}

export function speak(message: string) {
  if (!('speechSynthesis' in window)) return;
  if (keepAliveAudioCtx?.state === 'suspended') {
    keepAliveAudioCtx.resume().catch(() => {});
  }
  const speech = new SpeechSynthesisUtterance(message);
  speech.rate = 0.95;
  speech.pitch = 1.1;
  speech.volume = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(speech);
}

// ══════════════════════════════════════════════════════════════════
// SECTION 7: DIRECT ALERT (for posture/distance — not timer-based)
// ══════════════════════════════════════════════════════════════════

export function alert(
  title: string,
  options?: {
    body?: string;
    voiceMessage?: string;
    tag?: string;
    urgent?: boolean;
    soundName?: string;
  }
) {
  const body = options?.body || '';
  const voice = options?.voiceMessage || title;
  const tag = options?.tag || 'wellness-alert';
  const urgent = options?.urgent ?? false;
  const soundName = options?.soundName || 'alert';

  // OS notification via SW
  sendToSW({
    type: 'SHOW_NOTIFICATION',
    title,
    body,
    tag,
    urgent,
  });

  // Custom sound
  playSound(soundName);

  // Voice
  setTimeout(() => speak(voice), 800);
}