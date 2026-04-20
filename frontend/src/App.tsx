import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import { WebcamPostureMonitor } from './components/WebcamPostureMonitor';
import { PomodoroTimer } from './components/PomodoroTimer';
import { ScreenOverlay } from './components/ScreenOverlay';
import { HealthTipsPanel } from './components/HealthTipsPanel';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import HydrationTimer from './components/HydrationTimer';
import { postEvent, startSession } from './api/client';
import {
  requestNotificationPermission,
  registerServiceWorker,
  startAudioKeepAlive,
  unlockAudio,
} from './utils/notifications';

type PostureState = 'good' | 'slouching' | 'neck_bent' | 'no_person';
type DistanceState = 'ok' | 'too_close' | 'uncalibrated';
type Phase = 'idle' | 'focus' | 'short_break' | 'long_break';

function App() {
  const [posture, setPosture] = useState<PostureState>('no_person');
  const [distance, setDistance] = useState<DistanceState>('uncalibrated');
  const [phase, setPhase] = useState<Phase>('idle');
  const [overuseMinutes, setOveruseMinutes] = useState(0);
  const [sessionId, setSessionId] = useState<number | null>(null);

  const [goodPostureTime, setGoodPostureTime] = useState(0);
  const [badPostureTime, setBadPostureTime] = useState(0);

  const [waterGlasses, setWaterGlasses] = useState(0);

  const [breakSecondsLeft, setBreakSecondsLeft] = useState<number>(0);

  // 🔔 Track if notification permission was granted
  const [notifEnabled, setNotifEnabled] = useState(false);

  const lastPostureRef = useRef<PostureState>('no_person');
  const lastDistanceRef = useRef<DistanceState>('uncalibrated');
  const overlayShownRef = useRef(false);

  // 🔔 Register Service Worker immediately on mount
  useEffect(() => {
    registerServiceWorker();
  }, []);

  // 🔔 Request permission + unlock audio + start keepalive on first click
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

  // Global error handler
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
    startSession('pomodoro')
      .then((id) => setSessionId(id))
      .catch((err) => console.error('Failed to start session:', err));
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
      postEvent(
        'posture_state',
        { state: posture, at: new Date().toISOString() },
        sessionId
      );
    }
  }, [posture, sessionId]);

  useEffect(() => {
    if (distance !== lastDistanceRef.current && distance !== 'uncalibrated') {
      lastDistanceRef.current = distance;
      postEvent(
        'distance_state',
        { state: distance, at: new Date().toISOString() },
        sessionId
      );
    }
  }, [distance, sessionId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (sessionId) {
        postEvent(
          'analytics_update',
          {
            goodPostureSeconds: goodPostureTime,
            badPostureSeconds: badPostureTime,
            overuseMinutes,
            waterGlasses,
            phase,
            at: new Date().toISOString(),
          },
          sessionId
        );
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [goodPostureTime, badPostureTime, overuseMinutes, waterGlasses, phase, sessionId]);

  const handleHydrationComplete = () => {
    setWaterGlasses((prev) => prev + 1);

    postEvent(
      'hydration_completed',
      {
        glassNumber: waterGlasses + 1,
        at: new Date().toISOString(),
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
          background:
            'radial-gradient(circle at top left, #1e293b 0%, #020617 45%, #000 100%)',
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

        {/* 🔔 Notification status banner */}
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
          }}
        />

        <section
          style={{
            marginTop: 32,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
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
                Current:{' '}
                <strong style={{ textTransform: 'capitalize' }}>{posture}</strong>
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
                Current:{' '}
                <strong style={{ textTransform: 'capitalize' }}>{distance}</strong>
              </p>
            </div>
          </div>

          <PomodoroTimer
            onPhaseChange={(next) => setPhase(next)}
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
                    at: new Date().toISOString(),
                  },
                  sessionId
                );
              }
            }}
            onBreakTick={(secondsLeft) => setBreakSecondsLeft(secondsLeft)}
          />

          <HydrationTimer onHydrationComplete={handleHydrationComplete} />
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
          <HealthTipsPanel
            posture={posture}
            distance={distance}
            phase={phase}
          />
        </section>

        <AnalyticsDashboard
          posture={posture}
          phase={phase}
          overuseMinutes={overuseMinutes}
          hydrationMinutes={30}
          waterGlasses={waterGlasses}
        />

        <ScreenOverlay
          phase={phase}
          overuseMinutes={overuseMinutes}
          breakSecondsLeft={breakSecondsLeft}
          onOverride={() => {
            setOveruseMinutes(0);
            postEvent(
              'screen_block_overridden',
              { at: new Date().toISOString() },
              sessionId
            );
          }}
          onTakeBreak={() => {
            setOveruseMinutes(0);
            postEvent(
              'break_taken',
              { phase, at: new Date().toISOString() },
              sessionId
            );
          }}
          onShownChange={(shown) => {
            if (shown && !overlayShownRef.current) {
              overlayShownRef.current = true;
              postEvent(
                'screen_block_shown',
                { phase, at: new Date().toISOString() },
                sessionId
              );
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