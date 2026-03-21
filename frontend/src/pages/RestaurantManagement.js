import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { restaurantAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, Wallet, Settings, Plus, Store } from 'lucide-react';

const Sidebar = ({ active }) => {
  const { logout } = useAuth();

  const menuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/restaurants', icon: Store, label: 'Restaurants' },
    { path: '/categories', icon: FolderTree, label: 'Categories' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">HevaPOS</h1>
        <p className="text-sm text-muted-foreground mt-1">Admin Panel</p>
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

const CURRENCY_OPTIONS = [
  { value: 'GBP', label: '£ GBP - British Pound', symbol: '£' },
  { value: 'USD', label: '$ USD - US Dollar', symbol: '$' },
  { value: 'EUR', label: '€ EUR - Euro', symbol: '€' },
  { value: 'INR', label: '₹ INR - Indian Rupee', symbol: '₹' },
  { value: 'AUD', label: '$ AUD - Australian Dollar', symbol: '$' },
  { value: 'CAD', label: '$ CAD - Canadian Dollar', symbol: '$' },
];

const RestaurantManagement = () => {
  const location = useLocation();
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
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
    subscription_price: '',
    currency: 'GBP',
  });

  useEffect(() => {
    loadRestaurants();
  }, []);

  const loadRestaurants = async () => {
    try {
      const data = await restaurantAPI.getAll();
      setRestaurants(data);
    } catch (error) {
      toast.error('Failed to load restaurants');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await restaurantAPI.create({
        ...formData,
        subscription_price: parseFloat(formData.subscription_price),
      });
      toast.success('Restaurant added successfully!');
      setShowAddDialog(false);
      resetForm();
      loadRestaurants();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add restaurant');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
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
      subscription_price: '',
      currency: 'GBP',
    });
  };

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const getCurrencySymbol = (currency) => {
    return CURRENCY_OPTIONS.find(c => c.value === currency)?.symbol || currency;
  };

  const getTotalRevenue = () => {
    const activeRestaurants = restaurants.filter(r => r.subscription_status === 'active');
    return activeRestaurants.reduce((sum, r) => sum + r.price, 0);
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
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Restaurant Management</h1>
              <p className="text-muted-foreground">Manage all your HevaPOS customers</p>
            </div>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button data-testid="add-restaurant-button" onClick={resetForm}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Restaurant
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Restaurant</DialogTitle>
                  <DialogDescription>
                    Create a new restaurant account with custom pricing
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label htmlFor="name">Restaurant Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        required
                      />
                    </div>
                    
                    <div className="col-span-2">
                      <Label htmlFor="email">Owner Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="phone">Phone *</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => handleChange('phone', e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="address1">Address *</Label>
                      <Input
                        id="address1"
                        value={formData.address_line1}
                        onChange={(e) => handleChange('address_line1', e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="city">City *</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => handleChange('city', e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="postcode">Postcode *</Label>
                      <Input
                        id="postcode"
                        value={formData.postcode}
                        onChange={(e) => handleChange('postcode', e.target.value)}
                        required
                      />
                    </div>

                    <div className="col-span-2 border-t pt-4 mt-2">
                      <h3 className="font-semibold mb-3">Subscription Pricing</h3>
                    </div>

                    <div>
                      <Label htmlFor="currency">Currency *</Label>
                      <Select
                        value={formData.currency}
                        onValueChange={(value) => handleChange('currency', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCY_OPTIONS.map((curr) => (
                            <SelectItem key={curr.value} value={curr.value}>
                              {curr.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="price">Monthly Price *</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {getCurrencySymbol(formData.currency)}
                        </span>
                        <Input
                          id="price"
                          type="number"
                          step="0.01"
                          value={formData.subscription_price}
                          onChange={(e) => handleChange('subscription_price', e.target.value)}
                          className="pl-8"
                          placeholder="19.99"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button type="submit" disabled={saving} className="flex-1">
                      {saving ? 'Adding...' : 'Add Restaurant'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="metric-card">
              <CardHeader className="pb-2">
                <CardDescription className="text-sm font-medium">Total Restaurants</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{restaurants.length}</div>
              </CardContent>
            </Card>

            <Card className="metric-card">
              <CardHeader className="pb-2">
                <CardDescription className="text-sm font-medium">Active</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-600">
                  {restaurants.filter(r => r.subscription_status === 'active').length}
                </div>
              </CardContent>
            </Card>

            <Card className="metric-card">
              <CardHeader className="pb-2">
                <CardDescription className="text-sm font-medium">On Trial</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-600">
                  {restaurants.filter(r => r.subscription_status === 'trial').length}
                </div>
              </CardContent>
            </Card>

            <Card className="metric-card">
              <CardHeader className="pb-2">
                <CardDescription className="text-sm font-medium">Monthly Revenue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  £{getTotalRevenue().toFixed(2)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Restaurants List */}
          {restaurants.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No restaurants yet. Click "Add Restaurant" to add your first customer.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {restaurants.map((restaurant) => (
                <Card key={restaurant.id} data-testid={`restaurant-${restaurant.id}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-bold">{restaurant.business_info?.name || 'Unnamed'}</h3>
                          <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            restaurant.subscription_status === 'active' 
                              ? 'bg-emerald-100 text-emerald-700' 
                              : restaurant.subscription_status === 'trial'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {restaurant.subscription_status.toUpperCase()}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          {restaurant.business_info?.address_line1 && (
                            <div>{restaurant.business_info.address_line1}, {restaurant.business_info.city}</div>
                          )}
                          {restaurant.business_info?.phone && (
                            <div>Tel: {restaurant.business_info.phone}</div>
                          )}
                          {restaurant.business_info?.email && (
                            <div>Email: {restaurant.business_info.email}</div>
                          )}
                          <div className="text-xs pt-1">
                            Created: {new Date(restaurant.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold font-mono text-emerald-600">
                          {getCurrencySymbol(restaurant.currency)}{restaurant.price.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">per month</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RestaurantManagement;
