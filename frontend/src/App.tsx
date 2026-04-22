import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { WebcamPostureMonitor } from './components/WebcamPostureMonitor';
import { PomodoroTimer } from './components/PomodoroTimer';
import { ScreenOverlay } from './components/ScreenOverlay';
import { HealthTipsPanel } from './components/HealthTipsPanel';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import HydrationTimer from './components/HydrationTimer';
import { postEvent, startSession } from './api/client';
import {
  alert as wellnessAlert,
  requestNotificationPermission,
  registerServiceWorker,
  startAudioKeepAlive,
  unlockAudio,
} from './utils/notifications';

type PostureState = 'good' | 'slouching' | 'neck_bent' | 'no_person';
type DistanceState = 'ok' | 'too_close' | 'uncalibrated';
type Phase = 'idle' | 'focus' | 'short_break' | 'long_break';

type PostureTimelinePoint = {
  time: number;
  elapsedSeconds: number;
  slouchPercent: number;
  smoothedSlouchPercent: number;
  zone: 'good' | 'warning' | 'bad';
  isPeak: boolean;
};

type HydrationLog = {
  time: number;
};

type SessionSummary = {
  id: number;
  startedAt: string;
  endedAt: string;
  avgSlouchPercent: number;
  worstSlouchPercent: number;
  hydrationBreaks: number;
};

const POSTURE_SAMPLE_INTERVAL_MS = 2_000;
const POSTURE_ROLLING_WINDOW_MS = 15 * 60_000;
const SMOOTHING_WINDOW_POINTS = 5;
const SLOUCH_ALERT_THRESHOLD = 60;
const SLOUCH_ALERT_DURATION_MS = 30_000;
const SESSION_SUMMARIES_STORAGE_KEY = 'wellness_session_summaries_v1';

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function getZone(value: number): 'good' | 'warning' | 'bad' {
  if (value <= 30) return 'good';
  if (value <= 60) return 'warning';
  return 'bad';
}

function summarizeSession(
  postureTimeline: PostureTimelinePoint[],
  hydrationLogs: HydrationLog[],
  startedAt: number | null,
  endedAt: number
): SessionSummary | null {
  if (!startedAt) return null;

  const values = postureTimeline.map((point) => point.smoothedSlouchPercent);
  if (!values.length && hydrationLogs.length === 0) return null;

  const avg = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const worst = values.length > 0 ? Math.max(...values) : 0;

  return {
    id: endedAt,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    avgSlouchPercent: Number(avg.toFixed(1)),
    worstSlouchPercent: Number(worst.toFixed(1)),
    hydrationBreaks: hydrationLogs.length,
  };
}

