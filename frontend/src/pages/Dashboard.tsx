import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getApiBaseUrl } from '../api/baseUrl';
import { getOrCreateClientId } from '../api/client';

interface SummaryStats {
  total_focus_minutes: number;
  focus_sessions: number;
  posture_events: number;
  good_posture_ratio: number;
  distance_events: number;
  safe_distance_ratio: number;
}

const DEFAULT_SUMMARY: SummaryStats = {
  total_focus_minutes: 0,
  focus_sessions: 0,
  posture_events: 0,
  good_posture_ratio: 0,
  distance_events: 0,
  safe_distance_ratio: 0,
};

export const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<SummaryStats>(DEFAULT_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true);
      setError(null);

      try {
        const clientId = getOrCreateClientId();
        const baseUrl = getApiBaseUrl();

        const res = await fetch(`${baseUrl}/analytics/summary`, {
          headers: {
            'X-Client-Id': clientId,
          },
        });

        if (!res.ok) throw new Error(`Request failed with ${res.status}`);
        const data = (await res.json()) as SummaryStats;
        setSummary(data);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, []);

  const postureData = [
    { name: 'Posture', value: Math.round(summary.good_posture_ratio * 100) },
  ];
  const distanceData = [
    { name: 'Distance', value: Math.round(summary.safe_distance_ratio * 100) },
  ];

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '32px 16px 48px',
        background:
          'radial-gradient(circle at top left, #0f172a 0%, #020617 50%, #000 100%)',
        color: '#e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <header
        style={{
          width: '100%',
          maxWidth: 1120,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: '2rem', margin: 0, marginBottom: 4 }}>
            Wellness analytics
          </h1>
          <p style={{ margin: 0, color: '#9ca3af', fontSize: 14 }}>
            Overview of your posture quality, focused work, and safe screen
            distance.
          </p>
        </div>
      </header>

      <section
        style={{
          width: '100%',
          maxWidth: 1120,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatCard label="Total focus time (min)" value={summary.total_focus_minutes.toFixed(1)} />
        <StatCard label="Focus sessions" value={summary.focus_sessions.toString()} />
        <StatCard label="Posture events" value={summary.posture_events.toString()} />
        <StatCard label="Distance events" value={summary.distance_events.toString()} />
      </section>

      <section
        style={{
          width: '100%',
          maxWidth: 1120,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <ChartCard title="Good posture %">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={postureData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                formatter={(value) =>
                  typeof value === 'number' ? `${value}%` : `${value ?? 0}%`
                }
              />
              <Bar dataKey="value" fill="#22c55e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Safe distance %">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={distanceData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                formatter={(value) =>
                  typeof value === 'number' ? `${value}%` : `${value ?? 0}%`
                }
              />
              <Bar dataKey="value" fill="#38bdf8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      {loading && (
        <p style={{ marginTop: 16, color: '#9ca3af', fontSize: 13 }}>
          Loading analytics…
        </p>
      )}
      {error && (
        <p style={{ marginTop: 16, color: '#fca5a5', fontSize: 13 }}>{error}</p>
      )}
    </main>
  );
};

interface StatCardProps {
  label: string;
  value: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value }) => (
  <div
    style={{
      padding: 16,
      borderRadius: 16,
      background: 'rgba(15,23,42,0.9)',
      border: '1px solid rgba(148,163,184,0.35)',
    }}
  >
    <p style={{ margin: 0, marginBottom: 8, color: '#9ca3af', fontSize: 13 }}>{label}</p>
    <p style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{value}</p>
  </div>
);

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, children }) => (
  <div
    style={{
      padding: 16,
      borderRadius: 16,
      background: 'rgba(15,23,42,0.9)',
      border: '1px solid rgba(148,163,184,0.35)',
      minHeight: 260,
    }}
  >
    <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: '1.1rem' }}>{title}</h2>
    {children}
  </div>
);

