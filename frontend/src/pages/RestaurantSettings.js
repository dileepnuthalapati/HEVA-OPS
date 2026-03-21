import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { restaurantAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, Wallet, Settings, Save } from 'lucide-react';

const Sidebar = ({ active }) => {
  const { logout, isAdmin } = useAuth();

  const adminItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/categories', icon: FolderTree, label: 'Categories' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
    { path: '/settings', icon: Settings, label: 'Restaurant Settings' },
  ];

  const userItems = [
    { path: '/pos', icon: ShoppingCart, label: 'POS' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  const menuItems = isAdmin ? adminItems : userItems;

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">HevaPOS</h1>
        <p className="text-sm text-muted-foreground mt-1">{isAdmin ? 'Admin Panel' : 'User Panel'}</p>
      </div>
      <nav className="space-y-2">
        {menuItems.map((item) => (
          <Link key={item.path} to={item.path} className={`sidebar-link ${active === item.path ? 'active' : ''}`}>
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <Button variant="outline" className="w-full justify-start" onClick={logout}>
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
};

const RestaurantSettings = () => {
  const location = useLocation();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    address_line1: '',
    address_line2: '',
    city: '',
    postcode: '',
    phone: '',
    email: '',
    website: '',
    vat_number: '',
    receipt_footer: '',
  });

  useEffect(() => {
    loadRestaurant();
  }, []);

  const loadRestaurant = async () => {
    try {
      const data = await restaurantAPI.getMy();
      setRestaurant(data);
      if (data.business_info) {
        setFormData(data.business_info);
      }
    } catch (error) {
      toast.error('Failed to load restaurant settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await restaurantAPI.updateSettings(formData);
      toast.success('Settings saved successfully!');
      loadRestaurant();
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar active={location.pathname} />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar active={location.pathname} />
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Restaurant Settings</h1>
            <p className="text-muted-foreground">
              Customize your business information that appears on receipts
            </p>
          </div>

          {restaurant && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="font-semibold text-blue-900">Subscription Status</div>
                <div className={`px-3 py-1 rounded-full text-sm ${
                  restaurant.subscription_status === 'active' 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {restaurant.subscription_status === 'trial' ? 'Free Trial' : restaurant.subscription_status.toUpperCase()}
                </div>
              </div>
              <div className="text-sm text-blue-700">
                Plan: £{restaurant.price}/month - All features included
              </div>
            </div>
          )}

          <Card data-testid="restaurant-settings-form">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold">Business Information</CardTitle>
              <CardDescription>
                This information will appear on all customer receipts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Restaurant Name */}
                <div>
                  <Label htmlFor="name" className="text-sm font-semibold">
                    Restaurant Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    data-testid="restaurant-name-input"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="Mario's Pizza Restaurant"
                    required
                    className="h-12"
                  />
                </div>

                {/* Address */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="address_line1" className="text-sm font-semibold">
                      Address Line 1 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="address_line1"
                      data-testid="address-line1-input"
                      value={formData.address_line1}
                      onChange={(e) => handleChange('address_line1', e.target.value)}
                      placeholder="123 High Street"
                      required
                      className="h-12"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="address_line2" className="text-sm font-semibold">
                      Address Line 2 <span className="text-muted-foreground text-xs">(optional)</span>
                    </Label>
                    <Input
                      id="address_line2"
                      data-testid="address-line2-input"
                      value={formData.address_line2}
                      onChange={(e) => handleChange('address_line2', e.target.value)}
                      placeholder="Suite 100"
                      className="h-12"
                    />
                  </div>

                  <div>
                    <Label htmlFor="city" className="text-sm font-semibold">
                      City <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="city"
                      data-testid="city-input"
                      value={formData.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                      placeholder="London"
                      required
                      className="h-12"
                    />
                  </div>

                  <div>
                    <Label htmlFor="postcode" className="text-sm font-semibold">
                      Postcode <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="postcode"
                      data-testid="postcode-input"
                      value={formData.postcode}
                      onChange={(e) => handleChange('postcode', e.target.value)}
                      placeholder="SW1A 1AA"
                      required
                      className="h-12"
                    />
                  </div>
                </div>

                {/* Contact Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phone" className="text-sm font-semibold">
                      Phone Number <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="phone"
                      data-testid="phone-input"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      placeholder="020 1234 5678"
                      required
                      className="h-12"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email" className="text-sm font-semibold">
                      Email Address <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="email"
                      data-testid="email-input"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      placeholder="info@restaurant.co.uk"
                      required
                      className="h-12"
                    />
                  </div>
                </div>

                {/* Optional Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="website" className="text-sm font-semibold">
                      Website <span className="text-muted-foreground text-xs">(optional)</span>
                    </Label>
                    <Input
                      id="website"
                      data-testid="website-input"
                      value={formData.website}
                      onChange={(e) => handleChange('website', e.target.value)}
                      placeholder="www.restaurant.co.uk"
                      className="h-12"
                    />
                  </div>

                  <div>
                    <Label htmlFor="vat_number" className="text-sm font-semibold">
                      VAT/Tax Number <span className="text-muted-foreground text-xs">(optional)</span>
                    </Label>
                    <Input
                      id="vat_number"
                      data-testid="vat-number-input"
                      value={formData.vat_number}
                      onChange={(e) => handleChange('vat_number', e.target.value)}
                      placeholder="GB123456789"
                      className="h-12"
                    />
                  </div>
                </div>

                {/* Receipt Footer */}
                <div>
                  <Label htmlFor="receipt_footer" className="text-sm font-semibold">
                    Receipt Footer Message <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Textarea
                    id="receipt_footer"
                    data-testid="receipt-footer-input"
                    value={formData.receipt_footer}
                    onChange={(e) => handleChange('receipt_footer', e.target.value)}
                    placeholder="Thank you for visiting! Come again soon!"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    This message will appear at the bottom of customer receipts
                  </p>
                </div>

                {/* Save Button */}
                <div className="pt-4">
                  <Button
                    type="submit"
                    data-testid="save-settings-button"
                    disabled={saving}
                    className="w-full md:w-auto h-12 px-8"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Preview Section */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Receipt Preview</CardTitle>
              <CardDescription>
                This is how your information will appear on customer receipts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-6 bg-white border-2 border-dashed rounded-lg font-mono text-sm">
                <div className="text-center mb-4">
                  <div className="text-lg font-bold">HevaPOS</div>
                  <div className="text-xs text-muted-foreground">CUSTOMER RECEIPT</div>
                </div>
                <div className="border-t border-b border-dashed py-3 my-3">
                  {formData.name && <div className="font-bold">{formData.name}</div>}
                  {formData.address_line1 && <div>{formData.address_line1}</div>}
                  {formData.address_line2 && <div>{formData.address_line2}</div>}
                  {formData.city && formData.postcode && (
                    <div>{formData.city} {formData.postcode}</div>
                  )}
                  {formData.phone && <div>Tel: {formData.phone}</div>}
                  {formData.email && <div>Email: {formData.email}</div>}
                  {formData.vat_number && <div>VAT No: {formData.vat_number}</div>}
                </div>
                <div className="text-xs text-muted-foreground text-center">
                  ... order details ...
                </div>
                <div className="border-t border-dashed pt-3 mt-3">
                  {formData.receipt_footer && (
                    <div className="text-center mb-2">{formData.receipt_footer}</div>
                  )}
                  {formData.website && (
                    <div className="text-center text-xs">Visit us at: {formData.website}</div>
                  )}
                  <div className="text-center text-xs text-muted-foreground mt-3">
                    Powered by HevaPOS<br/>www.hevapos.com
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default RestaurantSettings;
