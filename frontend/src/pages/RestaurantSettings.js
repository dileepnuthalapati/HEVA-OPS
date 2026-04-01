import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { restaurantAPI } from '../services/api';
import printerService from '../services/printer';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { Save, Printer, Wifi, Bluetooth, X, Check } from 'lucide-react';

const RestaurantSettings = () => {
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
  
  // Printer state
  const [printerConnected, setPrinterConnected] = useState(false);
  const [connectedPrinterName, setConnectedPrinterName] = useState(null);
  const [connectingPrinter, setConnectingPrinter] = useState(false);
  const [wifiPrinterIp, setWifiPrinterIp] = useState('');
  const [wifiPrinterPort, setWifiPrinterPort] = useState('9100');

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

  // Printer functions
  const connectBluetoothPrinter = async () => {
    setConnectingPrinter(true);
    try {
      const device = await printerService.discoverBluetoothPrinter();
      setPrinterConnected(true);
      setConnectedPrinterName(device.name);
      toast.success(`Connected to ${device.name}`);
    } catch (error) {
      toast.error('Bluetooth connection failed: ' + error.message);
    } finally {
      setConnectingPrinter(false);
    }
  };

  const connectWifiPrinter = async () => {
    if (!wifiPrinterIp) {
      toast.error('Please enter printer IP address');
      return;
    }
    setConnectingPrinter(true);
    try {
      const device = await printerService.connectWifi(wifiPrinterIp, parseInt(wifiPrinterPort) || 9100);
      setPrinterConnected(true);
      setConnectedPrinterName(device.name);
      toast.success(`Connected to WiFi printer at ${wifiPrinterIp}`);
    } catch (error) {
      toast.error('WiFi connection failed: ' + error.message);
    } finally {
      setConnectingPrinter(false);
    }
  };

  const disconnectPrinter = async () => {
    await printerService.disconnect();
    setPrinterConnected(false);
    setConnectedPrinterName(null);
    toast.success('Printer disconnected');
  };

  const testPrinter = async () => {
    try {
      await printerService.testPrint();
      toast.success('Test page sent to printer');
    } catch (error) {
      toast.error('Test print failed: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
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

          {/* Printer Setup Section */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-xl font-semibold flex items-center gap-2">
                <Printer className="w-5 h-5" />
                Printer Setup
              </CardTitle>
              <CardDescription>
                Connect your thermal receipt printer via Bluetooth or WiFi
              </CardDescription>
            </CardHeader>
            <CardContent>
              {printerConnected ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Check className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <div className="font-semibold text-emerald-800">{connectedPrinterName}</div>
                        <div className="text-sm text-emerald-600">Connected and ready</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={testPrinter}>
                        Test Print
                      </Button>
                      <Button variant="ghost" size="sm" onClick={disconnectPrinter} className="text-red-500">
                        <X className="w-4 h-4 mr-1" />
                        Disconnect
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Bluetooth Option */}
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Bluetooth className="w-5 h-5 text-blue-500" />
                      <span className="font-semibold">Bluetooth Printer</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Discover and connect to nearby Bluetooth printers. Works on Android tablets and Chrome browser.
                    </p>
                    <Button 
                      className="w-full" 
                      onClick={connectBluetoothPrinter}
                      disabled={connectingPrinter}
                    >
                      {connectingPrinter ? 'Searching...' : 'Find Bluetooth Printer'}
                    </Button>
                  </div>

                  {/* WiFi Option */}
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Wifi className="w-5 h-5 text-emerald-500" />
                      <span className="font-semibold">WiFi / Network Printer</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Enter the printer's IP address (find it in printer settings or network config).
                    </p>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Label htmlFor="printer-ip" className="text-xs">IP Address</Label>
                          <Input
                            id="printer-ip"
                            placeholder="192.168.1.100"
                            value={wifiPrinterIp}
                            onChange={(e) => setWifiPrinterIp(e.target.value)}
                          />
                        </div>
                        <div className="w-20">
                          <Label htmlFor="printer-port" className="text-xs">Port</Label>
                          <Input
                            id="printer-port"
                            placeholder="9100"
                            value={wifiPrinterPort}
                            onChange={(e) => setWifiPrinterPort(e.target.value)}
                          />
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        className="w-full" 
                        onClick={connectWifiPrinter}
                        disabled={connectingPrinter || !wifiPrinterIp}
                      >
                        {connectingPrinter ? 'Connecting...' : 'Connect WiFi Printer'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
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
                  <div className="text-lg font-bold">{formData.name || 'Your Restaurant Name'}</div>
                  <div className="text-xs text-muted-foreground">CUSTOMER RECEIPT</div>
                </div>
                <div className="border-t border-b border-dashed py-3 my-3">
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
                    Powered by HevaPOS
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
