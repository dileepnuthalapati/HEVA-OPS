import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { restaurantAPI, staffAPI, authAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { Save, Users, Store, Lock, Plus, Edit, Trash2, KeyRound, Eye, EyeOff, CreditCard, ExternalLink, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import api from '../services/api';

const TABS = [
  { id: 'business', label: 'Business Info', icon: Store },
  { id: 'stripe', label: 'Stripe Payments', icon: CreditCard },
  { id: 'staff', label: 'User Management', icon: Users },
  { id: 'security', label: 'Security', icon: KeyRound },
];

const RestaurantSettings = () => {
  const [activeTab, setActiveTab] = useState('business');
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '', address_line1: '', address_line2: '', city: '', postcode: '',
    phone: '', email: '', website: '', vat_number: '', receipt_footer: '',
  });

  // Staff state
  const [staffList, setStaffList] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [showStaffDialog, setShowStaffDialog] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [staffForm, setStaffForm] = useState({ username: '', password: '', role: 'user' });
  const [staffSaving, setStaffSaving] = useState(false);

  // Reset password dialog
  const [resetDialog, setResetDialog] = useState({ open: false, staff: null });
  const [newPassword, setNewPassword] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);

  // Change own password
  const [pwdForm, setPwdForm] = useState({ current: '', newPwd: '', confirm: '' });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [showPwdFields, setShowPwdFields] = useState({ current: false, new: false, confirm: false });

  // Stripe Connect
  const [stripeStatus, setStripeStatus] = useState(null);
  const [stripeLoading, setStripeLoading] = useState(false);

  // Manager PIN
  const [hasManagerPin, setHasManagerPin] = useState(false);
  const [pinForm, setPinForm] = useState({ password: '', pin: '', confirmPin: '' });
  const [pinSaving, setPinSaving] = useState(false);
  const [showPinFields, setShowPinFields] = useState({ password: false, pin: false, confirm: false });

  useEffect(() => { loadRestaurant(); }, []);
  useEffect(() => { if (activeTab === 'staff') loadStaff(); }, [activeTab]);
  useEffect(() => { if (activeTab === 'stripe') loadStripeStatus(); }, [activeTab]);
  useEffect(() => { if (activeTab === 'security') loadManagerPinStatus(); }, [activeTab]);

  const loadRestaurant = async () => {
    try {
      const data = await restaurantAPI.getMy();
      setRestaurant(data);
      if (data.business_info) setFormData(data.business_info);
    } catch (error) { toast.error('Failed to load restaurant settings'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await restaurantAPI.updateSettings(formData);
      toast.success('Settings saved successfully!');
      loadRestaurant();
    } catch (error) { toast.error('Failed to save settings'); }
    finally { setSaving(false); }
  };

  const handleChange = (field, value) => setFormData({ ...formData, [field]: value });

  // Stripe Connect
  const loadStripeStatus = async () => {
    setStripeLoading(true);
    try {
      const res = await api.get('/payments/connect/status');
      setStripeStatus(res.data);
    } catch { setStripeStatus({ connected: false, status: 'not_started' }); }
    finally { setStripeLoading(false); }
  };

  const handleConnectStripe = async () => {
    try {
      setStripeLoading(true);
      const currentUrl = window.location.href.split('?')[0];
      const res = await api.post('/payments/connect/onboard', {
        return_url: currentUrl + '?stripe=return',
        refresh_url: currentUrl + '?stripe=refresh',
      });
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      const detail = err.response?.data?.detail || '';
      if (detail.includes('not yet available') || detail.includes('being set up') || detail.includes('Invalid API Key') || detail.includes('authentication')) {
        toast.error(detail || 'Stripe payments are not yet available. Please try again later.');
      } else {
        toast.error(detail || 'Failed to start Stripe onboarding');
      }
    } finally { setStripeLoading(false); }
  };

  // Staff handlers
  const loadStaff = async () => {
    setStaffLoading(true);
    try {
      const data = await staffAPI.getAll();
      setStaffList(data);
    } catch (error) { toast.error('Failed to load staff'); }
    finally { setStaffLoading(false); }
  };

  const openAddStaff = () => {
    setEditingStaff(null);
    setStaffForm({ username: '', password: '', role: 'user' });
    setShowStaffDialog(true);
  };

  const openEditStaff = (staff) => {
    setEditingStaff(staff);
    setStaffForm({ username: staff.username, password: '', role: staff.role });
    setShowStaffDialog(true);
  };

  const handleStaffSubmit = async (e) => {
    e.preventDefault();
    if (!staffForm.username.trim()) return toast.error('Username is required');
    if (!editingStaff && !staffForm.password.trim()) return toast.error('Password is required');
    setStaffSaving(true);
    try {
      if (editingStaff) {
        await staffAPI.update(editingStaff.id, staffForm);
        toast.success(`Staff "${staffForm.username}" updated`);
      } else {
        await staffAPI.create(staffForm);
        toast.success(`Staff "${staffForm.username}" created`);
      }
      setShowStaffDialog(false);
      loadStaff();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save staff');
    } finally { setStaffSaving(false); }
  };

  const handleDeleteStaff = async (staff) => {
    if (!window.confirm(`Delete staff member "${staff.username}"?`)) return;
    try {
      await staffAPI.delete(staff.id);
      toast.success(`"${staff.username}" deleted`);
      loadStaff();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete staff');
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword.trim() || newPassword.length < 4) return toast.error('Password must be at least 4 characters');
    try {
      await staffAPI.resetPassword(resetDialog.staff.id, newPassword);
      toast.success(`Password reset for "${resetDialog.staff.username}"`);
      setResetDialog({ open: false, staff: null });
      setNewPassword('');
    } catch (error) { toast.error('Failed to reset password'); }
  };

  const handleChangeOwnPassword = async (e) => {
    e.preventDefault();
    if (pwdForm.newPwd !== pwdForm.confirm) return toast.error('New passwords do not match');
    if (pwdForm.newPwd.length < 4) return toast.error('Password must be at least 4 characters');
    setPwdSaving(true);
    try {
      await authAPI.changePassword(pwdForm.current, pwdForm.newPwd);
      toast.success('Password changed successfully');
      setPwdForm({ current: '', newPwd: '', confirm: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to change password');
    } finally { setPwdSaving(false); }
  };

  // Manager PIN handlers
  const loadManagerPinStatus = async () => {
    try {
      const res = await api.get('/auth/has-manager-pin');
      setHasManagerPin(res.data.has_pin);
    } catch { setHasManagerPin(false); }
  };

  const handleSetManagerPin = async (e) => {
    e.preventDefault();
    if (pinForm.pin !== pinForm.confirmPin) return toast.error('PINs do not match');
    if (pinForm.pin.length < 4) return toast.error('PIN must be at least 4 digits');
    setPinSaving(true);
    try {
      await api.post('/auth/set-manager-pin', {
        current_password: pinForm.password,
        manager_pin: pinForm.pin,
      });
      toast.success(hasManagerPin ? 'Manager PIN updated' : 'Manager PIN set successfully');
      setPinForm({ password: '', pin: '', confirmPin: '' });
      setHasManagerPin(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to set Manager PIN');
    } finally { setPinSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen">
        <Sidebar />
        <div className="flex-1 p-8"><div className="text-center py-12">Loading...</div></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-1" data-testid="settings-heading">Restaurant Settings</h1>
            <p className="text-muted-foreground text-sm">Manage your restaurant, staff, and security</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 p-1 bg-muted rounded-lg overflow-x-auto" data-testid="settings-tabs">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  data-testid={`tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                    activeTab === tab.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" /> {tab.label}
                </button>
              );
            })}
          </div>

          {/* Business Info Tab */}
          {activeTab === 'business' && (
            <>
              {restaurant && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="font-semibold text-blue-900">Subscription Status</div>
                    <div className={`px-3 py-1 rounded-full text-sm ${
                      restaurant.subscription_status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {restaurant.subscription_status === 'trial' ? 'Free Trial' : restaurant.subscription_status?.toUpperCase()}
                    </div>
                  </div>
                  <div className="text-sm text-blue-700">
                    Plan: {restaurant.currency || 'GBP'} {restaurant.price}/month - All features included
                  </div>
                </div>
              )}

              <Card data-testid="restaurant-settings-form">
                <CardHeader>
                  <CardTitle className="text-2xl font-semibold">Business Information</CardTitle>
                  <CardDescription>This information will appear on all customer receipts</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <Label htmlFor="name" className="text-sm font-semibold">Restaurant Name <span className="text-red-500">*</span></Label>
                      <Input id="name" data-testid="restaurant-name-input" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="Mario's Pizza Restaurant" required className="h-12" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Label htmlFor="address_line1" className="text-sm font-semibold">Address Line 1 <span className="text-red-500">*</span></Label>
                        <Input id="address_line1" data-testid="address-line1-input" value={formData.address_line1} onChange={(e) => handleChange('address_line1', e.target.value)} placeholder="123 High Street" required className="h-12" />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="address_line2" className="text-sm font-semibold">Address Line 2 <span className="text-muted-foreground text-xs">(optional)</span></Label>
                        <Input id="address_line2" data-testid="address-line2-input" value={formData.address_line2} onChange={(e) => handleChange('address_line2', e.target.value)} placeholder="Suite 100" className="h-12" />
                      </div>
                      <div>
                        <Label htmlFor="city" className="text-sm font-semibold">City <span className="text-red-500">*</span></Label>
                        <Input id="city" data-testid="city-input" value={formData.city} onChange={(e) => handleChange('city', e.target.value)} placeholder="London" required className="h-12" />
                      </div>
                      <div>
                        <Label htmlFor="postcode" className="text-sm font-semibold">Postcode <span className="text-red-500">*</span></Label>
                        <Input id="postcode" data-testid="postcode-input" value={formData.postcode} onChange={(e) => handleChange('postcode', e.target.value)} placeholder="SW1A 1AA" required className="h-12" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="phone" className="text-sm font-semibold">Phone Number <span className="text-red-500">*</span></Label>
                        <Input id="phone" data-testid="phone-input" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} placeholder="020 1234 5678" required className="h-12" />
                      </div>
                      <div>
                        <Label htmlFor="email" className="text-sm font-semibold">Email Address <span className="text-red-500">*</span></Label>
                        <Input id="email" data-testid="email-input" type="email" value={formData.email} onChange={(e) => handleChange('email', e.target.value)} placeholder="info@restaurant.co.uk" required className="h-12" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="website" className="text-sm font-semibold">Website <span className="text-muted-foreground text-xs">(optional)</span></Label>
                        <Input id="website" data-testid="website-input" value={formData.website} onChange={(e) => handleChange('website', e.target.value)} placeholder="www.restaurant.co.uk" className="h-12" />
                      </div>
                      <div>
                        <Label htmlFor="vat_number" className="text-sm font-semibold">VAT/Tax Number <span className="text-muted-foreground text-xs">(optional)</span></Label>
                        <Input id="vat_number" data-testid="vat-number-input" value={formData.vat_number} onChange={(e) => handleChange('vat_number', e.target.value)} placeholder="GB123456789" className="h-12" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="receipt_footer" className="text-sm font-semibold">Receipt Footer Message <span className="text-muted-foreground text-xs">(optional)</span></Label>
                      <Textarea id="receipt_footer" data-testid="receipt-footer-input" value={formData.receipt_footer} onChange={(e) => handleChange('receipt_footer', e.target.value)} placeholder="Thank you for visiting! Come again soon!" rows={3} />
                      <p className="text-xs text-muted-foreground mt-2">This message will appear at the bottom of customer receipts</p>
                    </div>
                    <div className="pt-4">
                      <Button type="submit" data-testid="save-settings-button" disabled={saving} className="w-full md:w-auto h-12 px-8">
                        <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save Settings'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* Receipt Preview */}
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-xl font-semibold">Receipt Preview</CardTitle>
                  <CardDescription>This is how your information will appear on customer receipts</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="p-6 bg-white border-2 border-dashed rounded-lg font-mono text-sm">
                    <div className="text-center mb-4">
                      <div className="text-lg font-bold">{formData.name || 'Your Restaurant Name'}</div>
                      <div className="text-xs text-muted-foreground">CUSTOMER RECEIPT</div>
                    </div>
                    <div className="border-t border-b border-dashed py-3 my-3">
                      {formData.address_line1 && <div>{formData.address_line1}</div>}
                      {formData.address_line2 && <div>{formData.address_line2}</div>}
                      {formData.city && formData.postcode && <div>{formData.city} {formData.postcode}</div>}
                      {formData.phone && <div>Tel: {formData.phone}</div>}
                      {formData.email && <div>Email: {formData.email}</div>}
                      {formData.vat_number && <div>VAT No: {formData.vat_number}</div>}
                    </div>
                    <div className="text-xs text-muted-foreground text-center">... order details ...</div>
                    <div className="border-t border-dashed pt-3 mt-3">
                      {formData.receipt_footer && <div className="text-center mb-2">{formData.receipt_footer}</div>}
                      {formData.website && <div className="text-center text-xs">Visit us at: {formData.website}</div>}
                      <div className="text-center text-xs text-muted-foreground mt-3">Powered by HevaPOS</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Stripe Connect Tab */}
          {activeTab === 'stripe' && (
            <Card data-testid="stripe-connect-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5" /> Stripe Payments</CardTitle>
                <CardDescription>Connect your Stripe account to accept online payments from guests</CardDescription>
              </CardHeader>
              <CardContent>
                {stripeLoading ? (
                  <div className="py-8 text-center text-muted-foreground">Loading...</div>
                ) : stripeStatus?.connected ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <CheckCircle className="w-8 h-8 text-emerald-600 shrink-0" />
                      <div>
                        <p className="font-bold text-emerald-900">Stripe Connected</p>
                        <p className="text-sm text-emerald-700">Your account is active and accepting payments.</p>
                        <p className="text-xs text-emerald-600/70 mt-1 font-mono">{stripeStatus.account_id}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-muted/40 rounded-lg">
                        <p className="text-xs text-muted-foreground">Charges</p>
                        <p className="font-bold text-sm">{stripeStatus.charges_enabled ? 'Enabled' : 'Disabled'}</p>
                      </div>
                      <div className="p-3 bg-muted/40 rounded-lg">
                        <p className="text-xs text-muted-foreground">Payouts</p>
                        <p className="font-bold text-sm">{stripeStatus.payouts_enabled ? 'Enabled' : 'Disabled'}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Guests who scan your QR codes will see a "Pay Bill" button. A 0.3% platform fee applies to each transaction.
                    </p>
                  </div>
                ) : stripeStatus?.status === 'pending' || stripeStatus?.status === 'incomplete' ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <Clock className="w-8 h-8 text-amber-600 shrink-0" />
                      <div>
                        <p className="font-bold text-amber-900">Onboarding Incomplete</p>
                        <p className="text-sm text-amber-700">You started connecting but haven't finished. Click below to resume.</p>
                      </div>
                    </div>
                    <Button onClick={handleConnectStripe} data-testid="resume-stripe-btn" className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white">
                      <ExternalLink className="w-4 h-4 mr-2" /> Resume Stripe Setup
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                      <AlertCircle className="w-8 h-8 text-slate-500 shrink-0" />
                      <div>
                        <p className="font-bold text-slate-800">Not Connected</p>
                        <p className="text-sm text-slate-600">Connect your Stripe account to enable Pay-at-Table for your guests.</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">How it works:</p>
                      <ul className="space-y-1 ml-4 list-disc">
                        <li>Guest scans the QR code on their table</li>
                        <li>After ordering, they tap "Pay Bill" to pay with card</li>
                        <li>Payment goes directly to your bank account</li>
                        <li>A small 0.3% platform fee is applied per transaction</li>
                      </ul>
                    </div>
                    <Button onClick={handleConnectStripe} data-testid="connect-stripe-btn" disabled={stripeLoading} className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white text-base font-semibold">
                      <ExternalLink className="w-4 h-4 mr-2" /> Connect with Stripe
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Staff Management Tab */}
          {activeTab === 'staff' && (
            <Card data-testid="staff-management-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-semibold">Users</CardTitle>
                  <CardDescription>Manage your restaurant team</CardDescription>
                </div>
                <Button onClick={openAddStaff} data-testid="add-staff-btn" size="sm">
                  <Plus className="w-4 h-4 mr-2" /> Add User
                </Button>
              </CardHeader>
              <CardContent>
                {staffLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading staff...</div>
                ) : staffList.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground mb-4">No users yet</p>
                    <Button onClick={openAddStaff} variant="outline"><Plus className="w-4 h-4 mr-2" /> Add Your First User</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {staffList.map((member) => (
                      <div key={member.id} data-testid={`staff-row-${member.id}`} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-primary">{member.username?.charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{member.username}</div>
                            <div className="text-xs text-muted-foreground">
                              <span className={`px-2 py-0.5 rounded-full ${member.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                {member.role === 'admin' ? 'Admin' : 'Staff'}
                              </span>
                              {member.created_at && <span className="ml-2">Joined {new Date(member.created_at).toLocaleDateString()}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button size="sm" variant="outline" data-testid={`reset-pwd-${member.id}`} onClick={() => { setResetDialog({ open: true, staff: member }); setNewPassword(''); }} title="Reset Password" className="h-8 w-8 p-0">
                            <KeyRound className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" data-testid={`edit-staff-${member.id}`} onClick={() => openEditStaff(member)} title="Edit" className="h-8 w-8 p-0">
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" data-testid={`delete-staff-${member.id}`} onClick={() => handleDeleteStaff(member)} title="Delete" className="h-8 w-8 p-0 text-red-500 hover:bg-red-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              {/* Change Password Card */}
              <Card data-testid="change-password-card">
                <CardHeader>
                  <CardTitle className="text-xl font-semibold flex items-center gap-2"><Lock className="w-5 h-5" /> Change Your Password</CardTitle>
                  <CardDescription>Update your account password</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleChangeOwnPassword} className="space-y-5 max-w-md">
                    <div>
                      <Label htmlFor="current-pwd" className="text-sm font-semibold">Current Password</Label>
                      <div className="relative">
                        <Input id="current-pwd" data-testid="current-password-input" type={showPwdFields.current ? 'text' : 'password'} value={pwdForm.current} onChange={(e) => setPwdForm({ ...pwdForm, current: e.target.value })} placeholder="Enter current password" required className="h-12 pr-10" />
                        <button type="button" onClick={() => setShowPwdFields({ ...showPwdFields, current: !showPwdFields.current })} className="absolute right-3 top-3.5 text-muted-foreground">
                          {showPwdFields.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="new-pwd" className="text-sm font-semibold">New Password</Label>
                      <div className="relative">
                        <Input id="new-pwd" data-testid="new-password-input" type={showPwdFields.new ? 'text' : 'password'} value={pwdForm.newPwd} onChange={(e) => setPwdForm({ ...pwdForm, newPwd: e.target.value })} placeholder="Enter new password (min 4 chars)" required className="h-12 pr-10" />
                        <button type="button" onClick={() => setShowPwdFields({ ...showPwdFields, new: !showPwdFields.new })} className="absolute right-3 top-3.5 text-muted-foreground">
                          {showPwdFields.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="confirm-pwd" className="text-sm font-semibold">Confirm New Password</Label>
                      <div className="relative">
                        <Input id="confirm-pwd" data-testid="confirm-password-input" type={showPwdFields.confirm ? 'text' : 'password'} value={pwdForm.confirm} onChange={(e) => setPwdForm({ ...pwdForm, confirm: e.target.value })} placeholder="Re-enter new password" required className="h-12 pr-10" />
                        <button type="button" onClick={() => setShowPwdFields({ ...showPwdFields, confirm: !showPwdFields.confirm })} className="absolute right-3 top-3.5 text-muted-foreground">
                          {showPwdFields.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" data-testid="change-password-btn" disabled={pwdSaving} className="h-12 px-8">
                      <Lock className="w-4 h-4 mr-2" /> {pwdSaving ? 'Changing...' : 'Change Password'}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Manager PIN Card */}
              <Card data-testid="manager-pin-card">
                <CardHeader>
                  <CardTitle className="text-xl font-semibold flex items-center gap-2"><KeyRound className="w-5 h-5" /> Manager PIN</CardTitle>
                  <CardDescription>
                    {hasManagerPin
                      ? 'Your Manager PIN is set. Staff will need this PIN to authorize voids and cancellations.'
                      : 'Set a dedicated PIN that staff must enter to authorize order voids and cancellations.'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className={`mb-4 flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${hasManagerPin ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`} data-testid="pin-status-badge">
                    {hasManagerPin ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {hasManagerPin ? 'PIN is active' : 'No PIN set — voids are unprotected'}
                  </div>
                  <form onSubmit={handleSetManagerPin} className="space-y-5 max-w-md">
                    <div>
                      <Label htmlFor="pin-password" className="text-sm font-semibold">Your Account Password</Label>
                      <div className="relative">
                        <Input id="pin-password" data-testid="pin-password-input" type={showPinFields.password ? 'text' : 'password'} value={pinForm.password} onChange={(e) => setPinForm({ ...pinForm, password: e.target.value })} placeholder="Verify your password first" required className="h-12 pr-10" />
                        <button type="button" onClick={() => setShowPinFields({ ...showPinFields, password: !showPinFields.password })} className="absolute right-3 top-3.5 text-muted-foreground">
                          {showPinFields.password ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="manager-pin" className="text-sm font-semibold">{hasManagerPin ? 'New Manager PIN' : 'Manager PIN'}</Label>
                      <div className="relative">
                        <Input id="manager-pin" data-testid="manager-pin-input" type={showPinFields.pin ? 'text' : 'password'} value={pinForm.pin} onChange={(e) => setPinForm({ ...pinForm, pin: e.target.value })} placeholder="Enter 4+ digit PIN" required className="h-12 pr-10" inputMode="numeric" />
                        <button type="button" onClick={() => setShowPinFields({ ...showPinFields, pin: !showPinFields.pin })} className="absolute right-3 top-3.5 text-muted-foreground">
                          {showPinFields.pin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="confirm-pin" className="text-sm font-semibold">Confirm PIN</Label>
                      <div className="relative">
                        <Input id="confirm-pin" data-testid="confirm-pin-input" type={showPinFields.confirm ? 'text' : 'password'} value={pinForm.confirmPin} onChange={(e) => setPinForm({ ...pinForm, confirmPin: e.target.value })} placeholder="Re-enter PIN" required className="h-12 pr-10" inputMode="numeric" />
                        <button type="button" onClick={() => setShowPinFields({ ...showPinFields, confirm: !showPinFields.confirm })} className="absolute right-3 top-3.5 text-muted-foreground">
                          {showPinFields.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" data-testid="set-pin-btn" disabled={pinSaving} className="h-12 px-8">
                      <KeyRound className="w-4 h-4 mr-2" /> {pinSaving ? 'Saving...' : hasManagerPin ? 'Update PIN' : 'Set Manager PIN'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Staff Dialog */}
      <Dialog open={showStaffDialog} onOpenChange={(open) => { if (!open) setShowStaffDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingStaff ? 'Edit User' : 'Add User'}</DialogTitle>
            <DialogDescription>{editingStaff ? 'Update user details' : 'Create a new user account'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleStaffSubmit} className="space-y-4 mt-2">
            <div>
              <Label htmlFor="staff-username">Username *</Label>
              <Input id="staff-username" data-testid="staff-username-input" value={staffForm.username} onChange={(e) => setStaffForm({ ...staffForm, username: e.target.value })} placeholder="e.g., john_waiter" required className="h-11" />
            </div>
            <div>
              <Label htmlFor="staff-password">{editingStaff ? 'New Password (leave blank to keep)' : 'Password *'}</Label>
              <Input id="staff-password" data-testid="staff-password-input" type="password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} placeholder="Enter password" required={!editingStaff} className="h-11" />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={staffForm.role} onValueChange={(v) => setStaffForm({ ...staffForm, role: v })}>
                <SelectTrigger data-testid="staff-role-select" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Staff (POS only)</SelectItem>
                  <SelectItem value="admin">Admin (Full access)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" data-testid="staff-submit-btn" disabled={staffSaving} className="flex-1">
                {staffSaving ? 'Saving...' : editingStaff ? 'Update' : 'Create'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowStaffDialog(false)} className="flex-1">Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetDialog.open} onOpenChange={(open) => { if (!open) setResetDialog({ open: false, staff: null }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Set a new password for "{resetDialog.staff?.username}"</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>New Password</Label>
              <div className="relative">
                <Input data-testid="reset-password-input" type={showNewPwd ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" className="h-11 pr-10" />
                <button type="button" onClick={() => setShowNewPwd(!showNewPwd)} className="absolute right-3 top-3 text-muted-foreground">
                  {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button data-testid="confirm-reset-pwd-btn" onClick={handleResetPassword} className="flex-1">Reset Password</Button>
              <Button variant="outline" onClick={() => setResetDialog({ open: false, staff: null })} className="flex-1">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RestaurantSettings;
