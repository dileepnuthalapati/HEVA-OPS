import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { printerAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { Plus, Printer, Wifi, Bluetooth, Trash2, TestTube, Check, Star, Edit } from 'lucide-react';

const PrinterSettings = () => {
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddPrinter, setShowAddPrinter] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState(null);
  const [testResult, setTestResult] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'wifi',
    address: '',
    is_default: false,
    paper_width: 80
  });

  useEffect(() => {
    loadPrinters();
  }, []);

  const loadPrinters = async () => {
    try {
      const data = await printerAPI.getAll();
      setPrinters(data);
    } catch (error) {
      toast.error('Failed to load printers');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'wifi',
      address: '',
      is_default: false,
      paper_width: 80
    });
    setEditingPrinter(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingPrinter) {
        await printerAPI.update(editingPrinter.id, formData);
        toast.success('Printer updated!');
      } else {
        await printerAPI.create(formData);
        toast.success('Printer added!');
      }
      setShowAddPrinter(false);
      resetForm();
      loadPrinters();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save printer');
    }
  };

  const handleDelete = async (printerId) => {
    if (!window.confirm('Are you sure you want to delete this printer?')) return;
    try {
      await printerAPI.delete(printerId);
      toast.success('Printer deleted');
      loadPrinters();
    } catch (error) {
      toast.error('Failed to delete printer');
    }
  };

  const handleTest = async (printer) => {
    try {
      toast.loading('Testing printer...');
      const result = await printerAPI.test(printer.id);
      setTestResult(result);
      toast.dismiss();
      toast.success('Test receipt generated! Check the result below.');
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to test printer');
    }
  };

  const handleEdit = (printer) => {
    setFormData({
      name: printer.name,
      type: printer.type,
      address: printer.address,
      is_default: printer.is_default,
      paper_width: printer.paper_width
    });
    setEditingPrinter(printer);
    setShowAddPrinter(true);
  };

  const handleSetDefault = async (printer) => {
    try {
      await printerAPI.update(printer.id, { is_default: true });
      toast.success(`${printer.name} is now the default printer`);
      loadPrinters();
    } catch (error) {
      toast.error('Failed to set default printer');
    }
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
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-1 md:mb-2">Printer Settings</h1>
              <p className="text-muted-foreground">Configure ESC/POS thermal printers for receipts</p>
            </div>
            <Dialog open={showAddPrinter} onOpenChange={(open) => { setShowAddPrinter(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button data-testid="add-printer-button">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Printer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingPrinter ? 'Edit Printer' : 'Add New Printer'}</DialogTitle>
                  <DialogDescription>
                    Configure a thermal receipt printer (ESC/POS compatible)
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="name">Printer Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="e.g., Kitchen Printer"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label>Connection Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(v) => setFormData({...formData, type: v, address: ''})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wifi">
                          <div className="flex items-center gap-2">
                            <Wifi className="w-4 h-4" />
                            WiFi / Network
                          </div>
                        </SelectItem>
                        <SelectItem value="bluetooth">
                          <div className="flex items-center gap-2">
                            <Bluetooth className="w-4 h-4" />
                            Bluetooth
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="address">
                      {formData.type === 'wifi' ? 'IP Address:Port *' : 'Bluetooth MAC Address *'}
                    </Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      placeholder={formData.type === 'wifi' ? '192.168.1.100:9100' : '00:11:22:33:44:55'}
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.type === 'wifi' 
                        ? 'Usually port 9100 for ESC/POS printers'
                        : 'Find this in your printer\'s Bluetooth settings'}
                    </p>
                  </div>

                  <div>
                    <Label>Paper Width</Label>
                    <Select
                      value={formData.paper_width.toString()}
                      onValueChange={(v) => setFormData({...formData, paper_width: parseInt(v)})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="80">80mm (Standard)</SelectItem>
                        <SelectItem value="58">58mm (Compact)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="is_default">Set as default printer</Label>
                    <Switch
                      id="is_default"
                      checked={formData.is_default}
                      onCheckedChange={(v) => setFormData({...formData, is_default: v})}
                    />
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button type="submit" className="flex-1">
                      {editingPrinter ? 'Update Printer' : 'Add Printer'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => { setShowAddPrinter(false); resetForm(); }}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Printers List */}
          {printers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Printer className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">No printers configured</h3>
                <p className="text-muted-foreground mb-4">
                  Add a thermal receipt printer to start printing kitchen and customer receipts.
                </p>
                <Button onClick={() => setShowAddPrinter(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Printer
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {printers.map((printer) => (
                <Card key={printer.id} data-testid={`printer-${printer.id}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                          printer.type === 'wifi' ? 'bg-blue-100' : 'bg-purple-100'
                        }`}>
                          {printer.type === 'wifi' 
                            ? <Wifi className="w-7 h-7 text-blue-600" />
                            : <Bluetooth className="w-7 h-7 text-purple-600" />
                          }
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl font-bold">{printer.name}</h3>
                            {printer.is_default && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                                <Star className="w-3 h-3" />
                                Default
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            <span className="font-mono">{printer.address}</span>
                            <span className="mx-2">•</span>
                            <span>{printer.paper_width}mm paper</span>
                            <span className="mx-2">•</span>
                            <span className="capitalize">{printer.type}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!printer.is_default && (
                          <Button size="sm" variant="outline" onClick={() => handleSetDefault(printer)}>
                            <Star className="w-4 h-4 mr-1" />
                            Set Default
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => handleTest(printer)}>
                          <TestTube className="w-4 h-4 mr-1" />
                          Test
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(printer)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-500" onClick={() => handleDelete(printer.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Test Result */}
          {testResult && (
            <Card className="mt-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-emerald-500" />
                  Test Receipt Generated
                </CardTitle>
                <CardDescription>
                  Send these ESC/POS commands to your printer
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4">
                  <p className="text-sm mb-2"><strong>Printer:</strong> {testResult.printer}</p>
                  <p className="text-sm mb-2"><strong>Type:</strong> {testResult.type}</p>
                  <p className="text-sm mb-2"><strong>Address:</strong> {testResult.address}</p>
                  <div className="mt-4">
                    <p className="text-sm font-semibold mb-2">ESC/POS Commands (Base64):</p>
                    <div className="bg-white dark:bg-slate-900 p-3 rounded font-mono text-xs break-all max-h-40 overflow-auto">
                      {testResult.commands}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    {testResult.instructions}
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => {
                    navigator.clipboard.writeText(testResult.commands);
                    toast.success('Copied to clipboard!');
                  }}
                >
                  Copy Commands
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Help Section */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Printing Guide</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-1">WiFi Printers</h4>
                <p className="text-sm text-muted-foreground">
                  Connect your printer to the same network as your POS device. Use the printer's IP address 
                  and port (usually 9100). Example: 192.168.1.100:9100
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Bluetooth Printers</h4>
                <p className="text-sm text-muted-foreground">
                  Pair your Bluetooth printer with your device first. Enter the Bluetooth MAC address 
                  from your printer's settings. Example: 00:11:22:33:44:55
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Supported Printers</h4>
                <p className="text-sm text-muted-foreground">
                  HevaPOS supports ESC/POS compatible thermal printers including Epson TM series, 
                  Star TSP series, and most generic 58mm/80mm thermal printers.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PrinterSettings;
