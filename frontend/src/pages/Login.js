import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Eye, EyeOff, WifiOff, ArrowRight, Hash, Keyboard, Delete } from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();
  const { login, pinLogin } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [mode, setMode] = useState('password'); // 'password' or 'pin'
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [hasPins, setHasPins] = useState(false);
  const [lastRestaurantId, setLastRestaurantId] = useState('');

  const checkOnline = useCallback(() => {
    setIsOnline(navigator.onLine);
  }, []);

  useEffect(() => {
    window.addEventListener('online', checkOnline);
    window.addEventListener('offline', checkOnline);
    const interval = setInterval(checkOnline, 2000);
    return () => {
      window.removeEventListener('online', checkOnline);
      window.removeEventListener('offline', checkOnline);
      clearInterval(interval);
    };
  }, [checkOnline]);

  // Check if any restaurant has PIN-enabled staff (use last known restaurant_id)
  useEffect(() => {
    // Try saved user first, then fallback to last_restaurant_id (persists across logout)
    let restId = '';
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u.restaurant_id) restId = u.restaurant_id;
      } catch {}
    }
    if (!restId) {
      restId = localStorage.getItem('last_restaurant_id') || '';
    }
    if (restId) {
      setLastRestaurantId(restId);
      authAPI.restaurantHasPins(restId)
        .then(res => setHasPins(res.has_pins))
        .catch(() => {});
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!navigator.onLine) {
      setIsOnline(false);
      toast.error('You are offline. Check your internet connection.');
      return;
    }
    setLoading(true);
    try {
      const response = await login(username, password);
      navigateByRole(response.user.role);
    } catch (error) {
      if (!navigator.onLine || error.message === 'Network Error' || !error.response) {
        setIsOnline(false);
        toast.error('No internet connection. Please check your WiFi or mobile data.');
      } else {
        toast.error(error.response?.data?.detail || 'Invalid credentials');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePinDigit = (digit) => {
    setPinError('');
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      // Auto-submit when 4 digits entered
      if (newPin.length === 4) {
        submitPin(newPin);
      }
    }
  };

  const handlePinBackspace = () => {
    setPinError('');
    setPin(prev => prev.slice(0, -1));
  };

  const submitPin = async (pinValue) => {
    if (!lastRestaurantId) {
      setPinError('No restaurant configured. Use password login first.');
      setPin('');
      return;
    }
    setLoading(true);
    try {
      const response = await pinLogin(pinValue, lastRestaurantId);
      navigateByRole(response.user.role);
    } catch (error) {
      setPinError('Invalid PIN');
      setPin('');
      // Shake animation on error
      const pad = document.querySelector('[data-testid="pin-pad"]');
      if (pad) {
        pad.style.animation = 'none';
        pad.offsetHeight; // Trigger reflow
        pad.style.animation = 'shake 0.4s ease-in-out';
      }
    } finally {
      setLoading(false);
    }
  };

  const navigateByRole = (role) => {
    if (role === 'platform_owner') {
      navigate('/platform/dashboard');
    } else if (role === 'admin') {
      navigate('/dashboard');
    } else {
      navigate('/pos');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" data-testid="login-page">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950" />
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-[420px] mx-4 animate-slide-up" data-testid="login-card">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-heading text-4xl font-bold text-white tracking-tight">
            Heva<span className="text-indigo-400">POS</span>
          </h1>
          <p className="text-slate-400 text-sm mt-2 font-medium">Restaurant management, simplified</p>
        </div>

        {/* Mode Toggle */}
        {hasPins && (
          <div className="flex justify-center gap-2 mb-4" data-testid="login-mode-toggle">
            <button
              onClick={() => { setMode('password'); setPinError(''); setPin(''); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                mode === 'password'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-300'
              }`}
              data-testid="mode-password-btn"
            >
              <Keyboard className="w-4 h-4" />
              Password
            </button>
            <button
              onClick={() => { setMode('pin'); setPinError(''); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                mode === 'pin'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-300'
              }`}
              data-testid="mode-pin-btn"
            >
              <Hash className="w-4 h-4" />
              Quick PIN
            </button>
          </div>
        )}

        {/* Form Card */}
        <div className="glass-dark rounded-2xl p-8">
          {!isOnline && (
            <div className="mb-5 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-sm text-red-300" data-testid="offline-warning">
              <WifiOff className="w-5 h-5 shrink-0" />
              <div>
                <div className="font-semibold">You are offline</div>
                <div className="text-xs text-red-400 mt-0.5">Check your WiFi or mobile data and try again.</div>
              </div>
            </div>
          )}

          {mode === 'password' ? (
            <form onSubmit={handleSubmit} className="space-y-5" data-testid="password-login-form">
              <div>
                <label className="text-xs font-bold tracking-[0.1em] uppercase text-slate-400 mb-2 block">Username</label>
                <Input
                  id="username"
                  data-testid="login-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                  className="h-12 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base"
                />
              </div>
              <div>
                <label className="text-xs font-bold tracking-[0.1em] uppercase text-slate-400 mb-2 block">Password</label>
                <div className="relative">
                  <Input
                    id="password"
                    data-testid="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    className="h-12 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 pr-12 text-base"
                  />
                  <button
                    type="button"
                    data-testid="toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                data-testid="login-submit"
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-base btn-haptic transition-all duration-150 mt-2"
                disabled={loading || !isOnline}
              >
                {!isOnline ? 'Offline' : loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center gap-2 justify-center">
                    Sign In
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </form>
          ) : (
            /* PIN Pad Login */
            <div data-testid="pin-pad" className="space-y-6">
              <div className="text-center">
                <p className="text-slate-400 text-sm font-medium mb-4">Enter your 4-digit staff PIN</p>
                {/* PIN Dots */}
                <div className="flex justify-center gap-4 mb-3" data-testid="pin-dots">
                  {[0, 1, 2, 3].map(i => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-full transition-all duration-200 ${
                        i < pin.length
                          ? 'bg-indigo-400 scale-110 shadow-lg shadow-indigo-500/30'
                          : 'bg-slate-700 border border-slate-600'
                      }`}
                    />
                  ))}
                </div>
                {pinError && (
                  <p className="text-red-400 text-sm font-medium mt-2" data-testid="pin-error">{pinError}</p>
                )}
              </div>

              {/* Number Pad */}
              <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button
                    key={num}
                    data-testid={`pin-key-${num}`}
                    onClick={() => handlePinDigit(String(num))}
                    disabled={loading || pin.length >= 4}
                    className="h-16 rounded-2xl bg-slate-800/70 hover:bg-slate-700/80 active:bg-indigo-600 active:scale-95 text-white text-2xl font-bold transition-all duration-100 border border-slate-700/50 select-none"
                    style={{ touchAction: 'manipulation' }}
                  >
                    {num}
                  </button>
                ))}
                <div /> {/* Empty cell */}
                <button
                  data-testid="pin-key-0"
                  onClick={() => handlePinDigit('0')}
                  disabled={loading || pin.length >= 4}
                  className="h-16 rounded-2xl bg-slate-800/70 hover:bg-slate-700/80 active:bg-indigo-600 active:scale-95 text-white text-2xl font-bold transition-all duration-100 border border-slate-700/50 select-none"
                  style={{ touchAction: 'manipulation' }}
                >
                  0
                </button>
                <button
                  data-testid="pin-key-backspace"
                  onClick={handlePinBackspace}
                  disabled={loading || pin.length === 0}
                  className="h-16 rounded-2xl bg-slate-800/70 hover:bg-slate-700/80 active:bg-red-600 active:scale-95 text-slate-400 text-xl font-bold transition-all duration-100 border border-slate-700/50 flex items-center justify-center select-none"
                  style={{ touchAction: 'manipulation' }}
                >
                  <Delete className="w-6 h-6" />
                </button>
              </div>

              {loading && (
                <div className="flex justify-center">
                  <span className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6">
          Powered by HevaPOS Cloud
        </p>
      </div>

      {/* Shake animation for PIN error */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
};

export default Login;
