import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI, attendanceAPI } from '../services/api';
import { toast } from 'sonner';
import { Settings, CheckCircle, Clock, LogOut, Loader2, Camera } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';

// Silent front-camera capture utility
async function capturePhoto() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 320, height: 240 }
    });
    const video = document.createElement('video');
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    await video.play();
    // Wait a moment for the camera to adjust
    await new Promise(r => setTimeout(r, 300));
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    canvas.getContext('2d').drawImage(video, 0, 0, 320, 240);
    // Stop camera
    stream.getTracks().forEach(t => t.stop());
    // Convert to base64 JPEG (quality 0.6 for small file)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
    return dataUrl.split(',')[1]; // Return just the base64 part
  } catch (err) {
    console.warn('Camera capture failed:', err.message);
    return null;
  }
}

export default function TerminalPinScreen() {
  const navigate = useNavigate();
  const { pinLogin, logout } = useAuth();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clockResult, setClockResult] = useState(null);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminVerifying, setAdminVerifying] = useState(false);
  const timerRef = useRef(null);
  const inputRef = useRef(null);

  const terminalData = JSON.parse(localStorage.getItem('heva_terminal') || '{}');
  const restaurantId = terminalData.restaurant_id;
  const businessName = terminalData.business_name || 'Heva One';

  // Auto-focus the hidden input
  useEffect(() => {
    inputRef.current?.focus();
  }, [clockResult]);

  // Clear timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const resetToKiosk = useCallback(() => {
    setPin('');
    setError('');
    setClockResult(null);
    setLoading(false);
    logout();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [logout]);

  const handlePinSubmit = async (enteredPin) => {
    if (enteredPin.length !== 4 || loading) return;
    setLoading(true);
    setError('');

    // Capture photo silently BEFORE the clock action (so camera has time)
    const photoPromise = capturePhoto();

    try {
      // First, authenticate via PIN to get user + capabilities
      const response = await pinLogin(enteredPin, restaurantId);
      const caps = response.capabilities || response.user?.capabilities || [];
      const hasPosAccess = caps.includes('pos.access');
      const hasClockIn = caps.includes('workforce.clock_in');

      if (hasPosAccess) {
        // POS staff -> navigate to POS
        navigate('/pos');
      } else if (hasClockIn) {
        // Workforce-only staff -> clock in/out and show toast
        try {
          const clockRes = await attendanceAPI.clock(enteredPin, restaurantId, null, null, 'pos_terminal');
          setClockResult(clockRes);

          // Upload photo proof asynchronously (fire-and-forget)
          const photoBase64 = await photoPromise;
          if (photoBase64 && clockRes.staff_id) {
            // Find the attendance record ID from the response or use a convention
            const recordId = clockRes.record_id || `att_${Date.now() / 1000}`;
            attendanceAPI.uploadPhoto(recordId, photoBase64).catch(err => {
              console.warn('Photo upload failed (non-blocking):', err.message);
            });
          }

          // Auto-reset after 3 seconds
          timerRef.current = setTimeout(resetToKiosk, 3000);
        } catch (clockErr) {
          setError(clockErr.response?.data?.detail || 'Clock in/out failed');
          timerRef.current = setTimeout(resetToKiosk, 3000);
        }
      } else {
        // No recognized capabilities
        setError('No access configured. Contact your manager.');
        timerRef.current = setTimeout(resetToKiosk, 3000);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid PIN');
      setPin('');
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handlePinChange = (val) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 4);
    setPin(cleaned);
    setError('');
    if (cleaned.length === 4) {
      handlePinSubmit(cleaned);
    }
  };

  const handleNumPad = (digit) => {
    if (pin.length >= 4 || loading) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError('');
    if (newPin.length === 4) {
      handlePinSubmit(newPin);
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleUnregister = async () => {
    if (adminPin.length < 4) return;
    setAdminVerifying(true);
    try {
      await authAPI.verifyManagerPin(adminPin, restaurantId);
      // Verified — unregister terminal
      localStorage.removeItem('heva_terminal');
      toast.success('Terminal unregistered');
      setShowAdminDialog(false);
      window.location.href = '/login';
    } catch {
      toast.error('Invalid Manager PIN');
    } finally {
      setAdminVerifying(false);
      setAdminPin('');
    }
  };

  // Clock result screen (3-second auto-dismiss)
  if (clockResult) {
    const isClockIn = clockResult.action === 'clock_in';
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${isClockIn ? 'bg-emerald-600' : 'bg-slate-700'}`} data-testid="terminal-clock-result">
        <div className="animate-in fade-in zoom-in duration-300 text-center text-white">
          {isClockIn ? (
            <CheckCircle className="w-20 h-20 mx-auto mb-4 animate-pulse" />
          ) : (
            <LogOut className="w-20 h-20 mx-auto mb-4" />
          )}
          <h1 className="text-3xl font-bold mb-2">{clockResult.staff_name}</h1>
          <p className="text-xl opacity-90">{clockResult.message}</p>
          <p className="text-sm opacity-60 mt-4">Returning to PIN pad...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center relative" data-testid="terminal-pin-screen">
      {/* Admin gear icon */}
      <button
        onClick={() => setShowAdminDialog(true)}
        className="absolute top-4 right-4 p-2 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-slate-800 transition-colors"
        data-testid="terminal-admin-btn"
        title="Admin"
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* Business branding */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">{businessName}</h1>
        <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">POS Terminal</p>
      </div>

      {/* PIN Display */}
      <div className="mb-6">
        <div className="flex gap-3 justify-center" data-testid="pin-dots">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all duration-200 ${
                i < pin.length ? 'bg-indigo-400 scale-110' : 'bg-slate-700 border border-slate-600'
              }`}
            />
          ))}
        </div>
        <p className="text-center text-sm text-slate-500 mt-3">Enter your 4-digit PIN</p>
        {error && <p className="text-center text-sm text-red-400 mt-2 font-medium" data-testid="pin-error">{error}</p>}
      </div>

      {/* Hidden input for keyboard */}
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        value={pin}
        onChange={(e) => handlePinChange(e.target.value)}
        className="sr-only"
        autoFocus
        data-testid="terminal-pin-input"
      />

      {/* NumPad */}
      <div className="grid grid-cols-3 gap-3 w-72" data-testid="terminal-numpad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
          <button
            key={n}
            onClick={() => handleNumPad(String(n))}
            disabled={loading}
            className="h-16 rounded-2xl bg-slate-800/80 border border-slate-700/50 text-white text-2xl font-semibold hover:bg-slate-700 active:bg-slate-600 active:scale-95 transition-all disabled:opacity-50"
            data-testid={`numpad-${n}`}
          >
            {n}
          </button>
        ))}
        <div />
        <button
          onClick={() => handleNumPad('0')}
          disabled={loading}
          className="h-16 rounded-2xl bg-slate-800/80 border border-slate-700/50 text-white text-2xl font-semibold hover:bg-slate-700 active:bg-slate-600 active:scale-95 transition-all disabled:opacity-50"
          data-testid="numpad-0"
        >
          0
        </button>
        <button
          onClick={handleBackspace}
          disabled={loading}
          className="h-16 rounded-2xl bg-slate-800/50 border border-slate-700/50 text-slate-400 text-lg font-semibold hover:bg-slate-700 hover:text-white active:scale-95 transition-all disabled:opacity-50"
          data-testid="numpad-backspace"
        >
          {loading ? <Loader2 className="w-5 h-5 mx-auto animate-spin" /> : 'DEL'}
        </button>
      </div>

      {/* Clock icon hint + GDPR notice */}
      <div className="mt-8 flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2 text-slate-600 text-xs">
          <Clock className="w-3.5 h-3.5" />
          <span>Clock in/out & POS access</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-600/50 text-[10px]">
          <Camera className="w-3 h-3" />
          <span>Photo captured for payroll security</span>
        </div>
      </div>

      {/* Admin Unregister Dialog */}
      <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Terminal Admin</DialogTitle>
            <DialogDescription>Enter Manager PIN to unregister this device</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Manager PIN"
              className="h-12 text-center text-xl tracking-widest font-mono"
              data-testid="admin-unregister-pin"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleUnregister}
                disabled={adminPin.length < 4 || adminVerifying}
                variant="destructive"
                className="flex-1"
                data-testid="confirm-unregister-btn"
              >
                {adminVerifying ? 'Verifying...' : 'Unregister Terminal'}
              </Button>
              <Button variant="outline" onClick={() => { setShowAdminDialog(false); setAdminPin(''); }} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
