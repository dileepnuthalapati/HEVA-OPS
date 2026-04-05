import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { subscriptionAPI, notificationAPI, stripeAPI, emailAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { toast } from 'sonner';
import { CreditCard, AlertTriangle, CheckCircle, XCircle, Clock, Bell, RefreshCw, Mail, ExternalLink, Send, Loader2 } from 'lucide-react';

const statusConfig = {
  trial: { color: 'bg-blue-100 text-blue-700', icon: Clock, label: 'Trial' },
  active: { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle, label: 'Active' },
  suspended: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Suspended' },
  cancelled: { color: 'bg-slate-100 text-slate-600', icon: XCircle, label: 'Cancelled' },
};

const SubscriptionManagement = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [checking, setChecking] = useState(false);
  const [creatingCheckout, setCreatingCheckout] = useState(false);
  const [sendingEmail, setSendingEmail] = useState({});
  const [emailConfigured, setEmailConfigured] = useState(false);

  useEffect(() => {
    loadData();
    checkEmailStatus();
  }, []);

  const loadData = async () => {
    try {
      const [subs, notifs] = await Promise.all([
        subscriptionAPI.getAll(),
        notificationAPI.getAll(),
      ]);
      setSubscriptions(subs);
      setNotifications(notifs);
    } catch (error) {
      toast.error('Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  };

  const checkEmailStatus = async () => {
    try {
      const status = await emailAPI.getStatus();
      setEmailConfigured(status.configured);
    } catch { /* ignore */ }
  };

  const handleStatusChange = async () => {
    if (!selectedRestaurant || !newStatus) return;
    try {
      await subscriptionAPI.update(selectedRestaurant.id, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      setSelectedRestaurant(null);
      setNewStatus('');
      loadData();
    } catch (error) {
      toast.error('Failed to update subscription');
    }
  };

  const handleCheckTrials = async () => {
    setChecking(true);
    try {
      const result = await subscriptionAPI.checkTrials();
      toast.success(`Checked ${result.total_trials_checked} trials. Expired: ${result.expired_and_suspended.length}, Expiring soon: ${result.expiring_soon_notified.length}`);
      loadData();
    } catch (error) {
      toast.error('Failed to check trials');
    } finally {
      setChecking(false);
    }
  };

  const handleStripeCheckout = async () => {
    setCreatingCheckout(true);
    try {
      const result = await stripeAPI.createCheckout();
      if (result.checkout_url) {
        window.open(result.checkout_url, '_blank');
      } else {
        toast.error('No checkout URL returned');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create Stripe checkout');
    } finally {
      setCreatingCheckout(false);
    }
  };

  const handleSendEmail = async (type, restaurantId, label) => {
    const key = `${type}_${restaurantId}`;
    setSendingEmail(prev => ({ ...prev, [key]: true }));
    try {
      let result;
      if (type === 'trial') {
        result = await emailAPI.sendTrialReminder(restaurantId);
      } else if (type === 'payment') {
        result = await emailAPI.sendPaymentReminder(restaurantId);
      }
      if (result?.status === 'skipped') {
        toast.warning(result.message || 'Email service not configured');
      } else {
        toast.success(result?.message || `${label} sent!`);
      }
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || `Failed to send ${label.toLowerCase()}`);
    } finally {
      setSendingEmail(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleSendNotificationEmail = async (notifId) => {
    setSendingEmail(prev => ({ ...prev, [notifId]: true }));
    try {
      const result = await emailAPI.sendNotification(notifId);
      if (result?.status === 'skipped') {
        toast.warning(result.message || 'Email service not configured');
      } else {
        toast.success(result?.message || 'Email sent!');
      }
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send email');
    } finally {
      setSendingEmail(prev => ({ ...prev, [notifId]: false }));
    }
  };

  const handleMarkSent = async (notifId) => {
    try {
      await notificationAPI.markSent(notifId);
      loadData();
    } catch (error) {
      toast.error('Failed to mark notification');
    }
  };

  const pendingNotifications = notifications.filter(n => n.status === 'pending');

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-8 pt-16 md:pt-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
            <div>
              <h1 className="text-2xl md:text-4xl font-bold tracking-tight" data-testid="subscriptions-heading">Subscriptions</h1>
              <p className="text-sm md:text-base text-muted-foreground">{subscriptions.length} restaurants</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleStripeCheckout} disabled={creatingCheckout} data-testid="stripe-checkout-btn" variant="outline" className="shrink-0">
                <ExternalLink className={`w-4 h-4 mr-2 ${creatingCheckout ? 'animate-spin' : ''}`} />
                {creatingCheckout ? 'Opening...' : 'Stripe Billing'}
              </Button>
              <Button onClick={handleCheckTrials} disabled={checking} data-testid="check-trials-btn" className="shrink-0">
                <RefreshCw className={`w-4 h-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
                Check Trials
              </Button>
            </div>
          </div>

          {/* Email Status Banner */}
          {!emailConfigured && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-sm text-amber-800" data-testid="email-not-configured">
              <Mail className="w-4 h-4 shrink-0" />
              <span>Email not configured. Add <code className="bg-amber-100 px-1 rounded text-xs">RESEND_API_KEY</code> to your environment to send emails. <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">Get free key</a></span>
            </div>
          )}

          {/* Notifications Banner */}
          {pendingNotifications.length > 0 && (
            <Card className="mb-6 border-amber-200 bg-amber-50" data-testid="notifications-banner">
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-600" />
                  {pendingNotifications.length} Pending Notification{pendingNotifications.length > 1 ? 's' : ''}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {pendingNotifications.slice(0, 5).map((n) => (
                    <div key={n.id} className="flex items-center justify-between p-2 bg-white rounded border text-sm gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{n.message}</div>
                        <div className="text-xs text-muted-foreground">{n.email} &bull; {new Date(n.created_at).toLocaleString()}</div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {n.email && (
                          <Button size="sm" variant="default" onClick={() => handleSendNotificationEmail(n.id)} disabled={sendingEmail[n.id]} className="h-7 text-xs" data-testid={`send-notif-email-${n.id}`}>
                            {sendingEmail[n.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3 mr-1" /> Email</>}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => handleMarkSent(n.id)} className="h-7 text-xs">
                          <CheckCircle className="w-3 h-3 mr-1" /> Done
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {subscriptions.map((sub) => {
                const config = statusConfig[sub.subscription_status] || statusConfig.trial;
                const StatusIcon = config.icon;
                const isTrialKey = `trial_${sub.id}`;
                const isPaymentKey = `payment_${sub.id}`;
                return (
                  <Card key={sub.id} data-testid={`sub-card-${sub.id}`}>
                    <CardHeader className="pb-3 px-4 pt-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">{sub.name}</CardTitle>
                          <CardDescription className="text-xs truncate">{sub.owner_email}</CardDescription>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 shrink-0 ${config.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {config.label}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Plan</span>
                          <span className="font-medium capitalize">{sub.subscription_plan?.replace('_', ' ')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Price</span>
                          <span className="font-mono font-bold">{sub.currency} {sub.price?.toFixed(2)}</span>
                        </div>
                        {sub.subscription_status === 'trial' && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Trial Days Left</span>
                            <span className={`font-bold ${sub.trial_days_left <= 3 ? 'text-red-600' : 'text-blue-600'}`}>
                              {sub.trial_days_left} days
                            </span>
                          </div>
                        )}
                        {sub.next_billing_date && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Next Billing</span>
                            <span className="text-xs">{new Date(sub.next_billing_date).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-col gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          data-testid={`manage-sub-${sub.id}`}
                          onClick={() => { setSelectedRestaurant(sub); setNewStatus(sub.subscription_status); }}
                        >
                          <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                          Manage Subscription
                        </Button>

                        {/* Email actions based on status */}
                        {sub.subscription_status === 'trial' && sub.owner_email && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                            data-testid={`trial-reminder-${sub.id}`}
                            onClick={() => handleSendEmail('trial', sub.id, 'Trial reminder')}
                            disabled={sendingEmail[isTrialKey]}
                          >
                            {sendingEmail[isTrialKey] ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Mail className="w-3.5 h-3.5 mr-1.5" />}
                            Send Trial Reminder
                          </Button>
                        )}
                        {(sub.subscription_status === 'suspended' || sub.subscription_status === 'active') && sub.owner_email && (
                          <Button
                            variant="outline"
                            size="sm"
                            className={`w-full ${sub.subscription_status === 'suspended' ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-amber-600 border-amber-200 hover:bg-amber-50'}`}
                            data-testid={`payment-reminder-${sub.id}`}
                            onClick={() => handleSendEmail('payment', sub.id, 'Payment reminder')}
                            disabled={sendingEmail[isPaymentKey]}
                          >
                            {sendingEmail[isPaymentKey] ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Mail className="w-3.5 h-3.5 mr-1.5" />}
                            Send Payment Reminder
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Change Status Dialog */}
      <Dialog open={!!selectedRestaurant} onOpenChange={(open) => { if (!open) setSelectedRestaurant(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Manage Subscription</DialogTitle>
            <DialogDescription>{selectedRestaurant?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger data-testid="status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newStatus === 'suspended' && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                Suspending will block POS access for this restaurant.
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSelectedRestaurant(null)}>Cancel</Button>
              <Button className="flex-1" data-testid="confirm-status-btn" onClick={handleStatusChange}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubscriptionManagement;
