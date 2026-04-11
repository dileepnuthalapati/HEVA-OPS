import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { attendanceAPI } from '../services/api';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Clock, LogIn, LogOut } from 'lucide-react';

export default function FloatingClockButton() {
  const { user, hasFeature } = useAuth();
  const location = useLocation();
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockedSince, setClockedSince] = useState(null);
  const [elapsed, setElapsed] = useState('');
  const [showPinPad, setShowPinPad] = useState(false);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  // Only show on specific workforce-relevant pages (whitelist)
  const workforcePages = ['/dashboard', '/settings', '/workforce/shifts', '/workforce/attendance', '/workforce/timesheets'];
  const isAllowedRoute = workforcePages.some(p => location.pathname.startsWith(p));
  // Only show for restaurant users with workforce enabled, on relevant pages
  const shouldShow = user && user.role !== 'platform_owner' && hasFeature('workforce') && isAllowedRoute;

  // Check current clock-in status
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

  // Update elapsed time
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

  const handlePinKey = (digit) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 4) handleClock(newPin);
  };

  const handleClock = async (clockPin) => {
    setLoading(true);
    try {
      // Capture GPS location
      let lat = null, lng = null;
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch (geoErr) {
        // Location might be blocked — backend will decide if it's required
      }

      const res = await attendanceAPI.clock(clockPin, user.restaurant_id, lat, lng, 'mobile_app');
      if (res.action === 'clock_in') {
        setIsClockedIn(true);
        setClockedSince(new Date().toISOString());
        toast.success('Clocked in!');
      } else {
        setIsClockedIn(false);
        setClockedSince(null);
        toast.success(`Clocked out! ${res.hours_worked ? res.hours_worked.toFixed(1) + 'h worked' : ''}`);
      }
      setShowPinPad(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Invalid PIN');
    } finally {
      setPin('');
      setLoading(false);
    }
  };

  if (!shouldShow) return null;

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setShowPinPad(true)}
        className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all active:scale-95 ${
          isClockedIn
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
            : 'bg-slate-800 hover:bg-slate-700 text-white'
        }`}
        data-testid="floating-clock-btn"
      >
        {isClockedIn ? (
          <>
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-xs font-semibold">{elapsed || 'On shift'}</span>
          </>
        ) : (
          <>
            <Clock className="w-4 h-4" />
            <span className="text-xs font-semibold">Clock In</span>
          </>
        )}
      </button>

      {/* PIN Pad Dialog */}
      <Dialog open={showPinPad} onOpenChange={setShowPinPad}>
        <DialogContent className="max-w-[280px] p-5" data-testid="floating-clock-dialog">
          <DialogHeader>
            <DialogTitle className="text-center text-base">
              {isClockedIn ? 'Clock Out' : 'Clock In'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-center text-xs text-muted-foreground mb-3">Enter your 4-digit PIN</p>

          {/* PIN dots */}
          <div className="flex justify-center gap-2.5 mb-4">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center font-bold transition-all ${
                  pin.length > i ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200'
                }`}
              >
                {pin.length > i ? '*' : ''}
              </div>
            ))}
          </div>

          {/* Number pad */}
          <div className="grid grid-cols-3 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
              <button
                key={d}
                onClick={() => handlePinKey(String(d))}
                disabled={loading}
                className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-base font-semibold transition-all"
                data-testid={`fclock-key-${d}`}
              >
                {d}
              </button>
            ))}
            <div />
            <button
              onClick={() => handlePinKey('0')}
              disabled={loading}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-base font-semibold transition-all"
              data-testid="fclock-key-0"
            >
              0
            </button>
            <button
              onClick={() => setPin(pin.slice(0, -1))}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-500"
            >
              DEL
            </button>
          </div>

          {loading && <p className="text-center text-xs text-indigo-600 mt-2 animate-pulse">Processing...</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
