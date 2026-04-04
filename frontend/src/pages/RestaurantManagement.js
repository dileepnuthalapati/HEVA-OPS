import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { restaurantAPI } from '../services/api';
import { emailAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Store, Building2, Mail, Phone, MapPin, DollarSign, User, Users, Trash2, Key, Edit, Send, Loader2 } from 'lucide-react';

const CURRENCY_OPTIONS = [
  { value: 'GBP', label: '£ GBP - British Pound', symbol: '£' },
  { value: 'USD', label: '$ USD - US Dollar', symbol: '$' },
  { value: 'EUR', label: '€ EUR - Euro', symbol: '€' },
  { value: 'INR', label: '₹ INR - Indian Rupee', symbol: '₹' },
  { value: 'AUD', label: '$ AUD - Australian Dollar', symbol: '$' },
  { value: 'CAD', label: '$ CAD - Canadian Dollar', symbol: '$' },
];

const RestaurantManagement = () => {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [restaurantUsers, setRestaurantUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editingRestaurant, setEditingRestaurant] = useState(null);
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
    // Admin user for the restaurant
    admin_username: '',
    admin_password: '',
  });
  const [newUserData, setNewUserData] = useState({
    username: '',
    password: '',
    role: 'user'
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
      if (editingRestaurant) {
        // Update existing restaurant - structure payload to match backend RestaurantCreate model
        await restaurantAPI.update(editingRestaurant.id, {
          owner_email: formData.email,
          subscription_plan: editingRestaurant.subscription_plan || 'standard_monthly',
          price: parseFloat(formData.subscription_price) || 19.99,
          currency: formData.currency,
          business_info: {
            name: formData.name,
            address_line1: formData.address_line1,
            address_line2: formData.address_line2,
            city: formData.city,
            postcode: formData.postcode,
            phone: formData.phone,
            email: formData.email,
            website: formData.website,
            vat_number: formData.vat_number,
            receipt_footer: formData.receipt_footer,
          },
        });
        toast.success('Restaurant updated successfully!');
      } else {
        // Create restaurant first - structure payload to match backend RestaurantCreate model
        const restaurant = await restaurantAPI.create({
          owner_email: formData.email,
          subscription_plan: 'standard_monthly',
          price: parseFloat(formData.subscription_price) || 19.99,
          currency: formData.currency,
          business_info: {
            name: formData.name,
            address_line1: formData.address_line1,
            address_line2: formData.address_line2,
            city: formData.city,
            postcode: formData.postcode,
            phone: formData.phone,
            email: formData.email,
            website: formData.website,
            vat_number: formData.vat_number,
            receipt_footer: formData.receipt_footer,
          },
        });
        
        // Create admin user for the restaurant if provided
        if (formData.admin_username && formData.admin_password) {
          try {
            await restaurantAPI.createUser(restaurant.id, {
              username: formData.admin_username,
              password: formData.admin_password,
              role: 'admin',
              restaurant_id: restaurant.id
            });
            toast.success(`Restaurant and admin user "${formData.admin_username}" created!`);
          } catch (userError) {
            toast.warning(`Restaurant created, but user creation failed: ${userError.response?.data?.detail || 'Unknown error'}`);
          }
        } else {
          toast.success('Restaurant added successfully!');
        }

        // Auto-send welcome email
        if (formData.email) {
          try {
            const emailResult = await emailAPI.sendWelcome(restaurant.id);
            if (emailResult?.status === 'success') {
              toast.success('Welcome email sent!');
            }
          } catch { /* ignore email errors on create */ }
        }
      }
      
      setShowAddDialog(false);
      setEditingRestaurant(null);
      resetForm();
      loadRestaurants();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save restaurant');
    } finally {
      setSaving(false);
    }
  };

  const handleEditRestaurant = (restaurant) => {
    setEditingRestaurant(restaurant);
    setFormData({
      name: restaurant.business_info?.name || '',
      address_line1: restaurant.business_info?.address_line1 || '',
      address_line2: restaurant.business_info?.address_line2 || '',
      city: restaurant.business_info?.city || '',
      postcode: restaurant.business_info?.postcode || '',
      phone: restaurant.business_info?.phone || '',
      email: restaurant.owner_email || '',
      website: restaurant.business_info?.website || '',
      vat_number: restaurant.business_info?.vat_number || '',
      receipt_footer: restaurant.business_info?.receipt_footer || '',
      subscription_price: restaurant.price?.toString() || '',
      currency: restaurant.currency || 'GBP',
      admin_username: '',
      admin_password: '',
    });
    setShowAddDialog(true);
  };

  const handleDeleteRestaurant = async (restaurant) => {
    if (!window.confirm(`Are you sure you want to delete "${restaurant.business_info?.name || 'this restaurant'}"? This will delete ALL data including orders, tables, and users.`)) {
      return;
    }
    
    try {
      await restaurantAPI.delete(restaurant.id);
      toast.success('Restaurant deleted successfully');
      loadRestaurants();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete restaurant');
    }
  };

  const openUserManagement = async (restaurant) => {
    setSelectedRestaurant(restaurant);
    try {
      const users = await restaurantAPI.getUsers(restaurant.id);
      setRestaurantUsers(users);
    } catch (error) {
      setRestaurantUsers([]);
    }
    setShowUserDialog(true);
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!selectedRestaurant) return;
    
    try {
      await restaurantAPI.createUser(selectedRestaurant.id, {
        ...newUserData,
        restaurant_id: selectedRestaurant.id
      });
      toast.success(`User "${newUserData.username}" created!`);
      setNewUserData({ username: '', password: '', role: 'user' });
      // Refresh users
      const users = await restaurantAPI.getUsers(selectedRestaurant.id);
      setRestaurantUsers(users);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Delete user "${username}"?`)) return;
    
    try {
      await restaurantAPI.deleteUser(selectedRestaurant.id, userId);
      toast.success('User deleted');
      const users = await restaurantAPI.getUsers(selectedRestaurant.id);
      setRestaurantUsers(users);
    } catch (error) {
      toast.error('Failed to delete user');
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
      admin_username: '',
      admin_password: '',
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
      <div className="flex flex-col md:flex-row min-h-screen">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-1 md:mb-2">Restaurant Management</h1>
              <p className="text-muted-foreground">Manage all your HevaPOS customers</p>
            </div>
            <Dialog open={showAddDialog} onOpenChange={(open) => {
              setShowAddDialog(open);
              if (!open) {
                setEditingRestaurant(null);
                resetForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button data-testid="add-restaurant-button" onClick={() => {
                  setEditingRestaurant(null);
                  resetForm();
                }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Restaurant
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingRestaurant ? 'Edit Restaurant' : 'Add New Restaurant'}</DialogTitle>
                  <DialogDescription>
                    {editingRestaurant ? 'Update restaurant details' : 'Create a new restaurant account with custom pricing'}
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

                    <div className="col-span-2 border-t pt-4 mt-2">
                      <h3 className="font-semibold mb-1 flex items-center gap-2">
                        <Key className="w-4 h-4" />
                        Admin User (Optional)
                      </h3>
                      <p className="text-xs text-muted-foreground mb-3">Create an admin account for this restaurant</p>
                    </div>

                    <div>
                      <Label htmlFor="admin_username">Admin Username</Label>
                      <Input
                        id="admin_username"
                        value={formData.admin_username}
                        onChange={(e) => handleChange('admin_username', e.target.value)}
                        placeholder="e.g., admin_pizzapalace"
                      />
                    </div>

                    <div>
                      <Label htmlFor="admin_password">Admin Password</Label>
                      <Input
                        id="admin_password"
                        type="password"
                        value={formData.admin_password}
                        onChange={(e) => handleChange('admin_password', e.target.value)}
                        placeholder="Min 6 characters"
                      />
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

          {/* User Management Dialog */}
          <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Manage Users - {selectedRestaurant?.business_info?.name}
                </DialogTitle>
                <DialogDescription>
                  Create and manage users for this restaurant
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 mt-4">
                {/* Add New User Form */}
                <form onSubmit={handleAddUser} className="space-y-3 p-4 bg-slate-50 rounded-lg">
                  <h4 className="font-medium text-sm">Add New User</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Username</Label>
                      <Input
                        value={newUserData.username}
                        onChange={(e) => setNewUserData({...newUserData, username: e.target.value})}
                        placeholder="username"
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Password</Label>
                      <Input
                        type="password"
                        value={newUserData.password}
                        onChange={(e) => setNewUserData({...newUserData, password: e.target.value})}
                        placeholder="password"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Select value={newUserData.role} onValueChange={(v) => setNewUserData({...newUserData, role: v})}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="user">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button type="submit" size="sm" className="flex-1">
                      <Plus className="w-3 h-3 mr-1" />
                      Add User
                    </Button>
                  </div>
                </form>

                {/* Existing Users */}
                <div>
                  <h4 className="font-medium text-sm mb-2">Existing Users ({restaurantUsers.length})</h4>
                  {restaurantUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No users yet</p>
                  ) : (
                    <div className="space-y-2">
                      {restaurantUsers.map((user) => (
                        <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <div className="font-medium text-sm">{user.username}</div>
                              <div className="text-xs text-muted-foreground capitalize">{user.role}</div>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-red-500 hover:text-red-700"
                            onClick={() => handleDeleteUser(user.id, user.username)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>

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
                        <div className="text-xs text-muted-foreground mb-3">per month</div>
                        <div className="flex gap-2 justify-end">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleEditRestaurant(restaurant)}
                            data-testid={`edit-restaurant-${restaurant.id}`}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => openUserManagement(restaurant)}
                          >
                            <Users className="w-4 h-4 mr-1" />
                            Users
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="text-red-500 hover:text-red-700 hover:border-red-300"
                            onClick={() => handleDeleteRestaurant(restaurant)}
                            data-testid={`delete-restaurant-${restaurant.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
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
