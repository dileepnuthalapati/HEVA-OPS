import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import { attendanceAPI, staffAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Clock, UserCheck, AlertTriangle, CheckCircle } from 'lucide-react';

export default function AttendancePage() {
  const { user } = useAuth();
  const [liveRecords, setLiveRecords] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return { start: start.toISOString().split('T')[0], end: now.toISOString().split('T')[0] };
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [live, hist] = await Promise.all([
        attendanceAPI.getLive().catch(() => []),
        attendanceAPI.getAll(dateRange.start, dateRange.end).catch(() => []),
      ]);
      setLiveRecords(live);
      setHistory(hist);
    } catch { /* handled above */ } finally { setLoading(false); }
  }, [dateRange]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh live data every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const live = await attendanceAPI.getLive();
        setLiveRecords(live);
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleResolveFlag = async (recordId, currentHours) => {
    const hours = prompt('Enter correct hours worked:', currentHours?.toString() || '0');
    if (hours === null) return;
    try {
      await attendanceAPI.resolveFlag(recordId, parseFloat(hours));
      toast.success('Flagged record resolved');
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to resolve');
    }
  };

  const formatClockTime = (iso) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-6 pt-16 md:pt-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1" data-testid="attendance-title">Attendance</h1>
          <p className="text-sm text-muted-foreground mb-6">Live clock-in status and attendance history</p>

          {/* Live Clocked-In */}
          <Card className="mb-6" data-testid="live-attendance-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                Currently Clocked In
              </CardTitle>
              <CardDescription>{liveRecords.length} staff on shift</CardDescription>
            </CardHeader>
            <CardContent>
              {liveRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No staff currently clocked in</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {liveRecords.map(r => {
                    const clockedAt = new Date(r.clock_in);
                    const elapsed = ((Date.now() - clockedAt.getTime()) / 3600000).toFixed(1);
                    return (
                      <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100" data-testid={`live-${r.staff_id}`}>
                        <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-sm">
                          {(r.staff_name || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{r.staff_name}</p>
                          <p className="text-xs text-emerald-700">In since {formatClockTime(r.clock_in)} ({elapsed}h)</p>
                        </div>
                        <UserCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* History */}
          <Card data-testid="attendance-history-card">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="text-lg">Attendance History</CardTitle>
                <div className="flex items-center gap-2">
                  <Input type="date" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} className="w-auto text-xs h-8" />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input type="date" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} className="w-auto text-xs h-8" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-center py-4">Loading...</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No attendance records for this period</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]" data-testid="attendance-table">
                    <thead>
                      <tr className="border-b">
                        <th className="p-2 text-left text-xs font-semibold text-slate-500">Staff</th>
                        <th className="p-2 text-left text-xs font-semibold text-slate-500">Date</th>
                        <th className="p-2 text-center text-xs font-semibold text-slate-500">Clock In</th>
                        <th className="p-2 text-center text-xs font-semibold text-slate-500">Clock Out</th>
                        <th className="p-2 text-center text-xs font-semibold text-slate-500">Hours</th>
                        <th className="p-2 text-center text-xs font-semibold text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(r => (
                        <tr key={r.id} className={`border-b ${r.flagged ? 'bg-amber-50/50' : ''}`} data-testid={`att-row-${r.id}`}>
                          <td className="p-2 text-sm font-medium">{r.staff_name}</td>
                          <td className="p-2 text-sm text-slate-600">{r.date}</td>
                          <td className="p-2 text-sm text-center">{formatClockTime(r.clock_in)}</td>
                          <td className="p-2 text-sm text-center">{formatClockTime(r.clock_out)}</td>
                          <td className="p-2 text-sm text-center font-mono">{r.hours_worked != null ? r.hours_worked.toFixed(1) : '-'}</td>
                          <td className="p-2 text-center">
                            {r.flagged ? (
                              <button
                                onClick={() => handleResolveFlag(r.id, r.hours_worked)}
                                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                                data-testid={`resolve-flag-${r.id}`}
                              >
                                <AlertTriangle className="w-3 h-3" /> Flagged
                              </button>
                            ) : r.approved ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                                <CheckCircle className="w-3 h-3" /> Approved
                              </span>
                            ) : r.clock_out ? (
                              <span className="text-xs text-slate-400">Completed</span>
                            ) : (
                              <span className="text-xs text-emerald-600 font-medium">Active</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
