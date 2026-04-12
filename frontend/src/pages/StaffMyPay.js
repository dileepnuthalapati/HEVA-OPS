import React, { useState, useEffect } from 'react';
import { attendanceAPI } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Loader2, Clock, Banknote, CalendarDays, TrendingUp } from 'lucide-react';

const CURRENCY_SYMBOLS = { GBP: '£', USD: '$', EUR: '€', INR: '₹' };

export default function StaffMyPay() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    attendanceAPI.getMySummary()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-center text-muted-foreground py-10">Unable to load your summary.</p>;
  }

  const sym = CURRENCY_SYMBOLS[data.currency] || data.currency + ' ';
  const isMonthly = data.pay_type === 'monthly';

  return (
    <div className="space-y-4 pb-20" data-testid="my-pay-page">
      {/* Header */}
      <div className="mb-2">
        <h2 className="text-lg font-bold text-slate-900">{data.staff_name}</h2>
        <p className="text-xs text-muted-foreground">{data.position || 'Team Member'} &middot; {isMonthly ? 'Monthly' : 'Hourly'}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-emerald-200/60" data-testid="week-hours-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">This Week</span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900">{data.week_hours}h</div>
            <p className="text-xs text-muted-foreground mt-0.5">{data.week_sessions} sessions</p>
          </CardContent>
        </Card>

        <Card className="border-indigo-200/60" data-testid="week-pay-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Banknote className="w-4 h-4 text-indigo-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Week Pay</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-700">{sym}{data.week_pay.toFixed(2)}</div>
            {!isMonthly && <p className="text-xs text-muted-foreground mt-0.5">{sym}{data.hourly_rate}/hr</p>}
          </CardContent>
        </Card>

        <Card data-testid="month-hours-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays className="w-4 h-4 text-violet-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">This Month</span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900">{data.month_hours}h</div>
            <p className="text-xs text-muted-foreground mt-0.5">{data.month_sessions} sessions</p>
          </CardContent>
        </Card>

        <Card data-testid="month-pay-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Month Pay</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-700">{sym}{data.month_pay.toFixed(2)}</div>
            {isMonthly && <p className="text-xs text-muted-foreground mt-0.5">{sym}{data.monthly_salary}/mo</p>}
          </CardContent>
        </Card>
      </div>

      {/* Recent Clock Records */}
      <Card data-testid="recent-records-card">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm font-bold">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {data.recent_records?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No recent clock records</p>
          ) : (
            <div className="space-y-2">
              {data.recent_records?.map((r, i) => {
                const clockIn = r.clock_in ? new Date(r.clock_in) : null;
                const clockOut = r.clock_out ? new Date(r.clock_out) : null;
                const hours = r.hours_worked;
                const source = r.entry_source === 'pos_terminal' ? 'Terminal' : 'Mobile';
                return (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 bg-slate-50/50" data-testid={`record-${i}`}>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{r.date}</div>
                      <div className="text-xs text-muted-foreground">
                        {clockIn ? clockIn.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--'}
                        {' → '}
                        {clockOut ? clockOut.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                        <span className="ml-2 px-1 py-0.5 rounded text-[9px] bg-slate-200 text-slate-500">{source}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      {hours != null ? (
                        <span className="text-sm font-bold font-mono text-slate-900">{hours.toFixed(1)}h</span>
                      ) : (
                        <span className="text-xs text-emerald-600 font-semibold animate-pulse">Clocked In</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
