import React, { useState, useMemo } from 'react';
import { useRepository } from '../hooks/useRepository';
import { useFetch } from '../hooks/useFetch';
import { fetchTrends } from '../lib/api';
import { formatDateShort } from '../lib/utils';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import clsx from 'clsx';

// Defined outside component so it has a stable reference — prevents chart remount on every render
function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-sm z-50">
        <p className="font-bold mb-2">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: {p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

export default function Trends() {
  const { selectedRepoId } = useRepository();
  const [timeRange, setTimeRange] = useState('1M');

  const { data, loading } = useFetch(
    () => selectedRepoId ? fetchTrends(selectedRepoId) : Promise.resolve([]),
    [selectedRepoId]
  );

  // Derived filtered + formatted data — recomputes whenever data or timeRange changes
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    let filtered = data;
    if (timeRange === '1W') filtered = data.slice(-7);
    else if (timeRange === '1M') filtered = data.slice(-30);
    else if (timeRange === '3M') filtered = data.slice(-90);
    else if (timeRange === '6M') filtered = data.slice(-180);

    return filtered.map(d => ({
      ...d,
      date: formatDateShort(d.snapshot_at),
      avg_pr_age_days: d.avg_pr_age_hours != null ? (d.avg_pr_age_hours / 24).toFixed(1) : '0',
    }));
  }, [data, timeRange]);

  const isUpdating = loading && !!data && data.length > 0;

  if (!selectedRepoId) return <div className="text-center text-slate-400 mt-10">Sync a repository first.</div>;
  if (loading && (!data || data.length === 0)) return <div className="text-center text-slate-400 mt-10">Loading trends...</div>;
  if (!data || data.length === 0) return <div className="text-center text-slate-400 mt-10">No snapshot data found. Sync a repository first.</div>;

  const showDots = chartData.length <= 1;

  return (
    <div className={clsx("space-y-6 transition-opacity duration-200", isUpdating && "opacity-60")}>
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Historical Trends</h1>
          {isUpdating && (
            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              Updating...
            </div>
          )}
        </div>
        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
          {['1W', '1M', '3M', '6M', 'All'].map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={clsx(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                timeRange === range ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {data.length === 1 && (
        <div className="bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm px-4 py-2.5 rounded-lg">
          Displaying current snapshot data. Historical trends will expand with each sync.
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Open PRs Over Time */}
        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
          <h2 className="text-lg font-semibold mb-4">Open PRs Over Time</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="total_open_prs" name="Total" stroke="#60a5fa" strokeWidth={3} dot={showDots ? { r: 5 } : false} />
                <Line type="monotone" dataKey="healthy_count" name="Healthy" stroke="#4ade80" strokeWidth={2} dot={showDots ? { r: 4 } : false} />
                <Line type="monotone" dataKey="attention_count" name="Attention" stroke="#facc15" strokeWidth={2} dot={showDots ? { r: 4 } : false} />
                <Line type="monotone" dataKey="aging_count" name="Aging" stroke="#fb923c" strokeWidth={2} dot={showDots ? { r: 4 } : false} />
                <Line type="monotone" dataKey="critical_count" name="Critical" stroke="#f87171" strokeWidth={2} dot={showDots ? { r: 4 } : false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Avg PR Age */}
        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
          <h2 className="text-lg font-semibold mb-4">Avg PR Age Over Time (Days)</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="colorAge" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="avg_pr_age_days" name="Avg Age (Days)" stroke="#818cf8" fillOpacity={1} fill="url(#colorAge)" dot={showDots ? { r: 5 } : false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Responsibility */}
        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
          <h2 className="text-lg font-semibold mb-4">Responsibility Distribution Over Time</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="waiting_for_reviewer_count" name="Waiting for Review" stackId="a" fill="#60a5fa" radius={[0, 0, 4, 4]} />
                <Bar dataKey="waiting_for_author_count" name="Waiting for Author" stackId="a" fill="#fbbf24" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Avg First Review Time */}
        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
          <h2 className="text-lg font-semibold mb-4">Avg First Review Time (Hours)</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="avg_first_review_hours" name="Avg First Review (h)" stroke="#34d399" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}

