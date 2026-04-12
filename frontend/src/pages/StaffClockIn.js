import React, { useState, useEffect } from 'react';
import { attendanceAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { LogIn, LogOut, MapPin, Loader2 } from 'lucide-react';

export default function StaffClockIn() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [lastAction, setLastAction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await attendanceAPI.getMyStatus();
        if (res.clocked_in) {
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

      const res = await attendanceAPI.clockMe(lat, lng);
      const action = res.action;

      if (action === 'clock_in') {
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

  const timeStr = currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = currentTime.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const isClockedIn = status === 'clocked_in';

  return (
    <div className="p-4 max-w-sm mx-auto flex flex-col items-center" data-testid="staff-clock-page">
      {/* Time Display */}
      <div className="text-center mt-6 mb-8">
        <p className="text-5xl font-bold tracking-tight tabular-nums" data-testid="live-clock">{timeStr}</p>
        <p className="text-sm text-muted-foreground mt-1">{dateStr}</p>
      </div>

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

      {/* Last Action */}
      {lastAction && (
        <div className="mt-4 text-center text-xs text-muted-foreground" data-testid="last-action-info">
          Last {lastAction.type === 'in' ? 'clock in' : 'clock out'}: {new Date(lastAction.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          {lastAction.hours && <span className="ml-1">({lastAction.hours.toFixed(1)}h)</span>}
        </div>
      )}
    </div>
  );
}
