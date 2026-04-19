import React, { useState, useEffect } from 'react';
import { attendanceAPI } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Loader2, Clock, Banknote, CalendarDays, TrendingUp, CheckCircle, XCircle, AlertTriangle, Edit2 } from 'lucide-react';

const CURRENCY_SYMBOLS = { GBP: '£', USD: '$', EUR: '€', INR: '₹' };

export default function StaffMyPay() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [correcting, setCorrecting] = useState(null); // { recordId, date }
  const [correctionHours, setCorrectionHours] = useState('');
  const [correctionNotes, setCorrectionNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = () => {
    setLoading(true);
    attendanceAPI.getMySummary()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleCorrection = async () => {
    if (!correcting || !correctionHours) return;
    setSaving(true);
    try {
      await attendanceAPI.myCorrection(correcting.recordId, parseFloat(correctionHours), correctionNotes);
      toast.success('Hours updated — waiting for manager approval');
      setCorrecting(null);
      setCorrectionHours('');
      setCorrectionNotes('');
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update');
    } finally { setSaving(false); }
  };

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
            <div className="flex items-center gap-1 mt-1">
              {data.week_approved && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Approved</span>}
              {data.week_rejected && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Rejected</span>}
              {!data.week_approved && !data.week_rejected && data.week_sessions > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Pending</span>}
            </div>
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

      {/* Weekly Breakdown */}
      <Card data-testid="weekly-breakdown-card">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm font-bold">This Week — Day by Day</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-2">
            {data.weekly_breakdown?.map((day, i) => (
              <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${day.rejected ? 'border-red-200 bg-red-50/50' : day.approved ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100 bg-slate-50/50'}`} data-testid={`day-${day.date}`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 text-center">
                    <div className="text-xs font-bold text-slate-800">{day.day_name}</div>
                    <div className="text-[10px] text-muted-foreground">{day.date.split('-')[2]}</div>
                  </div>
                  <div>
                    {day.sessions > 0 ? (
                      <span className="text-sm font-bold font-mono text-slate-900">{day.hours}h</span>
                    ) : (
                      <span className="text-xs text-slate-400">No shift</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {day.rejected && (
                    <>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Rejected</span>
                      {day.record_ids.length > 0 && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-indigo-600" onClick={() => { setCorrecting({ recordId: day.record_ids[0], date: day.date }); setCorrectionHours(String(day.hours)); }} data-testid={`correct-${day.date}`}>
                          <Edit2 className="w-3 h-3 mr-0.5" /> Fix
                        </Button>
                      )}
                    </>
                  )}
                  {day.approved && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                  {!day.approved && !day.rejected && day.sessions > 0 && <Clock className="w-3.5 h-3.5 text-amber-500" />}
                </div>
              </div>
            ))}
          </div>

          {/* Rejection reason */}
          {data.week_rejected && data.weekly_breakdown?.some(d => d.reject_reason) && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-red-700">Manager Feedback</p>
                  <p className="text-xs text-red-600 mt-0.5">{data.weekly_breakdown.find(d => d.reject_reason)?.reject_reason}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Correction Dialog - Inline */}
      {correcting && (
        <Card className="border-indigo-200 bg-indigo-50/30" data-testid="correction-card">
          <CardContent className="p-4">
            <h3 className="text-sm font-bold text-slate-800 mb-2">Correct hours for {correcting.date}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Actual hours worked</label>
                <Input type="number" step="0.5" min="0" max="24" value={correctionHours} onChange={(e) => setCorrectionHours(e.target.value)} className="h-10" data-testid="correction-hours-input" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Notes (optional)</label>
                <Input value={correctionNotes} onChange={(e) => setCorrectionNotes(e.target.value)} placeholder="e.g. Forgot to clock out on time" className="h-10" data-testid="correction-notes-input" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCorrection} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-xs" data-testid="submit-correction-btn">
                  {saving ? 'Saving...' : 'Submit Correction'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCorrecting(null)} className="text-xs">Cancel</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                        {r.approved && <span className="ml-1 px-1 py-0.5 rounded text-[9px] bg-emerald-100 text-emerald-600">Approved</span>}
                        {r.rejected && <span className="ml-1 px-1 py-0.5 rounded text-[9px] bg-red-100 text-red-600">Rejected</span>}
                        {r.employee_corrected && <span className="ml-1 px-1 py-0.5 rounded text-[9px] bg-indigo-100 text-indigo-600">Corrected</span>}
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
