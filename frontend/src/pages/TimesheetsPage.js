import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import { timesheetAPI, payrollAPI, attendanceAPI, restaurantAPI } from '../services/api';
import { getAuthToken } from '../services/api';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Receipt, Lock, Unlock, CheckCircle, DollarSign, TrendingUp, Camera, X, XCircle } from 'lucide-react';
import { Dialog, DialogContent } from '../components/ui/dialog';
import { toLocalDateStr } from '../utils/dateUtils';

function getWeekRange(offset = 0, weekStartDay = 1) {
  const now = new Date();
  const day = now.getDay();
  const diff = (day - weekStartDay + 7) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - diff + offset * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return {
    start: toLocalDateStr(weekStart),
    end: toLocalDateStr(weekEnd),
  };
}

export default function TimesheetsPage() {
  const { hasFeature, user } = useAuth();
  // Full admins can approve/reject/unlock. Rota-manager staff can VIEW the
  // timesheet summary but not approve hours (that's the owner/manager job).
  const canApproveHours = user?.role === 'admin' || user?.role === 'platform_owner';
  const [weekOffset, setWeekOffset] = useState(0);
  const [summary, setSummary] = useState([]);
  const [payroll, setPayroll] = useState(null);
  const [efficiency, setEfficiency] = useState(null);
  const [loading, setLoading] = useState(true);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [weekStartDay, setWeekStartDay] = useState(1);

  const { start, end } = getWeekRange(weekOffset, weekStartDay);

  const showPosEfficiency = hasFeature('pos');

  // Load week start day from restaurant settings
  useEffect(() => {
    const loadWeekStart = async () => {
      try {
        const res = await api.get('/restaurants/my');
        const wsd = res.data?.business_info?.week_start_day;
        if (wsd !== undefined) setWeekStartDay(wsd);
      } catch {}
    };
    loadWeekStart();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load each endpoint independently — rota-manager staff have access to
      // the timesheet summary but not the full payroll report (admin-only).
      // Catching per-call prevents a single 403 from wiping the whole screen.
      const [ts, pr, att] = await Promise.all([
        timesheetAPI.getSummary(start, end).catch(() => []),
        payrollAPI.getReport(start, end).catch(() => null),
        attendanceAPI.getAll(start, end).catch(() => []),
      ]);
      setSummary(ts || []);
      setPayroll(pr);
      setAttendanceRecords(att);

      if (showPosEfficiency) {
        try {
          const eff = await payrollAPI.getEfficiency(start, end);
          setEfficiency(eff);
        } catch { setEfficiency(null); }
      }
    } catch (e) {
      toast.error('Failed to load timesheets');
    } finally { setLoading(false); }
  }, [start, end, showPosEfficiency]);

  useEffect(() => { loadData(); }, [loadData]);

  // Get photo records for a staff member
  const getStaffPhotos = (staffId) => {
    return attendanceRecords.filter(r => r.staff_id === staffId && r.photo_proof_path);
  };

  const handleViewPhoto = async (photoPath) => {
    try {
      const blobUrl = await attendanceAPI.getPhotoBlob(photoPath);
      setPhotoPreview(blobUrl);
    } catch {
      toast.error('Failed to load photo');
    }
  };

  const handleApprove = async (staffId) => {
    try {
      await timesheetAPI.approve(staffId, start, end);
      toast.success('Timesheet approved & locked');
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to approve');
    }
  };

  const handleUnlock = async (staffId) => {
    try {
      await timesheetAPI.unlock(staffId, start, end);
      toast.success('Timesheet unlocked for correction');
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to unlock');
    }
  };

  const handleReject = async (staffId) => {
    const reason = window.prompt('Reason for rejection (optional):');
    if (reason === null) return;
    try {
      await timesheetAPI.reject(staffId, start, end, reason);
      toast.success('Timesheet rejected — employee can update their records');
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to reject');
    }
  };


  const weekLabel = `${new Date(start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${new Date(end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const totalGross = summary.reduce((s, r) => s + (r.gross_pay || 0), 0);
  const totalScheduled = summary.reduce((s, r) => s + (r.scheduled_hours || 0), 0);
  const totalActual = summary.reduce((s, r) => s + (r.actual_hours || 0), 0);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-6 pt-16 md:pt-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1" data-testid="timesheets-title">Timesheets & Payroll</h1>
          <p className="text-sm text-muted-foreground mb-6">Review scheduled vs actual hours, approve and lock timesheets</p>

          {/* Week Navigation */}
          <div className="flex items-center justify-between mb-5">
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(weekOffset - 1)} data-testid="ts-prev-week">
              &larr; Prev
            </Button>
            <div className="text-center">
              <p className="text-sm font-semibold">{weekLabel}</p>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} className="text-xs text-indigo-600 hover:underline">This week</button>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(weekOffset + 1)} data-testid="ts-next-week">
              Next &rarr;
            </Button>
          </div>

          {/* Summary Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Scheduled Hours</p>
              <p className="text-2xl font-bold mt-1">{totalScheduled.toFixed(1)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Actual Hours</p>
              <p className="text-2xl font-bold mt-1">{totalActual.toFixed(1)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Total Labour Cost</p>
              <p className="text-2xl font-bold mt-1 text-emerald-600">{payroll?.total_labour_cost?.toFixed(2) || '0.00'}</p>
            </Card>
            {showPosEfficiency && efficiency && (
              <Card className="p-4">
                <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Efficiency Ratio
                </p>
                <p className={`text-2xl font-bold mt-1 ${efficiency.efficiency_ratio >= 4 ? 'text-emerald-600' : efficiency.efficiency_ratio >= 2 ? 'text-amber-600' : 'text-red-600'}`}>
                  {efficiency.efficiency_ratio}x
                </p>
                <p className="text-[10px] text-muted-foreground">{efficiency.interpretation}</p>
              </Card>
            )}
          </div>

          {/* Timesheet Table */}
          <Card data-testid="timesheet-table-card">
            <CardContent className="p-0 overflow-x-auto">
              {loading ? (
                <p className="text-sm text-center py-8">Loading...</p>
              ) : summary.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No timesheet data for this period</p>
              ) : (
                <table className="w-full min-w-[700px]" data-testid="timesheet-table">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="p-3 text-left text-xs font-semibold text-slate-500">Staff</th>
                      <th className="p-3 text-center text-xs font-semibold text-slate-500 w-12">Proof</th>
                      <th className="p-3 text-left text-xs font-semibold text-slate-500">Position</th>
                      <th className="p-3 text-center text-xs font-semibold text-slate-500">Scheduled</th>
                      <th className="p-3 text-center text-xs font-semibold text-slate-500">Actual</th>
                      <th className="p-3 text-center text-xs font-semibold text-slate-500">Variance</th>
                      <th className="p-3 text-center text-xs font-semibold text-slate-500">Rate</th>
                      <th className="p-3 text-center text-xs font-semibold text-slate-500">Gross Pay</th>
                      <th className="p-3 text-center text-xs font-semibold text-slate-500">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map(r => {
                      const photos = getStaffPhotos(r.staff_id);
                      return (
                      <tr key={r.staff_id} className="border-b" data-testid={`ts-row-${r.staff_id}`}>
                        <td className="p-3 text-sm font-medium">{r.staff_name}</td>
                        <td className="p-3 text-center">
                          {photos.length > 0 ? (
                            <button
                              onClick={() => handleViewPhoto(photos[photos.length - 1].photo_proof_path)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors"
                              title={`${photos.length} photo(s) this week`}
                              data-testid={`photo-proof-${r.staff_id}`}
                            >
                              <Camera className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-slate-300 text-xs">--</span>
                          )}
                        </td>
                        <td className="p-3 text-sm text-slate-500">{r.position || '-'}</td>
                        <td className="p-3 text-sm text-center font-mono">{r.scheduled_hours}</td>
                        <td className="p-3 text-sm text-center font-mono">{r.actual_hours}</td>
                        <td className={`p-3 text-sm text-center font-mono ${r.variance > 0 ? 'text-amber-600' : r.variance < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {r.variance > 0 ? '+' : ''}{r.variance}
                        </td>
                        <td className="p-3 text-sm text-center font-mono text-slate-500">
                          {r.pay_type === 'monthly'
                            ? <span className="inline-block px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[11px] font-medium">Salary</span>
                            : r.hourly_rate.toFixed(2)}
                        </td>
                        <td className="p-3 text-sm text-center font-mono font-semibold">{r.gross_pay.toFixed(2)}</td>
                        <td className="p-3 text-center">
                          {!canApproveHours ? (
                            // Rota-manager persona: view-only for timesheets
                            <span className="text-xs text-slate-400 font-medium" title="Only business admin can approve hours">View only</span>
                          ) : r.locked ? (
                            <Button variant="ghost" size="sm" onClick={() => handleUnlock(r.staff_id)} className="text-xs h-7" data-testid={`unlock-${r.staff_id}`}>
                              <Unlock className="w-3 h-3 mr-1" /> Unlock
                            </Button>
                          ) : r.has_rejected ? (
                            // Manager previously rejected → employee needs to fix.
                            // Keep the label short so it doesn't overflow on mobile.
                            <span
                              className="inline-block px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[11px] font-medium"
                              data-testid={`rejected-${r.staff_id}`}
                              title="Manager rejected — employee must fix their hours"
                            >
                              Rejected
                            </span>
                          ) : r.has_flagged ? (
                            <span className="text-xs text-amber-600 font-medium">Has Flags</span>
                          ) : (r.actual_hours === 0 && r.scheduled_hours === 0) ? (
                            // Nothing worked, nothing scheduled — no approval to give.
                            <span className="text-xs text-slate-400 font-medium" data-testid={`no-hours-${r.staff_id}`}>No hours</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Button size="sm" onClick={() => handleApprove(r.staff_id)} className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700" data-testid={`approve-${r.staff_id}`}>
                                <CheckCircle className="w-3 h-3 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleReject(r.staff_id)} className="text-xs h-7 text-red-500 hover:bg-red-50" data-testid={`reject-${r.staff_id}`}>
                                <XCircle className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Photo Preview Dialog */}
          <Dialog open={!!photoPreview} onOpenChange={() => { if (photoPreview) { URL.revokeObjectURL(photoPreview); } setPhotoPreview(null); }}>
            <DialogContent className="max-w-sm p-2" data-testid="photo-preview-dialog">
              <div className="relative">
                <img src={photoPreview} alt="Clock-in proof" className="w-full rounded-xl" />
                <p className="text-center text-xs text-muted-foreground mt-2">Clock-in/out photo proof</p>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
