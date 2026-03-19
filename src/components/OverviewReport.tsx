import React from 'react';
import { Clock, Calendar, AlertCircle, Activity, UserX, CheckCircle2 } from 'lucide-react';

export default function OverviewReport({ data }: { data: any }) {
  if (!data) return null;

  const getStatusColor = (status: string) => {
    if (status === 'Active') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (status === 'Low activity') return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-slate-100 text-slate-800 border-slate-200';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-brand-primary px-6 py-4 border-b border-brand-primary/20 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Overview Report
        </h2>
        <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(data.status)}`}>
          Status: {data.status}
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Hours by Team Member */}
        <div>
          <h3 className="text-lg font-medium text-brand-secondary mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
            <Clock className="w-5 h-5" />
            Hours by Team Member
          </h3>
          <ul className="space-y-3">
            {data.hoursByMember.length > 0 ? data.hoursByMember.map((m: any, i: number) => (
              <li key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-medium text-slate-700">{m.name}</span>
                <span className="text-brand-primary font-semibold">{m.hours} hrs</span>
              </li>
            )) : (
              <li className="text-slate-500 italic p-3">No hours logged in this period.</li>
            )}
          </ul>
        </div>

        {/* Daily Activity */}
        <div>
          <h3 className="text-lg font-medium text-brand-secondary mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
            <Calendar className="w-5 h-5" />
            Daily Activity
          </h3>
          <ul className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {data.dailyActivity.length > 0 ? data.dailyActivity.map((d: any, i: number) => (
              <li key={i} className="flex items-center gap-3 text-sm p-2 hover:bg-slate-50 rounded-md transition-colors">
                <span className="w-24 text-slate-500 font-medium">{d.date}</span>
                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-secondary rounded-full"
                    style={{ width: `${Math.min(100, (d.hours / (data.maxDailyHours || 8)) * 100)}%` }}
                  ></div>
                </div>
                <span className="w-12 text-right font-medium text-slate-700">{d.hours}h</span>
              </li>
            )) : (
              <li className="text-slate-500 italic p-2">No daily activity found.</li>
            )}
          </ul>
        </div>

        {/* Missing Time Entries */}
        <div className="md:col-span-2">
          <h3 className="text-lg font-medium text-brand-secondary mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
            <UserX className="w-5 h-5" />
            Missing Time Entries
          </h3>
          {data.missingEntries.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.missingEntries.map((m: any, i: number) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-red-800 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold block">{m.name}</span>
                    <span className="text-red-600/80">{m.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-emerald-700 text-sm flex items-center gap-2 bg-emerald-50 p-4 rounded-lg border border-emerald-100 font-medium">
              <CheckCircle2 className="w-5 h-5" /> All historical team members have logged time in this period.
            </p>
          )}
        </div>

        {/* Recent Activity Snapshot */}
        <div className="md:col-span-2">
          <h3 className="text-lg font-medium text-brand-secondary mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
            <Activity className="w-5 h-5" />
            Recent Activity Snapshot
          </h3>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Team Member</th>
                  <th className="px-4 py-3">Hours</th>
                  <th className="px-4 py-3">Description</th>
                </tr>
              </thead>
              <tbody>
                {data.recentActivity.length > 0 ? data.recentActivity.map((a: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{a.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{a.name}</td>
                    <td className="px-4 py-3 text-brand-primary font-semibold">{a.hours}</td>
                    <td className="px-4 py-3 text-slate-600 truncate max-w-md" title={a.description}>{a.description || '-'}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500 italic">No recent activity found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
