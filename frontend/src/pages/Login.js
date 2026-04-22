import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Eye, EyeOff, WifiOff, ArrowRight } from 'lucide-react';
import InstallAppButton from '../components/InstallAppButton';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!navigator.onLine) {
      setIsOnline(false);
      toast.error('You are offline. Check your internet connection.');
      return;
    }
    setLoading(true);
    try {
      const response = await login(emailOrUsername, password);
      const role = response.user.role;
      const features = response.user.features || {};
      if (role === 'platform_owner') {
        navigate('/platform/dashboard');
      } else if (role === 'admin') {
        navigate('/dashboard');
      } else {
        // Personal mode staff → always Heva Ops
        navigate('/heva-ops/shifts');
      }
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
            Heva<span className="text-indigo-400">ONE</span>
          </h1>
          <p className="text-slate-400 text-sm mt-2 font-medium">Sign in to your account</p>
        </div>

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

          <form onSubmit={handleSubmit} className="space-y-5" data-testid="password-login-form">
            <div>
              <label className="text-xs font-bold tracking-[0.1em] uppercase text-slate-400 mb-2 block">Email or Username</label>
              <Input
                id="email"
                data-testid="login-username"
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                className="h-12 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus-visible:bg-slate-800/80 text-base"
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
                  className="h-12 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus-visible:bg-slate-800/80 pr-12 text-base"
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
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center gap-3 mt-6">
          <InstallAppButton variant="compact" />
          <p className="text-center text-xs text-slate-500">
            Powered by Heva ONE
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
