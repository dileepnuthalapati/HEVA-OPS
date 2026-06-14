import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import { shiftAPI, staffAPI } from '../services/api';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Plus, Copy, Send, Trash2, Edit2, CalendarX, RotateCcw } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import { toLocalDateStr } from '../utils/dateUtils';

const ALL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function getDayLabels(startDay) {
  const result = [];
  for (let i = 0; i < 7; i++) result.push(ALL_DAYS[(startDay + i) % 7]);
  return result;
}

// Format a Date in the user's LOCAL timezone as YYYY-MM-DD.
// Imported from `../utils/dateUtils` so every week-view page across the
// app formats dates consistently and doesn't silently pick up UTC drift.

function getWeekDates(offset = 0, weekStartDay = 1) {
  // weekStartDay: 0=Sunday, 1=Monday, 6=Saturday
  const now = new Date();
  const day = now.getDay();
  const diff = (day - weekStartDay + 7) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - diff + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toLocalDateStr(d);
  });
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  return `${hr % 12 || 12}:${m} ${ampm}`;
}

export default function ShiftScheduler() {
  const { user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [shifts, setShifts] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [copyMode, setCopyMode] = useState(false);
  const [form, setForm] = useState({ staff_id: '', date: '', start_time: '09:00', end_time: '17:00', position: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [weekStartDay, setWeekStartDay] = useState(1);
  const [blocks, setBlocks] = useState({}); // 0=Sun, 1=Mon, 6=Sat
  const [weekOffDialog, setWeekOffDialog] = useState(null); // staff object
  const [weekOffReason, setWeekOffReason] = useState('week_off');
  const [weekOffNote, setWeekOffNote] = useState('');
  const [weekOffSaving, setWeekOffSaving] = useState(false);
  // Local draft state for off/leave actions. Keeps changes in memory so the
  // admin can undo before clicking Publish. Each draft entry is
  // { staffId, date, type: 'day_off'|'week_off', reason?, note? }.
  // Removals refer to existing committed leave docs to clear on publish.
  const [draftOffs, setDraftOffs] = useState([]); // pending creates
  const [draftRemovals, setDraftRemovals] = useState([]); // pending clears: { staffId, date, bulk? }
  const [publishing, setPublishing] = useState(false);

  const weekDates = getWeekDates(weekOffset, weekStartDay);
  const startDate = weekDates[0];
  const endDate = weekDates[6];

  // Load week_start_day from restaurant settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await api.get('/restaurants/my');
        const wsd = res.data?.business_info?.week_start_day;
        if (wsd !== undefined && wsd !== null) setWeekStartDay(wsd);
      } catch {}
    };
    loadSettings();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, st] = await Promise.all([
        shiftAPI.getAll(startDate, endDate),
        staffAPI.getAll().catch(() => []),
      ]);
      setShifts(s);
      setStaffList(st);
      // Load scheduler blocks (leave + availability)
      try {
        const blk = await api.get(`/scheduler/blocks?start_date=${startDate}&end_date=${endDate}`);
        setBlocks(blk.data || {});
      } catch { setBlocks({}); }
    } catch (e) {
      toast.error('Failed to load shifts');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddShift = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (editingShift) {
        await shiftAPI.update(editingShift.id, { start_time: form.start_time, end_time: form.end_time, position: form.position, note: form.note });
        toast.success('Shift updated');
      } else {
        await shiftAPI.create(form);
        toast.success('Shift created');
      }
      setShowAddDialog(false);
      setEditingShift(null);
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save shift');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (shiftId) => {
    if (!window.confirm('Delete this shift?')) return;
    try {
      await shiftAPI.delete(shiftId);
      toast.success('Shift deleted');
      loadData();
    } catch { toast.error('Failed to delete'); }
  };

  const handleCopyWeek = async () => {
    const targetDates = getWeekDates(weekOffset + 1, weekStartDay);
    try {
      await shiftAPI.copyWeek(startDate, targetDates[0]);
      toast.success(`Copied shifts to week of ${targetDates[0]}`);
      setWeekOffset(weekOffset + 1);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to copy week');
    }
  };

  // Publish commits all draft off/leave changes to the backend, then
  // publishes the week's shifts so staff can see them. Drafts are applied
  // sequentially so an early failure doesn't silently swallow subsequent ones.
  const handlePublish = async () => {
    if (publishing) return;
    setPublishing(true);
    try {
      let committed = 0;
      // 1. Apply removals first (so toggling a day off then back to working
      //    publishes cleanly even if the user re-marked it within the draft).
      for (const r of draftRemovals) {
        try {
          if (r.bulk) {
            await shiftAPI.clearWeekOff(r.staffId, startDate);
          } else {
            await shiftAPI.clearDayOff(r.staffId, r.date);
          }
          committed += 1;
        } catch (err) {
          // swallow & keep going — surfaced via final toast if nothing applied
        }
      }
      // 2. Apply creates. Week-off drafts are committed once per staff.
      const weekOffsByStaff = {};
      for (const d of draftOffs) {
        if (d.type === 'week_off') {
          weekOffsByStaff[d.staffId] = d;
        }
      }
      for (const [sid, d] of Object.entries(weekOffsByStaff)) {
        try {
          await shiftAPI.markWeekOff(sid, startDate, d.reason || 'week_off', d.note || null);
          committed += 1;
        } catch { /* keep going — surfaced via committed counter */ }
      }
      for (const d of draftOffs) {
        if (d.type === 'day_off') {
          try {
            await shiftAPI.markDayOff(d.staffId, d.date, 'day_off', null);
            committed += 1;
          } catch { /* keep going */ }
        }
      }

      // 3. Publish shifts for the week.
      const res = await shiftAPI.publish(startDate, endDate);
      if (committed > 0) {
        toast.success(`${committed} off/leave change(s) saved. ${res.message || 'Shifts published.'}`);
      } else {
        toast.success(res.message || 'Shifts published');
      }
      setDraftOffs([]);
      setDraftRemovals([]);
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to publish');
    } finally {
      setPublishing(false);
    }
  };

  // ── Draft helpers ──
  const addDraftDayOff = (sid, date) => {
    // If a committed block already exists for this day, this should clear it.
    const existing = blocks[sid]?.[date];
    if (existing?.block_type === 'hard') {
      setDraftRemovals(prev => [...prev.filter(r => !(r.staffId === sid && r.date === date)), { staffId: sid, date }]);
      // also remove any conflicting create draft for this day
      setDraftOffs(prev => prev.filter(d => !(d.staffId === sid && d.date === date)));
      return;
    }
    // Otherwise add a draft create
    setDraftOffs(prev => [...prev.filter(d => !(d.staffId === sid && d.date === date)), { staffId: sid, date, type: 'day_off' }]);
  };

  // Admin clicks an already-committed Day Off / Leave block → stage a removal
  // (committed on Publish). Clicking again undoes the staged removal.
  const toggleRemoveCommittedBlock = (sid, date) => {
    const already = draftRemovals.some(r => r.staffId === sid && !r.bulk && r.date === date);
    if (already) {
      setDraftRemovals(prev => prev.filter(r => !(r.staffId === sid && !r.bulk && r.date === date)));
    } else {
      setDraftRemovals(prev => [...prev, { staffId: sid, date }]);
    }
  };

  const removeDraftDayOff = (sid, date) => {
    setDraftOffs(prev => prev.filter(d => !(d.staffId === sid && d.date === date)));
    setDraftRemovals(prev => prev.filter(r => !(r.staffId === sid && r.date === date)));
  };

  const handleMarkWeekOff = () => {
    if (!weekOffDialog) return;
    setWeekOffSaving(true);
    try {
      // Stage in draft state — committed on Publish.
      setDraftOffs(prev => [
        ...prev.filter(d => !(d.staffId === weekOffDialog.id && d.type === 'week_off')),
        { staffId: weekOffDialog.id, type: 'week_off', reason: weekOffReason, note: weekOffNote || null },
      ]);
      toast.success(`Week off drafted for ${weekOffDialog.username}. Click Publish to save.`);
      setWeekOffDialog(null);
      setWeekOffReason('week_off');
      setWeekOffNote('');
    } finally {
      setWeekOffSaving(false);
    }
  };

  const handleClearWeekOff = (staffId, staffName) => {
    if (!window.confirm(`Undo week off for ${staffName}?`)) return;
    // If it was a draft (not yet published), drop from drafts; otherwise
    // queue a removal for Publish so we keep the same draft semantics.
    const hadDraft = draftOffs.some(d => d.staffId === staffId && d.type === 'week_off');
    if (hadDraft) {
      setDraftOffs(prev => prev.filter(d => !(d.staffId === staffId && d.type === 'week_off')));
      toast.success(`Removed drafted week off for ${staffName}`);
    } else {
      setDraftRemovals(prev => [...prev.filter(r => !(r.staffId === staffId && r.bulk)), { staffId, date: startDate, bulk: true }]);
      toast.success(`Week off for ${staffName} will be cleared on Publish`);
    }
  };

  const openAdd = (date, staffId) => {
    setEditingShift(null);
    setForm({ staff_id: staffId || staffList[0]?.id || '', date, start_time: '09:00', end_time: '17:00', position: '', note: '' });
    setShowAddDialog(true);
  };

  const openEdit = (shift) => {
    setEditingShift(shift);
    setForm({ staff_id: shift.staff_id, date: shift.date, start_time: shift.start_time, end_time: shift.end_time, position: shift.position || '', note: shift.note || '' });
    setShowAddDialog(true);
  };

  // Group shifts by staff_id
  const staffIds = [...new Set([...staffList.map(s => s.id), ...shifts.map(s => s.staff_id)])];
  const staffMap = {};
  staffList.forEach(s => { staffMap[s.id] = s; });

  const weekLabel = `${new Date(startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${new Date(endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const isPublished = shifts.some(s => s.published);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-6 pt-16 md:pt-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight" data-testid="shift-scheduler-title">Shift Scheduler</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Plan and publish your team's weekly rota</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleCopyWeek} data-testid="copy-week-btn">
                <Copy className="w-4 h-4 mr-1.5" /> Copy to Next Week
              </Button>
              <Button size="sm" onClick={handlePublish} disabled={publishing} className="bg-emerald-600 hover:bg-emerald-700" data-testid="publish-shifts-btn">
                <Send className="w-4 h-4 mr-1.5" />
                {publishing
                  ? 'Publishing...'
                  : (draftOffs.length + draftRemovals.length) > 0
                    ? `Publish · ${draftOffs.length + draftRemovals.length} pending`
                    : 'Publish'}
              </Button>
            </div>
          </div>

          {/* Week Navigation */}
          <div className="flex items-center justify-between mb-5">
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(weekOffset - 1)} data-testid="prev-week-btn">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-center">
              <p className="text-sm font-semibold">{weekLabel}</p>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} className="text-xs text-indigo-600 hover:underline">Today</button>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(weekOffset + 1)} data-testid="next-week-btn">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Grid */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full min-w-[700px]" data-testid="shift-grid">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="p-3 text-left text-xs font-semibold text-slate-500 w-[140px]">Staff</th>
                    {weekDates.map((d, i) => {
                      const isToday = d === toLocalDateStr(new Date());
                      return (
                        <th key={d} className={`p-3 text-center text-xs font-semibold ${isToday ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500'}`}>
                          <div>{getDayLabels(weekStartDay)[i]}</div>
                          <div className="text-[10px] font-normal">{new Date(d + 'T12:00:00').getDate()}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <>
                      {[...Array(4)].map((_, i) => (
                        <tr key={`skel-${i}`} className="border-b">
                          <td className="p-3">
                            <Skeleton className="h-4 w-20 mb-1.5" />
                            <Skeleton className="h-3 w-14" />
                          </td>
                          {weekDates.map((d) => (
                            <td key={d} className="p-1.5">
                              <Skeleton className="h-10 w-full rounded-lg" />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </>
                  )}
                  {staffIds.length === 0 && !loading && (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground text-sm">No staff members found. Add staff in Settings first.</td></tr>
                  )}
                  {staffIds.map(sid => {
                    const staff = staffMap[sid];
                    // Detect "week off" — any hard block flagged bulk_week_off in this week span
                    const staffBlocks = blocks[sid] || {};
                    const committedWeekOff = weekDates.every(d => staffBlocks[d]?.block_type === 'hard' && staffBlocks[d]?.bulk_week_off);
                    const draftedWeekOff = draftOffs.some(d => d.staffId === sid && d.type === 'week_off');
                    const queuedRemoveWeekOff = draftRemovals.some(r => r.staffId === sid && r.bulk);
                    const isWholeWeekOff = (committedWeekOff && !queuedRemoveWeekOff) || draftedWeekOff;
                    return (
                      <tr key={sid} className="border-b hover:bg-slate-50/50">
                        <td className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{staff?.username || 'Unknown'}</div>
                              <div className="text-[11px] text-slate-400">{staff?.position || ''}</div>
                            </div>
                            {(user?.role === 'admin' || user?.capabilities?.includes('workforce.manage_rota')) && staff && (
                              isWholeWeekOff ? (
                                <button
                                  onClick={() => handleClearWeekOff(sid, staff.username)}
                                  className="shrink-0 p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                  title="Undo week off"
                                  data-testid={`clear-week-off-${sid}`}
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => { setWeekOffDialog(staff); setWeekOffReason('week_off'); setWeekOffNote(''); }}
                                  className="shrink-0 p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Mark this week off"
                                  data-testid={`mark-week-off-${sid}`}
                                >
                                  <CalendarX className="w-3.5 h-3.5" />
                                </button>
                              )
                            )}
                          </div>
                        </td>
                        {weekDates.map(date => {
                          const dayShifts = shifts.filter(s => s.staff_id === sid && s.date === date);
                          const todayStr = toLocalDateStr(new Date());
                          const isToday = date === todayStr;
                          // Disable adding shifts on past days — admins can
                          // only schedule from today onwards. Existing shifts
                          // stay visible but can't be edited.
                          const isPast = date < todayStr;
                          const block = blocks[sid]?.[date];
                          const queuedRemove = draftRemovals.some(r =>
                            r.staffId === sid && (r.bulk || r.date === date)
                          );
                          const queuedSingleRemove = draftRemovals.some(r =>
                            r.staffId === sid && !r.bulk && r.date === date
                          );
                          const isHardBlock = block?.block_type === 'hard';
                          const isPendingLeave = block?.block_type === 'pending_leave';
                          const isSoftBlock = block?.block_type === 'soft';
                          const isDraftDayOff = draftOffs.some(d =>
                            d.staffId === sid &&
                            (d.type === 'week_off' || (d.type === 'day_off' && d.date === date))
                          );
                          // Distinguish admin-set off ("Week Off"/"Day Off") vs
                          // employee-approved leave. set_by_admin is provided
                          // by the backend on hard blocks created via
                          // mark-day-off / mark-week-off.
                          const isAdminOff = isHardBlock && (block?.set_by_admin || block?.bulk_week_off);
                          const isEmployeeLeave = isHardBlock && !isAdminOff;
                          // Cell is "in off state" — shifts get hidden, action
                          // buttons get hidden. When a removal is queued the
                          // cell visually shows the block as fading/struck.
                          const canManage = user?.role === 'admin' || user?.capabilities?.includes('workforce.manage_rota');
                          const showRedOff = (isHardBlock && !queuedRemove) || isDraftDayOff;
                          const isQueuedRemove = isHardBlock && queuedRemove;
                          return (
                            <td key={date} className={`p-1.5 align-top relative ${
                              isPast ? 'bg-slate-50/80 opacity-60' :
                              showRedOff ? 'bg-red-50' :
                              isQueuedRemove ? 'bg-amber-50/60' :
                              isToday ? 'bg-indigo-50/50' :
                              isPendingLeave ? 'bg-red-50/60' :
                              isSoftBlock ? 'bg-orange-50/40' : ''
                            }`} data-testid={`cell-${sid}-${date}${isPast ? '-past' : ''}`}>
                              {/* Draft Off (not yet published) — red with draft hint */}
                              {!isHardBlock && isDraftDayOff && (
                                <button
                                  type="button"
                                  onClick={() => removeDraftDayOff(sid, date)}
                                  className="w-full text-center py-1 rounded-md bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-red-600 transition-colors"
                                  title="Click to remove draft"
                                  data-testid={`draft-off-${sid}-${date}`}
                                >
                                  {draftOffs.some(d => d.staffId === sid && d.type === 'week_off') ? 'Week Off' : 'Day Off'}
                                  <span className="block text-[8px] font-medium opacity-80">Draft · click to undo</span>
                                </button>
                              )}
                              {/* Committed admin off — Week Off / Day Off (clickable for admins) */}
                              {isHardBlock && isAdminOff && !queuedRemove && (
                                canManage ? (
                                  <button
                                    type="button"
                                    onClick={() => block.bulk_week_off
                                      ? handleClearWeekOff(sid, staff?.username || 'staff')
                                      : toggleRemoveCommittedBlock(sid, date)
                                    }
                                    className="w-full text-center py-1 rounded-md bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-red-600 transition-colors"
                                    title={block.bulk_week_off ? 'Click to undo week off' : 'Click to remove this day off'}
                                    data-testid={`block-${sid}-${date}`}
                                  >
                                    {block.bulk_week_off ? 'Week Off' : 'Day Off'}
                                    <span className="block text-[8px] font-medium opacity-80">Click to remove</span>
                                  </button>
                                ) : (
                                  <div className="text-center py-1 rounded-md bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider" data-testid={`block-${sid}-${date}`}>
                                    {block.bulk_week_off ? 'Week Off' : 'Day Off'}
                                  </div>
                                )
                              )}
                              {/* Committed employee leave (admin can clear) */}
                              {isHardBlock && isEmployeeLeave && !queuedRemove && (
                                canManage ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleRemoveCommittedBlock(sid, date)}
                                    className="w-full text-center py-1 rounded-md bg-red-100 text-red-700 border border-red-300 text-[10px] font-bold uppercase tracking-wider hover:bg-red-200 transition-colors"
                                    title="Click to clear this approved leave"
                                    data-testid={`leave-${sid}-${date}`}
                                  >
                                    Leave
                                    <span className="block text-[8px] font-medium opacity-80">Click to clear</span>
                                  </button>
                                ) : (
                                  <div className="text-center py-1 rounded-md bg-red-100 text-red-700 border border-red-300 text-[10px] font-bold uppercase tracking-wider" data-testid={`leave-${sid}-${date}`}>
                                    Leave
                                  </div>
                                )
                              )}
                              {/* Queued removal — admin clicked an existing block and Publish hasn't run yet */}
                              {isQueuedRemove && (
                                <button
                                  type="button"
                                  onClick={() => toggleRemoveCommittedBlock(sid, date)}
                                  className="w-full text-center py-1 rounded-md bg-amber-50 text-amber-700 border border-dashed border-amber-300 text-[10px] font-bold uppercase tracking-wider hover:bg-amber-100 transition-colors line-through decoration-2"
                                  title="Removal pending. Click to keep the block."
                                  data-testid={`queued-remove-${sid}-${date}`}
                                >
                                  {block.bulk_week_off ? 'Week Off' : isAdminOff ? 'Day Off' : 'Leave'}
                                  <span className="block text-[8px] font-semibold no-underline opacity-90">Will be removed on Publish · undo?</span>
                                </button>
                              )}
                              {/* Pending employee leave */}
                              {isPendingLeave && (
                                <div className="text-center py-1 rounded-md bg-red-50 text-red-600 border border-dashed border-red-300 text-[10px] font-semibold" data-testid={`pending-leave-${sid}-${date}`}>
                                  Leave · pending
                                </div>
                              )}
                              {isSoftBlock && !isHardBlock && !isPendingLeave && (
                                <div className="text-[9px] text-orange-400 text-center py-0.5 italic" data-testid={`unavail-${sid}-${date}`}>
                                  {block.from && block.to
                                    ? `Unavail: ${block.from} - ${block.to}`
                                    : block.reason || 'Unavailable (All Day)'}
                                </div>
                              )}
                              {/* Conflict warning — shifts exist on an off day */}
                              {showRedOff && dayShifts.length > 0 && (
                                <div className="mt-1 mb-1 text-[9px] text-amber-700 bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5 text-center font-semibold" data-testid={`shift-conflict-${sid}-${date}`}>
                                  ! Shift conflicts with Off — delete or clear Off
                                </div>
                              )}
                              {dayShifts.map(sh => (
                                <div
                                  key={sh.id}
                                  className={`group relative text-[11px] rounded-lg px-2 py-1.5 mb-1 ${isPast ? 'cursor-default' : 'cursor-pointer'} transition-all ${
                                    sh.published
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                                  } hover:shadow-sm`}
                                  onClick={() => { if (!isPast) openEdit(sh); }}
                                  data-testid={`shift-${sh.id}`}
                                >
                                  <div className="font-semibold">{formatTime(sh.start_time)} - {formatTime(sh.end_time)}</div>
                                  {sh.position && <div className="text-[10px] opacity-70 truncate">{sh.position}</div>}
                                  {!isPast && (
                                    <button
                                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                      onClick={(e) => { e.stopPropagation(); handleDelete(sh.id); }}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {canManage && !showRedOff && !isPast && dayShifts.length === 0 && (
                                <div className="flex gap-1" data-testid={`actions-${sid}-${date}`}>
                                  <button
                                    className="flex-1 h-7 rounded-lg border border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-slate-400 hover:text-indigo-500 transition-all flex items-center justify-center"
                                    onClick={() => {
                                      if (isPendingLeave || isSoftBlock) {
                                        if (!window.confirm(`${staff?.username || 'This person'} has a ${block?.reason || 'conflict'} on this day. Schedule anyway?`)) return;
                                      }
                                      openAdd(date, sid);
                                    }}
                                    data-testid={`add-shift-${date}`}
                                    title="Add a shift"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    {(isPendingLeave || isSoftBlock) && <span className="ml-0.5 text-amber-500 text-[9px]">!</span>}
                                  </button>
                                  <button
                                    className="h-7 w-7 rounded-lg border border-dashed border-slate-200 hover:border-red-400 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all flex items-center justify-center"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Draft only — committed on Publish.
                                      addDraftDayOff(sid, date);
                                    }}
                                    data-testid={`day-off-${sid}-${date}`}
                                    title="Mark this day off (draft)"
                                  >
                                    <span className="text-[10px] font-bold leading-none">OFF</span>
                                  </button>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Add/Edit Dialog */}
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogContent className="max-w-sm" data-testid="shift-dialog">
              <DialogHeader>
                <DialogTitle>{editingShift ? 'Edit Shift' : 'Add Shift'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddShift} className="space-y-4 mt-2">
                {!editingShift && (
                  <div>
                    <Label>Staff Member</Label>
                    <Select value={form.staff_id} onValueChange={v => setForm({ ...form, staff_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                      <SelectContent>
                        {staffList.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.username}{s.position ? ` (${s.position})` : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start</Label>
                    <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} required />
                  </div>
                  <div>
                    <Label>End</Label>
                    <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} required />
                  </div>
                </div>
                <div>
                  <Label>Position</Label>
                  <Input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder="e.g. Server, Chef" />
                </div>
                <div>
                  <Label>Note</Label>
                  <Input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Optional note" />
                </div>
                <Button type="submit" className="w-full" disabled={saving} data-testid="save-shift-btn">
                  {saving ? 'Saving...' : editingShift ? 'Update Shift' : 'Add Shift'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* Bulk Week Off Dialog */}
          <Dialog open={!!weekOffDialog} onOpenChange={(open) => { if (!open) setWeekOffDialog(null); }}>
            <DialogContent className="max-w-sm" data-testid="week-off-dialog">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CalendarX className="w-5 h-5 text-red-600" />
                  Mark Week Off
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Stage a full week off for the selected staff member. Nothing is saved until you click <span className="font-semibold">Publish</span> on the scheduler. Existing shifts in this week will be removed when published.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm">
                  <div className="font-semibold text-slate-800">{weekOffDialog?.username}</div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {new Date(startDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} → {new Date(endDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  <div className="text-[11px] text-red-700 mt-2">Draft — confirm with Publish to commit. Existing shifts for this week will then be removed.</div>
                </div>
                <div>
                  <Label>Reason</Label>
                  <Select value={weekOffReason} onValueChange={setWeekOffReason}>
                    <SelectTrigger data-testid="week-off-reason"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week_off">Week Off</SelectItem>
                      <SelectItem value="vacation">Vacation</SelectItem>
                      <SelectItem value="sick">Sick</SelectItem>
                      <SelectItem value="public_holiday">Public Holiday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Note (optional)</Label>
                  <Input
                    value={weekOffNote}
                    onChange={e => setWeekOffNote(e.target.value)}
                    placeholder="e.g. Family trip"
                    data-testid="week-off-note"
                  />
                </div>
                <Button
                  className="w-full bg-red-600 hover:bg-red-700"
                  disabled={weekOffSaving}
                  onClick={handleMarkWeekOff}
                  data-testid="confirm-week-off-btn"
                >
                  {weekOffSaving ? 'Saving...' : 'Draft Week Off'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
