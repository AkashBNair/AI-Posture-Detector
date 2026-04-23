import React, { useEffect, useMemo, useState } from 'react';
import {
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { getApiBaseUrl } from '../api/baseUrl';
import { getOrCreateClientId } from '../api/client';

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

type Props = {
  posture: string;
  phase: string;
  overuseMinutes: number;
  postureTimeline: PostureTimelinePoint[];
  hydrationLogs: HydrationLog[];
  currentSessionSummary: SessionSummary | null;
  latestCompletedSession: SessionSummary | null;
};

function formatTimerSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatHydrationInterval(minutes: number | null): string {
  if (minutes === null) return 'Need at least 2 hydration logs';
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes.toFixed(1)} min`;

  const hours = minutes / 60;
  return `${hours.toFixed(1)} hr`;
}

export const AnalyticsDashboard: React.FC<Props> = ({
  posture,
  phase,
  overuseMinutes,
  postureTimeline,
  hydrationLogs,
  currentSessionSummary,
  latestCompletedSession,
}) => {
  const [focusData, setFocusData] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const clientId = getOrCreateClientId();
        const res = await fetch(`${getApiBaseUrl()}/analytics/summary`, {
          headers: {
            'X-Client-Id': clientId,
          },
        });
        if (!res.ok) {
          throw new Error(`Analytics API returned ${res.status}`);
        }
        const data = await res.json();

        if (data) {
          setFocusData([
            { name: 'Focus Sessions', value: data.focus_sessions },
            { name: 'Total Minutes', value: Math.round(data.total_focus_minutes) },
          ]);
        }
      } catch (err) {
        console.error('Analytics fetch failed', err);
        setFocusData([
          { name: 'Focus Sessions', value: 0 },
          { name: 'Total Minutes', value: 0 },
        ]);
      }
    };

    fetchAnalytics();
  }, []);

  const currentSlouch = postureTimeline.length
    ? postureTimeline[postureTimeline.length - 1].smoothedSlouchPercent
    : 0;

  const postureScore = Math.max(0, Math.round(100 - currentSlouch));
  const avgSlouch = currentSessionSummary?.avgSlouchPercent ?? 0;
  const worstSlouch = currentSessionSummary?.worstSlouchPercent ?? 0;

  const eyeAlerts = overuseMinutes > 40 ? 'High' : 'Normal';

  const averageHydrationIntervalMinutes = useMemo(() => {
    if (hydrationLogs.length < 2) return null;

    const sortedTimes = hydrationLogs
      .map((log) => log.time)
      .sort((left, right) => left - right);

    let totalGapMs = 0;
    for (let i = 1; i < sortedTimes.length; i += 1) {
      totalGapMs += sortedTimes[i] - sortedTimes[i - 1];
    }

    return totalGapMs / (sortedTimes.length - 1) / 60_000;
  }, [hydrationLogs]);

  const chartData = useMemo(
    () =>
      postureTimeline.map((point) => ({
        ...point,
        goodValue: point.zone === 'good' ? point.smoothedSlouchPercent : null,
        warningValue: point.zone === 'warning' ? point.smoothedSlouchPercent : null,
        badValue: point.zone === 'bad' ? point.smoothedSlouchPercent : null,
      })),
    [postureTimeline]
  );

  const peakCount = postureTimeline.filter((point) => point.isPeak).length;

  const hydrationTimeline = hydrationLogs.slice(-20);


  return (
    <div
      style={{
        marginTop: 40,
        width: '100%',
        maxWidth: 1120,
      }}
    >
      <h2 style={{ marginBottom: 16 }}>📊 Real-Time Session Analytics</h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <Card title="Posture Score" value={`${postureScore}%`} />
        <Card title="Avg Slouch" value={`${avgSlouch.toFixed(1)}%`} />
        <Card title="Worst Slouch" value={`${worstSlouch.toFixed(1)}%`} />
        <Card title="Hydration Breaks" value={`${hydrationLogs.length}`} />
        <Card title="Focus Phase" value={phase} />
        <Card title="Eye Safety" value={eyeAlerts} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20,
        }}
      >
        <div style={chartBox}>
          <h3 style={{ marginTop: 0 }}>Posture Quality Over Time</h3>
          <p style={{ marginTop: 6, marginBottom: 12, fontSize: 12, color: '#9ca3af' }}>
            Rolling 15-minute window • updated every 2 seconds • smoothed with moving average
          </p>

          <ResponsiveContainer width="100%" height={290}>
            <LineChart data={chartData}>
              <ReferenceArea y1={0} y2={30} fill="rgba(34,197,94,0.08)" />
              <ReferenceArea y1={30} y2={60} fill="rgba(234,179,8,0.09)" />
              <ReferenceArea y1={60} y2={100} fill="rgba(239,68,68,0.10)" />

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
              <XAxis
                dataKey="elapsedSeconds"
                tickFormatter={formatTimerSeconds}
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
              />

              <ReferenceLine
                y={40}
                stroke="#f97316"
                strokeDasharray="6 4"
                label={{ value: 'Warning 40%', fill: '#fb923c', position: 'insideTopRight', fontSize: 11 }}
              />

              <Tooltip
                formatter={(value) => [`${Number(value ?? 0).toFixed(1)}%`, 'Slouch']}
                labelFormatter={(label) => `Session time ${formatTimerSeconds(Number(label ?? 0))}`}
                contentStyle={{
                  background: 'rgba(15,23,42,0.95)',
                  border: '1px solid rgba(148,163,184,0.3)',
                  borderRadius: 12,
                }}
              />

              <Line
                type="monotone"
                dataKey="goodValue"
                stroke="#22c55e"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="warningValue"
                stroke="#eab308"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="badValue"
                stroke="#ef4444"
                strokeWidth={2.7}
                connectNulls={false}
                isAnimationActive={false}
                dot={(dotProps: { cx?: number; cy?: number; payload?: { isPeak?: boolean } }) => {
                  if (!dotProps.payload?.isPeak) return null;
                  return (
                    <circle
                      cx={dotProps.cx}
                      cy={dotProps.cy}
                      r={4}
                      fill="#f472b6"
                      stroke="#be185d"
                      strokeWidth={1.2}
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>

          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#94a3b8' }}>
            Peaks detected (worst moments): <strong>{peakCount}</strong>
          </p>
        </div>

        <div style={chartBox}>
          <h3 style={{ marginTop: 0 }}>Focus Activity</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={focusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {latestCompletedSession && (
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: '#cbd5e1',
                lineHeight: 1.5,
                textAlign: 'left',
              }}
            >
              <div>Last saved session:</div>
              <div>Avg slouch: {latestCompletedSession.avgSlouchPercent.toFixed(1)}%</div>
              <div>Worst slouch: {latestCompletedSession.worstSlouchPercent.toFixed(1)}%</div>
              <div>Hydration breaks: {latestCompletedSession.hydrationBreaks}</div>
            </div>
          )}
        </div>

        <div style={{ ...chartBox, gridColumn: '1 / -1' }}>
          <h3 style={{ marginTop: 0 }}>Hydration Break Tracker</h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 20,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                textAlign: 'left',
                padding: 16,
                borderRadius: 14,
                background: 'rgba(2,132,199,0.12)',
                border: '1px solid rgba(34,211,238,0.35)',
              }}
            >
              <div style={{ fontSize: 12, color: '#93c5fd', marginBottom: 6 }}>Total hydration breaks</div>
              <div style={{ fontSize: 44, fontWeight: 800, color: '#67e8f9', lineHeight: 1 }}>
                {hydrationLogs.length}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#cbd5e1' }}>
                Avg interval: {formatHydrationInterval(averageHydrationIntervalMinutes)}
              </div>
            </div>

            <div
              style={{
                position: 'relative',
                height: 70,
                borderRadius: 12,
                border: '1px dashed rgba(125,211,252,0.4)',
                background: 'rgba(8,47,73,0.22)',
                overflow: 'hidden',
              }}
            >
              {hydrationTimeline.length === 0 && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9ca3af',
                    fontSize: 12,
                  }}
                >
                  No hydration logs yet in this session.
                </div>
              )}

              {hydrationTimeline.map((log, index) => {
                const position =
                  hydrationTimeline.length <= 1 ? 50 : (index / (hydrationTimeline.length - 1)) * 100;
                const label = new Date(log.time).toLocaleTimeString();

                return (
                  <div
                    key={log.time}
                    style={{
                      position: 'absolute',
                      left: `${position}%`,
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      textAlign: 'center',
                    }}
                    title={label}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: '#06b6d4',
                        margin: '0 auto',
                        boxShadow: '0 0 0 5px rgba(34,211,238,0.15)',
                      }}
                    />
                    <div style={{ marginTop: 5, fontSize: 10, color: '#bae6fd' }}>{label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

const Card = ({ title, value }: { title: string; value: string }) => (
  <div
    style={{
      padding: 16,
      borderRadius: 16,
      background: 'rgba(15,23,42,0.85)',
      border: '1px solid rgba(148,163,184,0.3)',
      textAlign: 'left',
    }}
  >
    <h4 style={{ marginTop: 0, marginBottom: 8, color: '#94a3b8', fontSize: 13 }}>{title}</h4>
    <p style={{ fontSize: 22, fontWeight: 'bold', margin: 0 }}>{value}</p>
  </div>
);

const chartBox = {
  padding: 16,
  borderRadius: 16,
  background: 'rgba(15,23,42,0.85)',
  border: '1px solid rgba(148,163,184,0.24)',
};