function App() {
  const [posture, setPosture] = useState<PostureState>('no_person');
  const [distance, setDistance] = useState<DistanceState>('uncalibrated');
  const [phase, setPhase] = useState<Phase>('idle');
  const [overuseMinutes, setOveruseMinutes] = useState(0);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);

  const [goodPostureTime, setGoodPostureTime] = useState(0);
  const [badPostureTime, setBadPostureTime] = useState(0);

  const [postureTimeline, setPostureTimeline] = useState<PostureTimelinePoint[]>([]);
  const [hydrationLogs, setHydrationLogs] = useState<HydrationLog[]>([]);
  const [sessionSummaries, setSessionSummaries] = useState<SessionSummary[]>([]);
  const [slouchPercent, setSlouchPercent] = useState(0);
  const [angleDeviation, setAngleDeviation] = useState(0);

  const [breakSecondsLeft, setBreakSecondsLeft] = useState<number>(0);

  const [notifEnabled, setNotifEnabled] = useState(false);

  const lastPostureRef = useRef<PostureState>('no_person');
  const lastDistanceRef = useRef<DistanceState>('uncalibrated');
  const overlayShownRef = useRef(false);
  const slouchPercentRef = useRef(0);
  const hydrationLogsRef = useRef<HydrationLog[]>([]);
  const highSlouchSinceRef = useRef<number | null>(null);
  const slouchAlertSentRef = useRef(false);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  useEffect(() => {
    const handleFirstClick = async () => {
      const granted = await requestNotificationPermission();
      setNotifEnabled(granted);
      unlockAudio();
      startAudioKeepAlive();
      document.removeEventListener('click', handleFirstClick);
    };

    document.addEventListener('click', handleFirstClick);
    return () => document.removeEventListener('click', handleFirstClick);
  }, []);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SESSION_SUMMARIES_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as SessionSummary[];
      if (Array.isArray(parsed)) {
        setSessionSummaries(parsed.slice(0, 20));
      }
    } catch (error) {
      console.warn('Failed to load saved session summaries:', error);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (posture === 'good') {
        setGoodPostureTime((prev) => prev + 1);
      } else if (posture !== 'no_person') {
        setBadPostureTime((prev) => prev + 1);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [posture]);

  useEffect(() => {
    if (phase === 'focus') {
      const interval = window.setInterval(() => {
        setOveruseMinutes((prev) => prev + 1);
      }, 60_000);
      return () => window.clearInterval(interval);
    }

    setOveruseMinutes(0);
    return;
  }, [phase]);

  useEffect(() => {
    if (posture !== lastPostureRef.current && posture !== 'no_person') {
      lastPostureRef.current = posture;
      postEvent('posture_state', { state: posture, at: new Date().toISOString() }, sessionId);
    }
  }, [posture, sessionId]);

  useEffect(() => {
    if (distance !== lastDistanceRef.current && distance !== 'uncalibrated') {
      lastDistanceRef.current = distance;
      postEvent('distance_state', { state: distance, at: new Date().toISOString() }, sessionId);
    }
  }, [distance, sessionId]);

  useEffect(() => {
    hydrationLogsRef.current = hydrationLogs;
  }, [hydrationLogs]);

  useEffect(() => {
    slouchPercentRef.current = slouchPercent;
  }, [slouchPercent]);

  useEffect(() => {
    if (phase !== 'focus') return;

    const interval = window.setInterval(() => {
      const now = Date.now();
      const elapsedSeconds = sessionStartedAt ? Math.max(0, Math.floor((now - sessionStartedAt) / 1000)) : 0;
      const currentSlouch = clampPercent(slouchPercentRef.current);

      setPostureTimeline((previous) => {
        const withNewPoint = [
          ...previous,
          {
            time: now,
            elapsedSeconds,
            slouchPercent: currentSlouch,
            smoothedSlouchPercent: currentSlouch,
            zone: getZone(currentSlouch),
            isPeak: false,
          },
        ];

        const cutoff = now - POSTURE_ROLLING_WINDOW_MS;
        const rollingWindow = withNewPoint.filter((point) => point.time >= cutoff);

        const smoothed = rollingWindow.map((point, index, allPoints) => {
          const start = Math.max(0, index - SMOOTHING_WINDOW_POINTS + 1);
          const smoothingWindow = allPoints.slice(start, index + 1);
          const smoothedValue =
            smoothingWindow.reduce((sum, entry) => sum + entry.slouchPercent, 0) / smoothingWindow.length;
          const clampedSmoothedValue = clampPercent(smoothedValue);

          return {
            ...point,
            smoothedSlouchPercent: Number(clampedSmoothedValue.toFixed(1)),
            zone: getZone(clampedSmoothedValue),
            isPeak: false,
          };
        });

        return smoothed.map((point, index, allPoints) => {
          const prev = allPoints[index - 1]?.smoothedSlouchPercent ?? -Infinity;
          const next = allPoints[index + 1]?.smoothedSlouchPercent ?? -Infinity;
          const isPeak =
            point.smoothedSlouchPercent >= 60 &&
            point.smoothedSlouchPercent > prev &&
            point.smoothedSlouchPercent >= next;

          return { ...point, isPeak };
        });
      });
    }, POSTURE_SAMPLE_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [phase, sessionStartedAt]);

  useEffect(() => {
    if (phase !== 'focus') {
      highSlouchSinceRef.current = null;
      slouchAlertSentRef.current = false;
      return;
    }

    const interval = window.setInterval(() => {
      const currentSlouch = slouchPercentRef.current;

      if (posture === 'no_person' || currentSlouch <= SLOUCH_ALERT_THRESHOLD) {
        highSlouchSinceRef.current = null;
        slouchAlertSentRef.current = false;
        return;
      }

      if (!highSlouchSinceRef.current) {
        highSlouchSinceRef.current = Date.now();
      }

      const elapsed = Date.now() - highSlouchSinceRef.current;
      if (elapsed < SLOUCH_ALERT_DURATION_MS || slouchAlertSentRef.current) {
        return;
      }

      slouchAlertSentRef.current = true;
      wellnessAlert('⚠️ Posture Alert', {
        body: 'You have been slouching for over 30 seconds. Please sit upright.',
        voiceMessage: 'Posture warning. Please sit upright now.',
        tag: 'posture-alert',
        soundName: 'posture-alert',
      });

      postEvent(
        'slouch_alert_triggered',
        {
          slouchPercent: Number(currentSlouch.toFixed(1)),
          threshold: SLOUCH_ALERT_THRESHOLD,
          durationMs: SLOUCH_ALERT_DURATION_MS,
          at: new Date().toISOString(),
        },
        sessionId
      );
    }, 1000);

    return () => window.clearInterval(interval);
  }, [phase, posture, sessionId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SESSION_SUMMARIES_STORAGE_KEY, JSON.stringify(sessionSummaries));
    } catch (error) {
      console.warn('Failed to persist session summaries:', error);
    }
  }, [sessionSummaries]);

  const currentSessionSummary = useMemo(
    () => summarizeSession(postureTimeline, hydrationLogs, sessionStartedAt, Date.now()),
    [hydrationLogs, postureTimeline, sessionStartedAt]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      if (sessionId) {
        postEvent(
          'analytics_update',
          {
            goodPostureSeconds: goodPostureTime,
            badPostureSeconds: badPostureTime,
            overuseMinutes,
            hydrationBreaks: hydrationLogs.length,
            avgSlouchPercent: currentSessionSummary?.avgSlouchPercent ?? 0,
            worstSlouchPercent: currentSessionSummary?.worstSlouchPercent ?? 0,
            phase,
            at: new Date().toISOString(),
          },
          sessionId
        );
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [
    badPostureTime,
    currentSessionSummary?.avgSlouchPercent,
    currentSessionSummary?.worstSlouchPercent,
    goodPostureTime,
    hydrationLogs.length,
    overuseMinutes,
    phase,
    sessionId,
  ]);

  const finalizeCurrentSession = () => {
    const endedAt = Date.now();
    const summary = summarizeSession(postureTimeline, hydrationLogsRef.current, sessionStartedAt, endedAt);
    if (!summary) return;

    setSessionSummaries((previous) => [summary, ...previous].slice(0, 20));

    postEvent(
      'session_summary',
      {
        startedAt: summary.startedAt,
        endedAt: summary.endedAt,
        avgSlouchPercent: summary.avgSlouchPercent,
        worstSlouchPercent: summary.worstSlouchPercent,
        hydrationBreaks: summary.hydrationBreaks,
      },
      sessionId
    );
  };

  const handleSessionStart = () => {
    finalizeCurrentSession();

    const startedAt = Date.now();
    setSessionStartedAt(startedAt);
    setPostureTimeline([]);
    setHydrationLogs([]);
    setGoodPostureTime(0);
    setBadPostureTime(0);
    setBreakSecondsLeft(0);

    highSlouchSinceRef.current = null;
    slouchAlertSentRef.current = false;

    startSession('pomodoro')
      .then((id) => setSessionId(id))
      .catch((err) => console.error('Failed to start session:', err));
  };

  const handleHydrationLogged = () => {
    const now = Date.now();
    const currentCount = hydrationLogsRef.current.length + 1;
    const nextLog = { time: now };

    setHydrationLogs((previous) => [...previous, nextLog]);

    postEvent(
      'hydration_completed',
      {
        hydrationBreakNumber: currentCount,
        at: new Date(now).toISOString(),
      },
      sessionId
    );
  };

  return (
    <div className="App">
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '32px 16px 48px',
          background: 'radial-gradient(circle at top left, #1e293b 0%, #020617 45%, #000 100%)',
          color: '#e5e7eb',
        }}
      >
        <h1
          style={{
            fontSize: '2.5rem',
            marginBottom: 8,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          Digital Wellness Assistant
        </h1>

        <p style={{ marginBottom: 24, color: '#9ca3af', maxWidth: 640 }}>
          Live posture and screen distance monitoring to keep you comfortable,
          focused, and healthy while you study or work.
        </p>

        {!notifEnabled && (
          <div
            style={{
              marginBottom: 16,
              padding: '8px 20px',
              borderRadius: 999,
              background: 'rgba(250,204,21,0.15)',
              border: '1px solid rgba(250,204,21,0.4)',
              color: '#fde68a',
              fontSize: 13,
              cursor: 'pointer',
            }}
            onClick={async () => {
              const granted = await requestNotificationPermission();
              setNotifEnabled(granted);
              unlockAudio();
              startAudioKeepAlive();
            }}
          >
            🔔 Click here to enable notifications — alerts will work even when minimized
          </div>
        )}

        <WebcamPostureMonitor
          onStateChange={(state) => {
            setPosture(state.posture);
            setDistance(state.distance);
            setSlouchPercent(state.slouchPercent);
            setAngleDeviation(state.angleDeviation);
          }}
        />

        <section
          style={{
            marginTop: 32,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 20,
            width: '100%',
            maxWidth: 1120,
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: 'rgba(15,23,42,0.85)',
                border: '1px solid rgba(148,163,184,0.3)',
              }}
            >
              <h2 style={{ fontSize: '1.1rem', marginBottom: 8 }}>Posture</h2>
              <p style={{ margin: 0, fontSize: 14, color: '#9ca3af' }}>
                Current: <strong style={{ textTransform: 'capitalize' }}>{posture}</strong>
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#86efac' }}>
                Slouch: <strong>{Math.round(slouchPercent)}%</strong>
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#fcd34d' }}>
                Angle deviation: <strong>{angleDeviation.toFixed(1)}°</strong>
              </p>
            </div>

            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: 'rgba(15,23,42,0.85)',
                border: '1px solid rgba(148,163,184,0.3)',
              }}
            >
              <h2 style={{ fontSize: '1.1rem', marginBottom: 8 }}>Distance</h2>
              <p style={{ margin: 0, fontSize: 14, color: '#9ca3af' }}>
                Current: <strong style={{ textTransform: 'capitalize' }}>{distance}</strong>
              </p>
            </div>
          </div>

          <PomodoroTimer
            onPhaseChange={(next) => setPhase(next)}
            onSessionStart={handleSessionStart}
            onCycleComplete={(data) => {
              setOveruseMinutes(0);

              if (data.phase === 'focus') {
                postEvent(
                  'focus_cycle_completed',
                  {
                    phase: data.phase,
                    plannedMinutes: data.plannedMinutes,
                    actualSeconds: data.actualSeconds,
                    goodPostureSeconds: goodPostureTime,
                    badPostureSeconds: badPostureTime,
                    avgSlouchPercent: currentSessionSummary?.avgSlouchPercent ?? 0,
                    worstSlouchPercent: currentSessionSummary?.worstSlouchPercent ?? 0,
                    at: new Date().toISOString(),
                  },
                  sessionId
                );
              }
            }}
            onBreakTick={(secondsLeft) => setBreakSecondsLeft(secondsLeft)}
          />

          <HydrationTimer onHydrationLogged={handleHydrationLogged} />
        </section>

        <section
          style={{
            marginTop: 24,
            width: '100%',
            maxWidth: 1120,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <HealthTipsPanel posture={posture} distance={distance} phase={phase} />
        </section>

        <AnalyticsDashboard
          posture={posture}
          phase={phase}
          overuseMinutes={overuseMinutes}
          postureTimeline={postureTimeline}
          hydrationLogs={hydrationLogs}
          currentSessionSummary={currentSessionSummary}
          latestCompletedSession={sessionSummaries[0] ?? null}
        />

        <ScreenOverlay
          phase={phase}
          overuseMinutes={overuseMinutes}
          breakSecondsLeft={breakSecondsLeft}
          onOverride={() => {
            setOveruseMinutes(0);
            postEvent('screen_block_overridden', { at: new Date().toISOString() }, sessionId);
          }}
          onTakeBreak={() => {
            setOveruseMinutes(0);
            postEvent('break_taken', { phase, at: new Date().toISOString() }, sessionId);
          }}
          onShownChange={(shown) => {
            if (shown && !overlayShownRef.current) {
              overlayShownRef.current = true;
              postEvent('screen_block_shown', { phase, at: new Date().toISOString() }, sessionId);
            }
            if (!shown) {
              overlayShownRef.current = false;
            }
          }}
        />
      </main>
    </div>
  );
}

export default App;
