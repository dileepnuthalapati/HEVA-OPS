import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { shiftAPI } from '../services/api';
import api from '../services/api';
import { ArrowRightLeft, X, Loader2, Send, AlertTriangle, Zap, Hand } from 'lucide-react';
import { toLocalDateStr } from '../utils/dateUtils';

const STATUS_STYLES = {
  waiting_acceptance: 'bg-blue-100 text-blue-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-slate-100 text-slate-500',
  pending: 'bg-amber-100 text-amber-700',
  open: 'bg-orange-100 text-orange-700',
  claimed: 'bg-emerald-100 text-emerald-700',
  reassigned: 'bg-indigo-100 text-indigo-700',
};

const STATUS_LABELS = {
  waiting_acceptance: 'Waiting for colleague',
  pending_approval: 'Pending manager approval',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
  pending: 'Pending manager',
  open: 'Open — waiting for claim',
  claimed: 'Claimed',
  reassigned: 'Reassigned',
};

const DROP_REASONS = [
  { code: 'emergency', label: 'Emergency (Medical/Family)' },
  { code: 'sickness', label: 'Sickness' },
  { code: 'unresolved_swap', label: 'Unresolved Swap' },
];

export default function StaffSwapRequests() {
  const { user } = useAuth();
  const [myShifts, setMyShifts] = useState([]);
  const [swapRequests, setSwapRequests] = useState([]);
  const [openShifts, setOpenShifts] = useState([]);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showDropDialog, setShowDropDialog] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [eligibleStaff, setEligibleStaff] = useState([]);
  const [selectedTargets, setSelectedTargets] = useState('all');
  const [reason, setReason] = useState('');
  const [dropReason, setDropReason] = useState('');
  const [dropNote, setDropNote] = useState('');
  const [dropShiftId, setDropShiftId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actioningId, setActioningId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const start = toLocalDateStr(now);
      const end = toLocalDateStr(new Date(now.getTime() + 14 * 86400000));

      const [shifts, swaps, open] = await Promise.all([
        shiftAPI.getAll(start, end).catch(() => []),
        api.get('/swap-requests').then(r => r.data).catch(() => []),
        api.get('/shifts/open').then(r => r.data).catch(() => []),
      ]);

      const mine = shifts.filter(s => s.staff_name === user?.username);
      setMyShifts(mine);
      setSwapRequests(swaps);
      setOpenShifts(open);
    } catch {} finally { setLoading(false); }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!selectedShiftId) { setEligibleStaff([]); return; }
    api.get(`/swap-requests/eligible/${selectedShiftId}`).then(r => setEligibleStaff(r.data)).catch(() => setEligibleStaff([]));
  }, [selectedShiftId]);

  const handleSubmitSwap = async () => {
    if (!selectedShiftId || submitting) return;
    setSubmitting(true);
    try {
      const body = { shift_id: selectedShiftId, reason };
      if (selectedTargets !== 'all') body.target_staff_ids = [selectedTargets];
      const res = await api.post('/swap-requests', body);
      toast.success(res.data.message || 'Swap request sent!');
      setShowRequestDialog(false);
      setSelectedShiftId(''); setSelectedTargets('all'); setReason('');
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to submit request');
    } finally { setSubmitting(false); }
  };

  const handleSubmitDrop = async () => {
    if (!dropShiftId || !dropReason || submitting) return;
    setSubmitting(true);
    try {
      const res = await api.post('/shifts/drop', { shift_id: dropShiftId, reason_code: dropReason, note: dropNote });
      toast.success(res.data.message || 'Drop request submitted');
      setShowDropDialog(false);
      setDropShiftId(''); setDropReason(''); setDropNote('');
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to submit drop');
    } finally { setSubmitting(false); }
  };

  const handleAccept = async (id) => {
    setActioningId(id);
    try { await api.put(`/swap-requests/${id}/accept`); toast.success('Accepted! Waiting for manager.'); loadData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setActioningId(null); }
  };

  const handleDecline = async (id) => {
    setActioningId(id);
    try { await api.put(`/swap-requests/${id}/decline`); toast.success('Declined'); loadData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setActioningId(null); }
  };

  const handleCancelSwap = async (id) => {
    setActioningId(id);
    try { await api.delete(`/swap-requests/${id}`); toast.success('Swap request cancelled'); loadData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed to cancel'); }
    finally { setActioningId(null); }
  };

  const handleClaim = async (shiftId) => {
    setActioningId(shiftId);
    try { const res = await api.post(`/shifts/${shiftId}/claim`); toast.success(res.data.message || 'Shift claimed!'); loadData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed to claim'); }
    finally { setActioningId(null); }
  };

  const fmt = (t) => { if (!t) return ''; const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`; };

  const incomingRequests = swapRequests.filter(sr => sr.can_accept);
  const myRequests = swapRequests.filter(sr => !sr.can_accept);

  return (
    <div className="p-4 max-w-lg mx-auto" data-testid="staff-swaps-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">Shift Swaps</h2>
          <p className="text-xs text-muted-foreground">Swap, drop, or claim shifts</p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setShowDropDialog(true)} data-testid="drop-shift-btn" className="text-red-600 border-red-200 hover:bg-red-50">
            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Drop
          </Button>
          <Button size="sm" onClick={() => setShowRequestDialog(true)} data-testid="request-swap-btn">
            <ArrowRightLeft className="w-3.5 h-3.5 mr-1" /> Swap
          </Button>
        </div>
      </div>

      {loading ? <p className="text-sm text-center py-8 text-muted-foreground">Loading...</p> : (
        <>
          {/* Open Shifts Marketplace */}
          {openShifts.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" /> Open Shifts — Claim Now
              </h3>
              <div className="space-y-2">
                {openShifts.map(s => (
                  <Card key={s.id} className="p-3 border-orange-300 bg-orange-50/60" data-testid={`open-shift-${s.id}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{s.date} &middot; {fmt(s.start_time)} - {fmt(s.end_time)}</p>
                        {s.position && <p className="text-[10px] text-slate-400">{s.position}</p>}
                      </div>
                      <Button size="sm" onClick={() => handleClaim(s.id)} disabled={actioningId === s.id} className="h-8 px-3 bg-orange-600 hover:bg-orange-700 text-xs font-bold" data-testid={`claim-shift-${s.id}`}>
                        {actioningId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Hand className="w-3.5 h-3.5 mr-1" /> Claim</>}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Incoming swap requests */}
          {incomingRequests.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-2">Incoming Requests</h3>
              <div className="space-y-2">
                {incomingRequests.map(sr => (
                  <Card key={sr.id} className="p-3 border-blue-200 bg-blue-50/50" data-testid={`incoming-swap-${sr.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{sr.requester_name} needs cover</p>
                        <p className="text-xs text-slate-500">{sr.shift_date} &middot; {fmt(sr.shift_start)} - {fmt(sr.shift_end)}</p>
                        {sr.reason && <p className="text-xs text-blue-600 mt-1">"{sr.reason}"</p>}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="sm" onClick={() => handleAccept(sr.id)} disabled={actioningId === sr.id} className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold" data-testid={`accept-swap-${sr.id}`}>
                          {actioningId === sr.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Accept'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDecline(sr.id)} disabled={actioningId === sr.id} className="h-8 px-2" data-testid={`decline-swap-${sr.id}`}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* My Requests */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">My Requests</h3>
            {myRequests.length === 0 && incomingRequests.length === 0 && openShifts.length === 0 ? (
              <Card className="p-8 text-center">
                <ArrowRightLeft className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No activity yet</p>
                <p className="text-xs text-muted-foreground mt-1">Swap a shift, drop if needed, or claim open shifts</p>
              </Card>
            ) : myRequests.length > 0 && (
              <div className="space-y-2">
                {myRequests.map(sr => (
                  <Card key={sr.id} className="p-3" data-testid={`swap-${sr.id}`}>
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{sr.shift_date} &middot; {fmt(sr.shift_start)} - {fmt(sr.shift_end)}</p>
                        {sr.acceptor_name && <p className="text-xs text-emerald-600 mt-0.5">{sr.acceptor_name} accepted</p>}
                        {sr.reason && <p className="text-xs text-slate-400 mt-0.5">{sr.reason}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[sr.status] || 'bg-slate-100'}`}>
                          {STATUS_LABELS[sr.status] || sr.status}
                        </span>
                        {(sr.status === 'waiting_acceptance' || sr.status === 'pending_approval') && (
                          <Button size="sm" variant="ghost" onClick={() => handleCancelSwap(sr.id)} disabled={actioningId === sr.id} className="h-6 px-1.5 text-slate-400 hover:text-red-500" data-testid={`cancel-swap-${sr.id}`}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Request Swap Dialog */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent className="max-w-sm" data-testid="swap-request-dialog">
          <DialogHeader>
            <DialogTitle>Request Shift Swap</DialogTitle>
            <DialogDescription>Ask a colleague to cover your shift</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Shift to Swap</Label>
              <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
                <SelectTrigger data-testid="swap-shift-select"><SelectValue placeholder="Select a shift" /></SelectTrigger>
                <SelectContent>
                  {myShifts.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.date} — {fmt(s.start_time)} to {fmt(s.end_time)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedShiftId && (
              <div>
                <Label>Ask Who?</Label>
                <Select value={selectedTargets} onValueChange={setSelectedTargets}>
                  <SelectTrigger data-testid="swap-target-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All colleagues ({eligibleStaff.length})</SelectItem>
                    {eligibleStaff.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.username}{s.position ? ` (${s.position})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">First to accept wins the swap</p>
              </div>
            )}
            <div>
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why do you need this swap?" data-testid="swap-reason-input" />
            </div>
            <Button className="w-full" onClick={handleSubmitSwap} disabled={submitting || !selectedShiftId} data-testid="submit-swap-btn">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />} Send Swap Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drop Shift Dialog */}
      <Dialog open={showDropDialog} onOpenChange={setShowDropDialog}>
        <DialogContent className="max-w-sm" data-testid="drop-shift-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700"><AlertTriangle className="w-5 h-5" /> Drop Shift</DialogTitle>
            <DialogDescription>Can't find a swap? Escalate to your manager.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Shift to Drop</Label>
              <Select value={dropShiftId} onValueChange={setDropShiftId}>
                <SelectTrigger data-testid="drop-shift-select"><SelectValue placeholder="Select a shift" /></SelectTrigger>
                <SelectContent>
                  {myShifts.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.date} — {fmt(s.start_time)} to {fmt(s.end_time)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason *</Label>
              <Select value={dropReason} onValueChange={setDropReason}>
                <SelectTrigger data-testid="drop-reason-select"><SelectValue placeholder="Select a reason" /></SelectTrigger>
                <SelectContent>
                  {DROP_REASONS.map(r => (
                    <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Additional Note (optional)</Label>
              <Input value={dropNote} onChange={e => setDropNote(e.target.value)} placeholder="Any details for your manager" data-testid="drop-note-input" />
            </div>
            <Button className="w-full bg-red-600 hover:bg-red-700" onClick={handleSubmitDrop} disabled={submitting || !dropShiftId || !dropReason} data-testid="submit-drop-btn">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <AlertTriangle className="w-4 h-4 mr-1" />} Submit Drop Request
            </Button>
            <p className="text-[10px] text-center text-muted-foreground">Your manager will be immediately notified</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
