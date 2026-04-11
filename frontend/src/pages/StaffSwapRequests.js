import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { shiftAPI, staffAPI } from '../services/api';
import { ArrowRightLeft, Clock, CheckCircle, X, Loader2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function StaffSwapRequests() {
  const { user } = useAuth();
  const [myShifts, setMyShifts] = useState([]);
  const [swapRequests, setSwapRequests] = useState([]);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const start = now.toISOString().split('T')[0];
      const end = new Date(now.getTime() + 14 * 86400000).toISOString().split('T')[0];

      const [shifts, swaps] = await Promise.all([
        shiftAPI.getAll(start, end).catch(() => []),
        fetchSwapRequests(),
      ]);
      const mine = shifts.filter(s => s.staff_id === user?.id || s.staff_name === user?.username);
      setMyShifts(mine);
      setSwapRequests(swaps);
    } catch {} finally { setLoading(false); }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const fetchSwapRequests = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_URL}/api/swap-requests`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) return await res.json();
    } catch {}
    return [];
  };

  const handleSubmitRequest = async () => {
    if (!selectedShiftId) { toast.error('Select a shift'); return; }
    setSubmitting(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_URL}/api/swap-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ shift_id: selectedShiftId, reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed');
      }
      toast.success('Swap request submitted');
      setShowRequestDialog(false);
      setSelectedShiftId('');
      setReason('');
      loadData();
    } catch (e) {
      toast.error(e.message || 'Failed to submit request');
    } finally { setSubmitting(false); }
  };

  const formatTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
  };

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
      ) : swapRequests.length === 0 ? (
        <Card className="p-8 text-center">
          <ArrowRightLeft className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No swap requests yet</p>
          <p className="text-xs text-muted-foreground mt-1">Use the button above to request a shift swap</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {swapRequests.map(sr => (
            <Card key={sr.id} className="p-3" data-testid={`swap-${sr.id}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{sr.requester_name || 'Staff'}</p>
                  <p className="text-xs text-muted-foreground">
                    {sr.shift_date} {formatTime(sr.shift_start)} - {formatTime(sr.shift_end)}
                  </p>
                  {sr.reason && <p className="text-xs text-slate-500 mt-0.5">{sr.reason}</p>}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  sr.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                  sr.status === 'rejected' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {sr.status}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Request Swap Dialog */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent className="max-w-sm" data-testid="swap-request-dialog">
          <DialogHeader>
            <DialogTitle>Request Shift Swap</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Shift to Swap</Label>
              <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
                <SelectTrigger><SelectValue placeholder="Select a shift" /></SelectTrigger>
                <SelectContent>
                  {myShifts.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.date} — {formatTime(s.start_time)} to {formatTime(s.end_time)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why do you need this swap?" />
            </div>
            <Button className="w-full" onClick={handleSubmitRequest} disabled={submitting} data-testid="submit-swap-btn">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ArrowRightLeft className="w-4 h-4 mr-1" />}
              Submit Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
