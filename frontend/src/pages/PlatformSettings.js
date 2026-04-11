import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import { authAPI, platformAdminAPI, modulePricingAPI } from '../services/api';
import { emailAPI } from '../services/api';
import { Settings, Bell, Shield, CreditCard, Mail, Globe, Key, UserPlus, Trash2, Users, CheckCircle, XCircle, DollarSign, ShoppingCart, ChefHat, QrCode, Calendar } from 'lucide-react';

const PlatformSettings = () => {
  const [settings, setSettings] = useState({
    platformName: 'Heva One',
    supportEmail: 'support@hevaone.com',
    defaultTrialDays: 14,
    defaultPlanPrice: 19.99,
    defaultCurrency: 'GBP',
    enableEmailNotifications: true,
    enableTrialReminders: true,
    enableAutoSuspend: false,
    stripeEnabled: false,
    stripePublicKey: '',
    stripeSecretKey: ''
  });

  const [saving, setSaving] = useState(false);
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  
  // Platform admins state
  const [admins, setAdmins] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);

  // Module pricing state
  const [modulePrices, setModulePrices] = useState({ pos: 19.99, kds: 9.99, qr_ordering: 14.99, workforce: 24.99, currency: 'GBP' });
  const [savingPricing, setSavingPricing] = useState(false);

  useEffect(() => {
    loadAdmins();
    loadEmailStatus();
    loadModulePricing();
  }, []);

  const loadEmailStatus = async () => {
    try {
      const status = await emailAPI.getStatus();
      setEmailStatus(status);
    } catch { /* ignore */ }
  };

  const loadModulePricing = async () => {
    try {
      const data = await modulePricingAPI.get();
      setModulePrices(data);
    } catch { /* ignore */ }
  };

  const handleSaveModulePricing = async () => {
    setSavingPricing(true);
    try {
      await modulePricingAPI.update(modulePrices);
      toast.success('Module pricing updated!');
    } catch (e) {
      toast.error('Failed to save pricing');
    } finally { setSavingPricing(false); }
  };

  const loadAdmins = async () => {
    try {
      const data = await platformAdminAPI.getAll();
      setAdmins(data);
    } catch (error) {
      console.error('Failed to load admins:', error);
    } finally {
      setLoadingAdmins(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // TODO: Save to backend
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success('Platform settings saved!');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setChangingPassword(true);
    try {
      await authAPI.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminUsername || !newAdminPassword) {
      toast.error('Username and password are required');
      return;
    }
    if (newAdminPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setAddingAdmin(true);
    try {
      await platformAdminAPI.create(newAdminUsername, newAdminPassword, newAdminEmail);
      toast.success(`Admin "${newAdminUsername}" created successfully!`);
      setShowAddAdmin(false);
      setNewAdminUsername('');
      setNewAdminPassword('');
      setNewAdminEmail('');
      loadAdmins();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create admin');
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleDeleteAdmin = async (admin) => {
    if (!confirm(`Are you sure you want to delete admin "${admin.username}"?`)) {
      return;
    }

    try {
      await platformAdminAPI.delete(admin.id);
      toast.success('Admin deleted successfully');
      loadAdmins();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete admin');
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-8 pt-16 md:pt-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-1 md:mb-2">Platform Settings</h1>
            <p className="text-muted-foreground">Configure global platform settings and preferences</p>
          </div>

          {/* Change Password */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                Change Password
              </CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>
                <div>
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
              <Button onClick={handleChangePassword} disabled={changingPassword}>
                {changingPassword ? 'Changing...' : 'Change Password'}
              </Button>
            </CardContent>
          </Card>

          {/* Platform Administrators */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Platform Administrators
                  </CardTitle>
                  <CardDescription>Manage platform admin accounts</CardDescription>
                </div>
                <Button onClick={() => setShowAddAdmin(true)}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Admin
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingAdmins ? (
                <div className="text-center py-4">Loading...</div>
              ) : admins.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">No administrators found</div>
              ) : (
                <div className="space-y-3">
                  {admins.map((admin) => (
                    <div key={admin.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <div className="font-semibold">{admin.username}</div>
                        <div className="text-sm text-muted-foreground">
                          {admin.email || 'No email'} • Created: {new Date(admin.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteAdmin(admin)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* General Settings */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                General Settings
              </CardTitle>
              <CardDescription>Basic platform configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="platformName">Platform Name</Label>
                  <Input
                    id="platformName"
                    value={settings.platformName}
                    onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="supportEmail">Support Email</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={settings.supportEmail}
                    onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Subscription Settings */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Subscription Defaults
              </CardTitle>
              <CardDescription>Default settings for new restaurant subscriptions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="trialDays">Trial Period (Days)</Label>
                  <Input
                    id="trialDays"
                    type="number"
                    min="0"
                    value={settings.defaultTrialDays}
                    onChange={(e) => setSettings({ ...settings, defaultTrialDays: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="defaultPrice">Default Price</Label>
                  <Input
                    id="defaultPrice"
                    type="number"
                    step="0.01"
                    value={settings.defaultPlanPrice}
                    onChange={(e) => setSettings({ ...settings, defaultPlanPrice: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="currency">Default Currency</Label>
                  <Input
                    id="currency"
                    value={settings.defaultCurrency}
                    onChange={(e) => setSettings({ ...settings, defaultCurrency: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Email Configuration */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Email Service
              </CardTitle>
              <CardDescription>Send reminders, onboarding emails, and notifications</CardDescription>
            </CardHeader>
            <CardContent>
              {emailStatus ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {emailStatus.configured ? (
                      <div className="flex items-center gap-2 text-emerald-600">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-medium">Email service is active</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-amber-600">
                        <XCircle className="w-5 h-5" />
                        <span className="font-medium">Email service not configured</span>
                      </div>
                    )}
                  </div>
                  {emailStatus.configured ? (
                    <p className="text-sm text-muted-foreground">Sending from: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{emailStatus.sender_email}</code></p>
                  ) : (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                      <p className="mb-2">To enable email notifications:</p>
                      <ol className="list-decimal list-inside space-y-1 text-xs">
                        <li>Sign up at <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">resend.com</a> (free — 100 emails/day)</li>
                        <li>Get your API key from the dashboard</li>
                        <li>Add <code className="bg-amber-100 px-1 rounded">RESEND_API_KEY=re_xxxxx</code> to your Railway environment variables</li>
                        <li>Optionally set <code className="bg-amber-100 px-1 rounded">SENDER_EMAIL=you@yourdomain.com</code></li>
                      </ol>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Loading email status...</p>
              )}
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notifications
              </CardTitle>
              <CardDescription>Configure email and notification preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">Send email notifications for important events</p>
                </div>
                <Switch
                  checked={settings.enableEmailNotifications}
                  onCheckedChange={(checked) => setSettings({ ...settings, enableEmailNotifications: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Trial Expiry Reminders</Label>
                  <p className="text-sm text-muted-foreground">Send reminders before trial period ends</p>
                </div>
                <Switch
                  checked={settings.enableTrialReminders}
                  onCheckedChange={(checked) => setSettings({ ...settings, enableTrialReminders: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-Suspend Inactive</Label>
                  <p className="text-sm text-muted-foreground">Automatically suspend accounts after trial expires</p>
                </div>
                <Switch
                  checked={settings.enableAutoSuspend}
                  onCheckedChange={(checked) => setSettings({ ...settings, enableAutoSuspend: checked })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Payment Integration */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Payment Integration
              </CardTitle>
              <CardDescription>Configure payment gateway for subscriptions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Label>Enable Stripe</Label>
                  <p className="text-sm text-muted-foreground">Accept payments via Stripe</p>
                </div>
                <Switch
                  checked={settings.stripeEnabled}
                  onCheckedChange={(checked) => setSettings({ ...settings, stripeEnabled: checked })}
                />
              </div>
              {settings.stripeEnabled && (
                <div className="space-y-4 pt-4 border-t">
                  <div>
                    <Label htmlFor="stripePublic">Stripe Publishable Key</Label>
                    <Input
                      id="stripePublic"
                      value={settings.stripePublicKey}
                      onChange={(e) => setSettings({ ...settings, stripePublicKey: e.target.value })}
                      placeholder="pk_live_..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="stripeSecret">Stripe Secret Key</Label>
                    <Input
                      id="stripeSecret"
                      type="password"
                      value={settings.stripeSecretKey}
                      onChange={(e) => setSettings({ ...settings, stripeSecretKey: e.target.value })}
                      placeholder="sk_live_..."
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <Mail className="w-3 h-3 inline mr-1" />
                    Get your API keys from the <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="text-primary underline">Stripe Dashboard</a>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="lg">
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>

          {/* Module Pricing */}
          <Card className="mt-6" data-testid="module-pricing-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Module Pricing
              </CardTitle>
              <CardDescription>Set per-module monthly pricing for restaurants. Shown in the "Upgrade" modal when restaurants view locked modules.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: 'pos', label: 'POS', icon: ShoppingCart },
                  { key: 'kds', label: 'KDS', icon: ChefHat },
                  { key: 'qr_ordering', label: 'QR Ordering', icon: QrCode },
                  { key: 'workforce', label: 'Workforce', icon: Calendar },
                ].map(mod => {
                  const Icon = mod.icon;
                  return (
                    <div key={mod.key} className="flex items-center gap-3 p-3 rounded-lg border bg-slate-50/50" data-testid={`pricing-${mod.key}`}>
                      <Icon className="w-5 h-5 text-slate-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{mod.label}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">{modulePrices.currency || 'GBP'}</span>
                        <Input
                          type="number"
                          step="0.01"
                          value={modulePrices[mod.key] || ''}
                          onChange={e => setModulePrices({ ...modulePrices, [mod.key]: parseFloat(e.target.value) || 0 })}
                          className="w-24 h-8 text-right text-sm"
                        />
                        <span className="text-xs text-muted-foreground">/mo</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end mt-4">
                <Button size="sm" onClick={handleSaveModulePricing} disabled={savingPricing} data-testid="save-module-pricing-btn">
                  {savingPricing ? 'Saving...' : 'Save Pricing'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Admin Dialog */}
      <Dialog open={showAddAdmin} onOpenChange={setShowAddAdmin}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Platform Administrator</DialogTitle>
            <DialogDescription>
              Create a new admin account with full platform access
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="adminUsername">Username</Label>
              <Input
                id="adminUsername"
                value={newAdminUsername}
                onChange={(e) => setNewAdminUsername(e.target.value)}
                placeholder="Enter username"
              />
            </div>
            <div>
              <Label htmlFor="adminPassword">Password</Label>
              <Input
                id="adminPassword"
                type="password"
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
                placeholder="Enter password (min 6 characters)"
              />
            </div>
            <div>
              <Label htmlFor="adminEmail">Email (Optional)</Label>
              <Input
                id="adminEmail"
                type="email"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="Enter email"
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddAdmin(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleAddAdmin} disabled={addingAdmin}>
                {addingAdmin ? 'Creating...' : 'Create Admin'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlatformSettings;
