import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, CheckCircle, Loader2, AlertCircle } from 'lucide-react';

export default function StaffOnboarding() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [posPin, setPosPin] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/onboarding/${token}`)
      .then(res => setInfo(res.data))
      .catch(err => setError(err.response?.data?.detail || 'Invalid or expired link'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) return toast.error('Password must be at least 6 characters');
    if (password !== confirmPassword) return toast.error('Passwords do not match');
    if (posPin && (posPin.length !== 4 || !/^\d{4}$/.test(posPin))) return toast.error('PIN must be exactly 4 digits');

    setSaving(true);
    try {
      await api.post(`/onboarding/${token}/complete`, {
        password,
        pos_pin: posPin || null,
      });
      setDone(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Setup failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Link Unavailable</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <Button onClick={() => navigate('/login')} variant="outline" className="text-white border-slate-600">Go to Login</Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4" data-testid="onboarding-success">
        <div className="text-center max-w-sm">
          <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">You're all set!</h1>
          <p className="text-slate-400 mb-6">Your account is ready. Sign in with your email and the password you just created.</p>
          <Button onClick={() => navigate('/login')} className="bg-indigo-600 hover:bg-indigo-500 text-white w-full h-12" data-testid="go-to-login-btn">
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  const capLabels = {
    'pos.access': 'POS Access',
    'kds.access': 'Kitchen Display',
    'workforce.clock_in': 'Clock In/Out',
    'workforce.manage_rota': 'Manage Shifts',
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4" data-testid="onboarding-page">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-heading text-3xl font-bold text-white tracking-tight">
            Heva<span className="text-indigo-400">One</span>
          </h1>
          <p className="text-slate-400 text-sm mt-2">Welcome to <span className="font-semibold text-white">{info.business_name}</span></p>
        </div>

        {/* Setup Card */}
        <div className="glass-dark rounded-2xl p-6 md:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-white">Set up your account</h2>
            <p className="text-sm text-slate-400 mt-1">
              Hi <span className="font-semibold text-indigo-300">{info.username}</span>, create your password to get started.
            </p>
          </div>

          {/* Capabilities badge */}
          {info.capabilities?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-6">
              {info.capabilities.map(c => (
                <span key={c} className="px-2 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
                  {capLabels[c] || c}
                </span>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5 block">Password</Label>
              <div className="relative">
                <Input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  required
                  className="h-12 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus-visible:bg-slate-800/80 pr-12"
                  data-testid="onboard-password"
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5 block">Confirm Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                required
                className="h-12 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus-visible:bg-slate-800/80"
                data-testid="onboard-confirm-password"
              />
            </div>

            <div>
              <Label className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5 block">4-Digit PIN <span className="text-slate-500 normal-case font-normal">(for POS & clock-in)</span></Label>
              <Input
                type="tel"
                inputMode="numeric"
                maxLength={4}
                value={posPin}
                onChange={(e) => setPosPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="e.g. 1234"
                className="h-12 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus-visible:bg-slate-800/80 tracking-[0.3em] text-center text-xl font-mono"
                data-testid="onboard-pin"
              />
              <p className="text-xs text-slate-500 mt-1">Used for quick login on shared terminals</p>
            </div>

            <Button
              type="submit"
              disabled={saving}
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-base mt-2"
              data-testid="onboard-submit"
            >
              {saving ? 'Setting up...' : 'Complete Setup'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
