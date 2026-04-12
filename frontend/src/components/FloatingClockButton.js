import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { attendanceAPI } from '../services/api';
import { toast } from 'sonner';
import { Clock, Loader2 } from 'lucide-react';

export default function FloatingClockButton() {
  const { user, hasFeature } = useAuth();
  const location = useLocation();
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockedSince, setClockedSince] = useState(null);
  const [elapsed, setElapsed] = useState('');
  const [loading, setLoading] = useState(false);

  const workforcePages = ['/dashboard', '/settings', '/workforce/shifts', '/workforce/attendance', '/workforce/timesheets'];
  const isAllowedRoute = workforcePages.some(p => location.pathname.startsWith(p));
  const shouldShow = user && user.role !== 'platform_owner' && hasFeature('workforce') && isAllowedRoute;

  useEffect(() => {
    if (!shouldShow) return;
    const check = async () => {
      try {
        const status = await attendanceAPI.getMyStatus();
        if (status.clocked_in) {
          setIsClockedIn(true);
          setClockedSince(status.clock_in);
        } else {
          setIsClockedIn(false);
          setClockedSince(null);
        }
      } catch {}
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [shouldShow, user]);

  useEffect(() => {
    if (!isClockedIn || !clockedSince) { setElapsed(''); return; }
    const tick = () => {
      const diff = (Date.now() - new Date(clockedSince).getTime()) / 1000;
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      setElapsed(`${h}h ${m}m`);
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [isClockedIn, clockedSince]);

  const handleClock = async () => {
    if (loading) return;
    setLoading(true);
    try {
      let lat = null, lng = null;
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch (geoErr) {
        toast.error('Location required for clock in. Please enable GPS.');
        setLoading(false);
        return;
      }

      const res = await attendanceAPI.clockMe(lat, lng);
      if (res.action === 'clock_in') {
        setIsClockedIn(true);
        setClockedSince(new Date().toISOString());
        toast.success('Clocked in!');
      } else {
        setIsClockedIn(false);
        setClockedSince(null);
        toast.success(`Clocked out! ${res.hours_worked ? res.hours_worked.toFixed(1) + 'h worked' : ''}`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Clock action failed');
    } finally {
      setLoading(false);
    }
  };

  if (!shouldShow) return null;

  return (
    <button
      onClick={handleClock}
      disabled={loading}
      className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all active:scale-95 ${
        isClockedIn
          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
          : 'bg-slate-800 hover:bg-slate-700 text-white'
      }`}
      data-testid="floating-clock-btn"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isClockedIn ? (
        <>
          <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-xs font-semibold">{elapsed || 'Tap to Clock Out'}</span>
        </>
      ) : (
        <>
          <Clock className="w-4 h-4" />
          <span className="text-xs font-semibold">Clock In</span>
        </>
      )}
    </button>
  );
}
