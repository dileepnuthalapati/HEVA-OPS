import React, { useState, useEffect } from 'react';
import { attendanceAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Clock, LogIn, LogOut, CheckCircle } from 'lucide-react';

export default function StaffClockIn() {
  const { user } = useAuth();
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState(null); // 'clocked_in' | 'clocked_out' | null
  const [lastAction, setLastAction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Live clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Check current status
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

  const handlePinKey = (digit) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);

    // Auto-submit on 4 digits
    if (newPin.length === 4) {
      handleClock(newPin);
    }
  };

  const handleClock = async (clockPin) => {
    setLoading(true);
    try {
      const res = await attendanceAPI.clock(clockPin, user?.restaurant_id);
      const action = res.action || (status === 'clocked_in' ? 'clock_out' : 'clock_in');

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
      setPin('');
      setLoading(false);
    }
  };

  const timeStr = currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = currentTime.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="p-4 max-w-sm mx-auto flex flex-col items-center" data-testid="staff-clock-page">
      {/* Time Display */}
      <div className="text-center mt-6 mb-8">
        <p className="text-5xl font-bold tracking-tight tabular-nums" data-testid="live-clock">{timeStr}</p>
        <p className="text-sm text-muted-foreground mt-1">{dateStr}</p>
      </div>

      {/* Status Badge */}
      <div className={`mb-6 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 ${
        status === 'clocked_in'
          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
          : 'bg-slate-100 text-slate-600 border border-slate-200'
      }`} data-testid="clock-status">
        {status === 'clocked_in' ? (
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

      {/* PIN Pad */}
      <Card className="p-5 w-full max-w-xs" data-testid="clock-pin-pad">
        <p className="text-center text-xs text-muted-foreground font-medium mb-3">
          Enter your 4-digit PIN to {status === 'clocked_in' ? 'clock out' : 'clock in'}
        </p>

        {/* PIN Display */}
        <div className="flex justify-center gap-3 mb-5">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-lg font-bold transition-all ${
                pin.length > i
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-slate-50'
              }`}
            >
              {pin.length > i ? '*' : ''}
            </div>
          ))}
        </div>

        {/* Number Pad */}
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
            <button
              key={d}
              onClick={() => handlePinKey(String(d))}
              disabled={loading}
              className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-lg font-semibold transition-all"
              data-testid={`pin-key-${d}`}
            >
              {d}
            </button>
          ))}
          <div />
          <button
            onClick={() => handlePinKey('0')}
            disabled={loading}
            className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-lg font-semibold transition-all"
            data-testid="pin-key-0"
          >
            0
          </button>
          <button
            onClick={() => setPin(pin.slice(0, -1))}
            className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-medium text-slate-500"
            data-testid="pin-backspace"
          >
            DEL
          </button>
        </div>

        {loading && (
          <p className="text-center text-xs text-indigo-600 mt-3 animate-pulse">Processing...</p>
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
