import React, { useState, useEffect } from 'react';
import { attendanceAPI, restaurantAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { LogIn, LogOut, MapPin, Loader2, AlertTriangle, Clock, CheckCircle, Fingerprint } from 'lucide-react';
import { isBiometricAvailable, requestBiometric } from '../services/biometric';

export default function StaffClockIn() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [ghostShift, setGhostShift] = useState(null);
  const [lastAction, setLastAction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [claimedTime, setClaimedTime] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [biometricRequired, setBiometricRequired] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Check security settings and biometric availability
    const init = async () => {
      try {
        const security = await restaurantAPI.getSecuritySettings();
        setBiometricRequired(security.biometric_required);
      } catch {}
      const available = await isBiometricAvailable();
      setBiometricAvailable(available);
    };
    init();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await attendanceAPI.getMyStatus();
        if (res.ghost_shift_pending) {
          setStatus('ghost_pending');
          setGhostShift(res.ghost_shift);
          // Pre-fill a reasonable default time
          const clockIn = new Date(res.ghost_shift.clock_in);
          const defaultEnd = new Date(clockIn.getTime() + 8 * 3600 * 1000); // 8h after start
          setClaimedTime(defaultEnd.toISOString().slice(0, 16));
        } else if (res.clocked_in) {
          setStatus('clocked_in');
          setLastAction({ type: 'in', time: res.clock_in });
        } else {
          setStatus('clocked_out');
        }
      } catch {}
    };
    checkStatus();
  }, [user]);

  const handleClock = async () => {
    setLoading(true);
    try {
      let lat = null, lng = null;
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch (gpsErr) {
        toast.error('Location access required. Please enable GPS and allow location permission.');
        setLoading(false);
        return;
      }

      // Biometric check (only on native devices when required)
      let biometricVerified = false;
      if (biometricRequired && biometricAvailable) {
        const passed = await requestBiometric('Verify your identity to clock in/out');
        if (!passed) {
          toast.error('Biometric verification cancelled. Clock action requires FaceID or fingerprint.');
          setLoading(false);
          return;
        }
        biometricVerified = true;
      }

      const res = await attendanceAPI.clockMe(lat, lng, biometricVerified);

      if (res.action === 'ghost_shift_pending') {
        setStatus('ghost_pending');
        setGhostShift(res.ghost_shift);
        const clockIn = new Date(res.ghost_shift.clock_in);
        const defaultEnd = new Date(clockIn.getTime() + 8 * 3600 * 1000);
        setClaimedTime(defaultEnd.toISOString().slice(0, 16));
        toast.error('You have an unresolved previous shift.');
      } else if (res.action === 'clock_in') {
        setStatus('clocked_in');
        setLastAction({ type: 'in', time: new Date().toISOString() });
        toast.success('Clocked in successfully!');
      } else {
        setStatus('clocked_out');
        setLastAction({ type: 'out', time: new Date().toISOString(), hours: res.hours_worked });
        toast.success(`Clocked out! ${res.hours_worked ? res.hours_worked.toFixed(1) + 'h worked' : ''}`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Clock action failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResolveGhost = async () => {
    if (!claimedTime) {
      toast.error('Please enter the time you finished your shift.');
      return;
    }
    setResolving(true);
    try {
      const isoTime = new Date(claimedTime).toISOString();
      const res = await attendanceAPI.resolveGhost(ghostShift.record_id, isoTime);
      toast.success(res.message || 'Shift resolved! Pending manager approval.');
      setGhostShift(null);
      setStatus('clocked_out');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to resolve shift.');
    } finally {
      setResolving(false);
    }
  };

  const timeStr = currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = currentTime.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const isClockedIn = status === 'clocked_in';
  const isGhostPending = status === 'ghost_pending';

  // Format ghost shift info
  const ghostClockIn = ghostShift ? new Date(ghostShift.clock_in) : null;
  const ghostDateStr = ghostClockIn ? ghostClockIn.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  const ghostTimeStr = ghostClockIn ? ghostClockIn.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="p-4 max-w-sm mx-auto flex flex-col items-center" data-testid="staff-clock-page">
      {/* Time Display */}
      <div className="text-center mt-6 mb-8">
        <p className="text-5xl font-bold tracking-tight tabular-nums" data-testid="live-clock">{timeStr}</p>
        <p className="text-sm text-muted-foreground mt-1">{dateStr}</p>
      </div>

      {/* Ghost Shift Intercept */}
      {isGhostPending && ghostShift ? (
        <Card className="w-full max-w-xs border-amber-300 bg-amber-50/50" data-testid="ghost-shift-card">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-amber-800">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              Missing Clock-Out
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <p className="text-sm text-amber-900">
              You didn't clock out from your shift on <span className="font-semibold">{ghostDateStr}</span> (started {ghostTimeStr}).
            </p>
            <p className="text-xs text-amber-700">What time did you finish?</p>

            <div>
              <Label htmlFor="claimed-time" className="text-xs font-semibold text-amber-800">Finish Time</Label>
              <Input
                id="claimed-time"
                type="datetime-local"
                value={claimedTime}
                onChange={(e) => setClaimedTime(e.target.value)}
                min={ghostShift.clock_in?.slice(0, 16)}
                className="h-11 bg-white border-amber-200"
                data-testid="claimed-time-input"
              />
            </div>

            <Button
              onClick={handleResolveGhost}
              disabled={resolving || !claimedTime}
              className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl"
              data-testid="resolve-ghost-btn"
            >
              {resolving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Submit Finish Time
                </>
              )}
            </Button>

            <p className="text-[10px] text-amber-600 text-center">
              Your manager will review and approve this correction.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Status Badge */}
          <div className={`mb-6 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 ${
            isClockedIn
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              : 'bg-slate-100 text-slate-600 border border-slate-200'
          }`} data-testid="clock-status">
            {isClockedIn ? (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Currently Clocked In
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-slate-400" />
                Clocked Out
              </>
            )}
          </div>

          {/* One-Tap Clock Button */}
          <Card className="p-6 w-full max-w-xs" data-testid="clock-action-card">
            <p className="text-center text-xs text-muted-foreground font-medium mb-4">
              <MapPin className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
              GPS location will be captured automatically
            </p>

            {biometricRequired && (
              <div className="flex items-center justify-center gap-1.5 mb-3 text-xs text-indigo-600 font-medium" data-testid="biometric-badge">
                <Fingerprint className="w-3.5 h-3.5" />
                <span>{biometricAvailable ? 'Biometric required' : 'Biometric required (not available on this device)'}</span>
              </div>
            )}

            <Button
              onClick={handleClock}
              disabled={loading || status === null}
              data-testid="clock-action-btn"
              className={`w-full h-16 text-lg font-bold rounded-2xl transition-all ${
                isClockedIn
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : isClockedIn ? (
                <>
                  <LogOut className="w-5 h-5 mr-2" />
                  Clock Out
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5 mr-2" />
                  Clock In
                </>
              )}
            </Button>

            {loading && (
              <p className="text-center text-xs text-indigo-600 mt-3 animate-pulse">Getting your location...</p>
            )}
          </Card>
        </>
      )}

      {/* Last Action */}
      {lastAction && !isGhostPending && (
        <div className="mt-4 text-center text-xs text-muted-foreground" data-testid="last-action-info">
          Last {lastAction.type === 'in' ? 'clock in' : 'clock out'}: {new Date(lastAction.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          {lastAction.hours && <span className="ml-1">({lastAction.hours.toFixed(1)}h)</span>}
        </div>
      )}
    </div>
  );
}
