import React from 'react';
import { Link } from 'react-router-dom';
import { useRepository } from '../hooks/useRepository';
import { useFetch } from '../hooks/useFetch';
import { fetchSummary, fetchBottlenecks } from '../lib/api';
import { formatDuration, getHealthBg, getActionItemLabel } from '../lib/utils';
import { GitPullRequest, GitMerge, XCircle, AlertTriangle, Clock, Eye, UserX, Timer } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import clsx from 'clsx';

function MetricCard({ title, value, icon: Icon, colorClass, bgColorClass }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 flex items-center justify-between">
      <div>
        <div className="text-sm text-slate-400 mb-1">{title}</div>
        <div className="text-3xl font-bold">{value}</div>
      </div>
      <div className={clsx("p-3 rounded-full", bgColorClass, colorClass)}>
        <Icon className="w-6 h-6" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { selectedRepoId } = useRepository();

  const { data: summary, loading: summaryLoading } = useFetch(
    () => selectedRepoId ? fetchSummary(selectedRepoId) : Promise.resolve(null),
    [selectedRepoId]
  );

  const { data: bottlenecks, loading: bottlenecksLoading } = useFetch(
    () => selectedRepoId ? fetchBottlenecks(selectedRepoId) : Promise.resolve([]),
    [selectedRepoId]
  );

  if (!selectedRepoId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Go to Settings to add a repository
      </div>
    );
  }

  if (summaryLoading || bottlenecksLoading) {
    return <div className="text-slate-400 flex justify-center mt-10">Loading dashboard...</div>;
  }

  if (!summary) return null;

  const healthData = [
    { name: 'On Track', value: summary.on_track || 0, color: '#4ade80' },
    { name: 'Needs Attention', value: summary.needs_attention || 0, color: '#facc15' },
    { name: 'At Risk', value: summary.at_risk || 0, color: '#fb923c' },
    { name: 'Critical', value: summary.critical || 0, color: '#f87171' },
  ].filter(d => d.value > 0);

  const respData = [
    { name: 'Waiting for Review', value: summary.waitingForReviewer || 0, color: '#60a5fa' },
    { name: 'Waiting for Author', value: summary.waitingForAuthor || 0, color: '#fbbf24' },
    { name: 'Other', value: summary.totalOpen - ((summary.waitingForReviewer || 0) + (summary.waitingForAuthor || 0)), color: '#94a3b8' },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard title="Total Open PRs" value={summary.totalOpen ?? 0} icon={GitPullRequest} colorClass="text-blue-400" bgColorClass="bg-blue-500/10" />
        <MetricCard title="Total Merged" value={summary.totalMerged ?? 0} icon={GitMerge} colorClass="text-purple-400" bgColorClass="bg-purple-500/10" />
        <MetricCard title="Total Closed" value={summary.totalClosed ?? 0} icon={XCircle} colorClass="text-slate-400" bgColorClass="bg-slate-500/10" />
        <MetricCard title="Critical PRs" value={summary.critical ?? 0} icon={AlertTriangle} colorClass="text-red-400" bgColorClass="bg-red-500/10" />
        <MetricCard title="At Risk PRs" value={summary.at_risk ?? 0} icon={Clock} colorClass="text-orange-400" bgColorClass="bg-orange-500/10" />
        <MetricCard title="Waiting for Review" value={summary.waitingForReviewer ?? 0} icon={Eye} colorClass="text-blue-400" bgColorClass="bg-blue-500/10" />
        <MetricCard title="Waiting for Author" value={summary.waitingForAuthor ?? 0} icon={UserX} colorClass="text-yellow-400" bgColorClass="bg-yellow-500/10" />
        <MetricCard title="Avg PR Age" value={formatDuration(summary.avgAgeHours)} icon={Timer} colorClass="text-emerald-400" bgColorClass="bg-emerald-500/10" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h2 className="text-lg font-semibold mb-4">PR Health Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={healthData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {healthData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h2 className="text-lg font-semibold mb-4">Responsibility Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={respData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {respData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-5 border-b border-slate-700">
          <h2 className="text-lg font-semibold">Current Bottlenecks (Top Action Items)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/50 text-slate-400">
              <tr>
                <th className="px-5 py-3 font-medium">PR</th>
                <th className="px-5 py-3 font-medium">Title</th>
                <th className="px-5 py-3 font-medium">Assignee</th>
                <th className="px-5 py-3 font-medium">Action Type</th>
                <th className="px-5 py-3 font-medium">Waiting</th>
                <th className="px-5 py-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {bottlenecks?.map((item, index) => (
                <tr key={`${item.number}-${index}`} className="hover:bg-slate-700/30 transition-colors group">
                  <td className="px-5 py-4">
                    <Link to={`/prs/${item.number}`} className="text-blue-400 hover:underline">
                      #{item.number}
                    </Link>
                  </td>
                  <td className="px-5 py-4 max-w-[200px] truncate text-slate-200" title={item.title}>{item.title}</td>
                  <td className="px-5 py-4">{item.assignee_login || '-'}</td>
                  <td className="px-5 py-4">
                    <span className={clsx("px-2.5 py-1 rounded-full text-xs border whitespace-nowrap", getHealthBg(item.health_status))}>
                      {getActionItemLabel(item.action_type)}
                    </span>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">{formatDuration(item.waiting_hours)}</td>
                  <td className="px-5 py-4 max-w-[200px] truncate text-slate-400" title={item.description}>{item.description}</td>
                </tr>
              ))}
              {(!bottlenecks || bottlenecks.length === 0) && (
                <tr>
                  <td colSpan="6" className="px-5 py-8 text-center text-slate-400">No active bottlenecks found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
