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
import { ArrowRightLeft, Clock, CheckCircle, X, Loader2, Users, Send } from 'lucide-react';

const STATUS_STYLES = {
  waiting_acceptance: 'bg-blue-100 text-blue-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-slate-100 text-slate-500',
  pending: 'bg-amber-100 text-amber-700',
};

const STATUS_LABELS = {
  waiting_acceptance: 'Waiting for colleague',
  pending_approval: 'Pending manager approval',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
  pending: 'Pending',
};

export default function StaffSwapRequests() {
  const { user } = useAuth();
  const [myShifts, setMyShifts] = useState([]);
  const [swapRequests, setSwapRequests] = useState([]);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [eligibleStaff, setEligibleStaff] = useState([]);
  const [selectedTargets, setSelectedTargets] = useState('all');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actioningId, setActioningId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const start = now.toISOString().split('T')[0];
      const end = new Date(now.getTime() + 14 * 86400000).toISOString().split('T')[0];

      const [shifts, swaps] = await Promise.all([
        shiftAPI.getAll(start, end).catch(() => []),
        api.get('/swap-requests').then(r => r.data).catch(() => []),
      ]);

      // Find user's staff_id
      const staffRes = await api.get('/attendance/my-status').catch(() => null);
      const myStaffId = staffRes?.data?.staff_id;

      // Filter my shifts (by staff_id or username)
      const mine = shifts.filter(s => s.staff_id === myStaffId || s.staff_id === user?.id || s.staff_name === user?.username);
      setMyShifts(mine);
      setSwapRequests(swaps);
    } catch {} finally { setLoading(false); }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load eligible colleagues when shift is selected
  useEffect(() => {
    if (!selectedShiftId) { setEligibleStaff([]); return; }
    const load = async () => {
      try {
        const res = await api.get(`/swap-requests/eligible/${selectedShiftId}`);
        setEligibleStaff(res.data);
      } catch { setEligibleStaff([]); }
    };
    load();
  }, [selectedShiftId]);

  const handleSubmitRequest = async () => {
    if (!selectedShiftId) { toast.error('Select a shift'); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      const body = { shift_id: selectedShiftId, reason };
      if (selectedTargets !== 'all') {
        body.target_staff_ids = [selectedTargets];
      }
      const res = await api.post('/swap-requests', body);
      toast.success(res.data.message || 'Swap request sent!');
      setShowRequestDialog(false);
      setSelectedShiftId('');
      setSelectedTargets('all');
      setReason('');
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to submit request');
    } finally { setSubmitting(false); }
  };

  const handleAccept = async (requestId) => {
    setActioningId(requestId);
    try {
      const res = await api.put(`/swap-requests/${requestId}/accept`);
      toast.success(res.data.message || 'Accepted!');
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to accept');
    } finally { setActioningId(null); }
  };

  const handleDecline = async (requestId) => {
    setActioningId(requestId);
    try {
      const res = await api.put(`/swap-requests/${requestId}/decline`);
      toast.success(res.data.message || 'Declined');
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to decline');
    } finally { setActioningId(null); }
  };

  const formatTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
  };

  // Separate incoming requests (can accept) from own requests
  const incomingRequests = swapRequests.filter(sr => sr.can_accept);
  const myRequests = swapRequests.filter(sr => !sr.can_accept);

  return (
    <div className="p-4 max-w-lg mx-auto" data-testid="staff-swaps-page">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">Shift Swaps</h2>
          <p className="text-xs text-muted-foreground">Request or manage shift swaps</p>
        </div>
        <Button size="sm" onClick={() => setShowRequestDialog(true)} data-testid="request-swap-btn">
          <ArrowRightLeft className="w-4 h-4 mr-1" /> Request Swap
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-center py-8 text-muted-foreground">Loading...</p>
      ) : (
        <>
          {/* Incoming requests — can accept */}
          {incomingRequests.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-2">Incoming Requests</h3>
              <div className="space-y-2">
                {incomingRequests.map(sr => (
                  <Card key={sr.id} className="p-3 border-blue-200 bg-blue-50/50" data-testid={`incoming-swap-${sr.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{sr.requester_name} needs cover</p>
                        <p className="text-xs text-slate-500">
                          {sr.shift_date} &middot; {formatTime(sr.shift_start)} - {formatTime(sr.shift_end)}
                        </p>
                        {sr.shift_position && <p className="text-[10px] text-slate-400">{sr.shift_position}</p>}
                        {sr.reason && <p className="text-xs text-blue-600 mt-1">"{sr.reason}"</p>}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleAccept(sr.id)}
                          disabled={actioningId === sr.id}
                          className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold"
                          data-testid={`accept-swap-${sr.id}`}
                        >
                          {actioningId === sr.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Accept'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDecline(sr.id)}
                          disabled={actioningId === sr.id}
                          className="h-8 px-2"
                          data-testid={`decline-swap-${sr.id}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* My requests */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">My Requests</h3>
            {myRequests.length === 0 && incomingRequests.length === 0 ? (
              <Card className="p-8 text-center">
                <ArrowRightLeft className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No swap requests yet</p>
                <p className="text-xs text-muted-foreground mt-1">Tap "Request Swap" to ask a colleague to cover your shift</p>
              </Card>
            ) : myRequests.length === 0 ? null : (
              <div className="space-y-2">
                {myRequests.map(sr => (
                  <Card key={sr.id} className="p-3" data-testid={`swap-${sr.id}`}>
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{sr.shift_date} &middot; {formatTime(sr.shift_start)} - {formatTime(sr.shift_end)}</p>
                        {sr.acceptor_name && (
                          <p className="text-xs text-emerald-600 mt-0.5">{sr.acceptor_name} accepted</p>
                        )}
                        {sr.reason && <p className="text-xs text-slate-400 mt-0.5">{sr.reason}</p>}
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[sr.status] || 'bg-slate-100 text-slate-600'}`}>
                        {STATUS_LABELS[sr.status] || sr.status}
                      </span>
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
            <DialogDescription>Select your shift and who you'd like to ask</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Shift to Swap</Label>
              <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
                <SelectTrigger data-testid="swap-shift-select"><SelectValue placeholder="Select a shift" /></SelectTrigger>
                <SelectContent>
                  {myShifts.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.date} — {formatTime(s.start_time)} to {formatTime(s.end_time)}
                    </SelectItem>
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
                      <SelectItem key={s.id} value={s.id}>
                        {s.username}{s.position ? ` (${s.position})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">First person to accept gets the swap</p>
              </div>
            )}

            <div>
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why do you need this swap?" data-testid="swap-reason-input" />
            </div>

            <Button className="w-full" onClick={handleSubmitRequest} disabled={submitting || !selectedShiftId} data-testid="submit-swap-btn">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
              Send Swap Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
