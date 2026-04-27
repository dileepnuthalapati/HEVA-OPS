import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import api from '../services/api';
import { Skeleton } from '../components/ui/skeleton';
import { CalendarDays, Plus, X, Loader2, CheckCircle, Clock, XCircle, Trash2 } from 'lucide-react';

const LEAVE_TYPES = [
  { value: 'vacation', label: 'Vacation' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'personal', label: 'Personal' },
  { value: 'public_holiday', label: 'Public Holiday' },
];

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
};

const ALL_DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

function orderDaysByStart(startDay = 1) {
  // startDay: 0=Sun, 1=Mon, 6=Sat
  const ordered = [];
  for (let i = 0; i < 7; i++) {
    ordered.push(ALL_DAYS[(startDay + i) % 7]);
  }
  return ordered;
}

export default function StaffTimeOff() {
  const { user } = useAuth();
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showAvailDialog, setShowAvailDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState('requests');
  const [weekStartDay, setWeekStartDay] = useState(1);
  const DAYS_OF_WEEK = orderDaysByStart(weekStartDay);

  // Leave form
  const [leaveType, setLeaveType] = useState('vacation');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveNote, setLeaveNote] = useState('');

  // Availability form
  const [availRules, setAvailRules] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [leaves, avail, restaurant] = await Promise.all([
        api.get('/leave-requests').then(r => r.data).catch(() => []),
        api.get('/availability/my').then(r => r.data).catch(() => ({ rules: [] })),
        api.get('/restaurants/my').then(r => r.data).catch(() => null),
      ]);
      setLeaveRequests(leaves);
      setAvailability(avail.rules || []);
      setAvailRules(avail.rules || []);
      const wsd = restaurant?.business_info?.week_start_day;
      if (wsd !== undefined && wsd !== null) setWeekStartDay(wsd);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSubmitLeave = async () => {
    if (!startDate || !endDate || submitting) return;
    setSubmitting(true);
    try {
      const res = await api.post('/leave-requests', { start_date: startDate, end_date: endDate, leave_type: leaveType, note: leaveNote });
      toast.success(res.data.message || 'Leave request submitted');
      setShowLeaveDialog(false);
      setStartDate(''); setEndDate(''); setLeaveNote('');
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    } finally { setSubmitting(false); }
  };

  const handleCancelLeave = async (id) => {
    try {
      await api.delete(`/leave-requests/${id}`);
      toast.success('Request cancelled');
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    }
  };

  const handleSaveAvailability = async () => {
    setSubmitting(true);
    try {
      await api.put('/availability/my', { rules: availRules });
      toast.success('Availability updated');
      setShowAvailDialog(false);
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    } finally { setSubmitting(false); }
  };

  const handleDeleteAvailRule = async (idx) => {
    const updated = availability.filter((_, i) => i !== idx);
    try {
      await api.put('/availability/my', { rules: updated });
      toast.success('Availability rule removed');
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete');
    }
  };

  const addAvailRule = () => {
    setAvailRules([...availRules, { day_of_week: 1, unavailable_from: null, unavailable_to: null, reason: '' }]);
  };

  const removeAvailRule = (idx) => {
    setAvailRules(availRules.filter((_, i) => i !== idx));
  };

  const updateAvailRule = (idx, field, value) => {
    const updated = [...availRules];
    updated[idx] = { ...updated[idx], [field]: value };
    setAvailRules(updated);
  };

  const StatusIcon = ({ status }) => {
    if (status === 'approved') return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    if (status === 'declined') return <XCircle className="w-4 h-4 text-red-500" />;
    return <Clock className="w-4 h-4 text-amber-500" />;
  };

  const pendingCount = leaveRequests.filter(r => r.status === 'pending').length;

  return (
    <div className="p-4 max-w-lg mx-auto" data-testid="staff-timeoff-page">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">Time Off</h2>
          <p className="text-xs text-muted-foreground">Requests & availability</p>
        </div>
        <Button size="sm" onClick={() => setShowLeaveDialog(true)} data-testid="request-leave-btn">
          <Plus className="w-3.5 h-3.5 mr-1" /> Request
        </Button>
      </div>

      {/* Tab Switcher */}
      <div className="flex bg-slate-100 rounded-lg p-0.5 mb-4">
        <button onClick={() => setTab('requests')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${tab === 'requests' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`} data-testid="tab-requests">
          Requests {pendingCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px]">{pendingCount}</span>}
        </button>
        <button onClick={() => setTab('availability')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${tab === 'availability' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`} data-testid="tab-availability">
          My Availability
        </button>
      </div>

      {loading ? (
        <div className="space-y-3" data-testid="timeoff-skeleton">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="p-3">
              <div className="flex items-start gap-2.5">
                <Skeleton className="h-4 w-4 rounded-full mt-0.5" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {tab === 'requests' && (
            <div className="space-y-2">
              {leaveRequests.length === 0 ? (
                <Card className="p-8 text-center">
                  <CalendarDays className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No time off requests</p>
                  <p className="text-xs text-muted-foreground mt-1">Tap "Request" to book time off</p>
                </Card>
              ) : leaveRequests.map(lr => (
                <Card key={lr.id} className="p-3" data-testid={`leave-${lr.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <StatusIcon status={lr.status} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">
                          {lr.start_date === lr.end_date ? lr.start_date : `${lr.start_date} → ${lr.end_date}`}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 capitalize">{lr.leave_type?.replace('_', ' ')} &middot; {lr.days} day{lr.days > 1 ? 's' : ''}</p>
                        {lr.note && <p className="text-xs text-slate-400 mt-0.5">"{lr.note}"</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[lr.status] || 'bg-slate-100'}`}>
                        {lr.status}
                      </span>
                      {lr.status === 'pending' && (
                        <button onClick={() => handleCancelLeave(lr.id)} className="text-slate-300 hover:text-red-400" data-testid={`cancel-leave-${lr.id}`}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {tab === 'availability' && (
            <div>
              <p className="text-xs text-muted-foreground mb-3">Set your regular unavailability. Your manager will see these as soft blocks on the scheduler.</p>
              {availability.length === 0 ? (
                <Card className="p-8 text-center">
                  <CalendarDays className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No recurring unavailability set</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => { setAvailRules([]); setShowAvailDialog(true); }} data-testid="set-availability-btn">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Set Availability
                  </Button>
                </Card>
              ) : (
                <>
                  <div className="space-y-2 mb-3">
                    {availability.map((rule, i) => (
                      <Card key={i} className="p-3" data-testid={`avail-rule-${i}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{DAYS_OF_WEEK.find(d => d.value === rule.day_of_week)?.label || `Day ${rule.day_of_week}`}</p>
                            <p className="text-xs text-slate-400">
                              {rule.unavailable_from && rule.unavailable_to
                                ? `${rule.unavailable_from} - ${rule.unavailable_to}`
                                : 'All day'}
                              {rule.reason && ` — ${rule.reason}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Unavailable</span>
                            <button
                              onClick={() => handleDeleteAvailRule(i)}
                              className="text-slate-300 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50"
                              data-testid={`delete-avail-rule-${i}`}
                              title="Delete this rule"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setAvailRules([...availability]); setShowAvailDialog(true); }} data-testid="edit-availability-btn">
                    Edit Availability
                  </Button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Leave Request Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent className="max-w-sm" data-testid="leave-request-dialog">
          <DialogHeader>
            <DialogTitle>Request Time Off</DialogTitle>
            <DialogDescription>Your manager will be notified</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Type</Label>
              <Select value={leaveType} onValueChange={setLeaveType}>
                <SelectTrigger data-testid="leave-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} data-testid="leave-start-date" />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} data-testid="leave-end-date" />
              </div>
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={leaveNote} onChange={e => setLeaveNote(e.target.value)} placeholder="Reason for time off" data-testid="leave-note-input" />
            </div>
            <Button className="w-full" onClick={handleSubmitLeave} disabled={submitting || !startDate || !endDate} data-testid="submit-leave-btn">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CalendarDays className="w-4 h-4 mr-1" />} Submit Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Availability Editor Dialog */}
      <Dialog open={showAvailDialog} onOpenChange={setShowAvailDialog}>
        <DialogContent className="max-w-sm" data-testid="availability-dialog">
          <DialogHeader>
            <DialogTitle>Set Availability</DialogTitle>
            <DialogDescription>Days you're regularly unavailable</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2 max-h-[50vh] overflow-y-auto">
            {availRules.map((rule, idx) => {
              const allDay = !rule.unavailable_from && !rule.unavailable_to;
              return (
                <div key={idx} className="p-3 border rounded-lg space-y-2.5" data-testid={`avail-edit-${idx}`}>
                  <div className="flex items-center justify-between">
                    <select value={rule.day_of_week} onChange={e => updateAvailRule(idx, 'day_of_week', parseInt(e.target.value))} className="text-sm text-slate-900 border rounded-lg px-2 py-1 bg-slate-100/80 focus:ring-2 focus:ring-indigo-500/30 focus:outline-none">
                      {DAYS_OF_WEEK.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                    <button onClick={() => removeAvailRule(idx)} className="text-slate-400 hover:text-red-500" data-testid={`remove-avail-${idx}`}><X className="w-4 h-4" /></button>
                  </div>

                  {/* All-day toggle — when on, both time inputs are cleared so
                      the rule means "unavailable for the entire day". When
                      off, the two times are required and users can pick a
                      specific window (e.g. 09:00 - 13:00). */}
                  <label className="flex items-center justify-between py-1">
                    <span className="text-xs font-medium text-slate-700">Unavailable all day</span>
                    <Switch
                      checked={allDay}
                      onCheckedChange={(checked) => {
                        // Both fields must be updated in a single setState
                        // call — chained updateAvailRule() calls each
                        // operate on stale availRules and the second one
                        // overwrites the first.
                        const updated = [...availRules];
                        updated[idx] = checked
                          ? { ...updated[idx], unavailable_from: null, unavailable_to: null }
                          : { ...updated[idx], unavailable_from: '09:00', unavailable_to: '17:00' };
                        setAvailRules(updated);
                      }}
                      data-testid={`avail-allday-${idx}`}
                    />
                  </label>

                  {!allDay && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px] text-slate-500 mb-1 block">Start time</Label>
                        <Input type="time" value={rule.unavailable_from || ''} onChange={e => updateAvailRule(idx, 'unavailable_from', e.target.value || null)} className="text-xs h-9" data-testid={`avail-from-${idx}`} />
                      </div>
                      <div>
                        <Label className="text-[11px] text-slate-500 mb-1 block">End time</Label>
                        <Input type="time" value={rule.unavailable_to || ''} onChange={e => updateAvailRule(idx, 'unavailable_to', e.target.value || null)} className="text-xs h-9" data-testid={`avail-to-${idx}`} />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-[11px] text-slate-500 mb-1 block">Reason (optional)</Label>
                    <Input value={rule.reason || ''} onChange={e => updateAvailRule(idx, 'reason', e.target.value)} placeholder="e.g., University class" className="text-xs h-9" data-testid={`avail-reason-${idx}`} />
                  </div>
                </div>
              );
            })}
            <Button variant="outline" size="sm" className="w-full" onClick={addAvailRule} data-testid="add-avail-rule-btn">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Day
            </Button>
          </div>
          <Button className="w-full mt-3" onClick={handleSaveAvailability} disabled={submitting} data-testid="save-availability-btn">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Save Availability
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
