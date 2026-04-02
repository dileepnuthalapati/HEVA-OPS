import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { printerAPI, getAuthToken } from '../services/api';
import printerService from '../services/printer';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { Plus, Printer, Wifi, Bluetooth, Trash2, TestTube, Check, Star, Edit, Search, Loader2, Monitor } from 'lucide-react';

const PrinterSettings = () => {
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddPrinter, setShowAddPrinter] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState(null);
  const [testResult, setTestResult] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '', type: 'wifi', address: '', is_default: false, paper_width: 80
  });

  // Discovery state
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [discoveryType, setDiscoveryType] = useState('wifi');
  const [scanning, setScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [scanError, setScanError] = useState('');
  const [scanProgress, setScanProgress] = useState('');
  const isNativeApp = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

  useEffect(() => { loadPrinters(); }, []);

  const loadPrinters = async () => {
    try { setPrinters(await printerAPI.getAll()); }
    catch (error) { toast.error('Failed to load printers'); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setFormData({ name: '', type: 'wifi', address: '', is_default: false, paper_width: 80 });
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
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed to save printer'); }
  };

  const handleDelete = async (printerId) => {
    if (!window.confirm('Are you sure you want to delete this printer?')) return;
    try {
      await printerAPI.delete(printerId);
      toast.success('Printer deleted');
      loadPrinters();
    } catch (error) { toast.error('Failed to delete printer'); }
  };

  const handleTest = async (printer) => {
    const toastId = toast.loading(`Sending test print to ${printer.name}...`);
    try {
      const result = await printerAPI.test(printer.id);

      // WiFi printers: backend already sent the data via TCP
      if (printer.type === 'wifi') {
        if (result.sent) {
          toast.success(`Test receipt printed on ${printer.name}!`, { id: toastId });
          setTestResult({ ...result, printSuccess: true });
        } else {
          // Backend couldn't reach the printer — show error + commands
          toast.error(`Could not reach printer: ${result.send_error || 'Connection failed'}`, { id: toastId });
          setTestResult({ ...result, printSuccess: false });
        }
        return;
      }

      // Bluetooth printers: send from the device via BLE
      if (printer.type === 'bluetooth') {
        try {
          const apiUrl = process.env.REACT_APP_BACKEND_URL;
          const token = getAuthToken();
          await printerService.printToDevice(printer, result.commands, apiUrl, token);
          toast.success(`Test receipt printed on ${printer.name}!`, { id: toastId });
          setTestResult({ ...result, printSuccess: true });
        } catch (bleError) {
          toast.error(`Bluetooth print failed: ${bleError.message}`, { id: toastId });
          setTestResult({ ...result, printSuccess: false, send_error: bleError.message });
        }
        return;
      }

      // Fallback
      toast.success('Test receipt generated', { id: toastId });
      setTestResult(result);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to test printer', { id: toastId });
    }
  };

  const handleEdit = (printer) => {
    setFormData({ name: printer.name, type: printer.type, address: printer.address, is_default: printer.is_default, paper_width: printer.paper_width });
    setEditingPrinter(printer);
    setShowAddPrinter(true);
  };

  const handleSetDefault = async (printer) => {
    try {
      await printerAPI.update(printer.id, { is_default: true });
      toast.success(`${printer.name} is now the default printer`);
      loadPrinters();
    } catch (error) { toast.error('Failed to set default printer'); }
  };

  // WiFi Network Discovery — uses backend TCP port scanner for real detection
  const scanWifiPrinters = async () => {
    setScanning(true);
    setScanError('');
    setDiscoveredDevices([]);
    
    const portsToScan = [9100, 515, 631];
    
    // Auto-detect subnet from the backend server's actual network
    let subnet = '192.168.1';
    setScanProgress('Detecting your network...');
    try {
      const subnetData = await printerAPI.detectSubnet();
      subnet = subnetData.primary || '192.168.1';
    } catch (e) { /* fallback */ }

    setScanProgress(`Scanning your network for printers...`);
    
    try {
      const result = await printerAPI.discover(subnet, portsToScan, null);
      if (result.devices && result.devices.length > 0) {
        setDiscoveredDevices(result.devices);
        setScanProgress('');
      } else {
        setScanProgress('');
        setScanError('No printers found on your network. Make sure your printer is powered on and connected to the same WiFi.');
      }
    } catch (error) {
      setScanProgress('');
      setScanError(error.response?.data?.detail || 'Scan failed. Make sure the printer is powered on and connected to WiFi. You can also add it manually using the IP shown on the printer\'s network status printout.');
    } finally {
      setScanning(false);
      setScanProgress('');
    }
  };

  // Bluetooth Discovery — shows PAIRED devices first, then named BLE devices only
  const scanBluetoothDevices = async () => {
    if (!isNativeApp) {
      setScanning(false);
      setScanError('');
      setDiscoveredDevices([]);
      return;
    }

    setScanning(true);
    setScanError('');
    setDiscoveredDevices([]);

    const pairedDevices = [];
    const bleDevices = [];
    const PRINTER_PATTERNS = ['TM-', 'EPSON', 'STAR', 'TSP', 'BIXOLON', 'THERMAL', 'PRINTER', 'POS', 'RPP', 'SPP', 'M30', 'M10', 'XP-', 'ZJ-', 'SK'];

    // Step 1: Get PAIRED devices from Android Bluetooth Settings
    // These are the devices the user has already paired — most reliable source
    setScanProgress('Loading paired Bluetooth devices...');
    try {
      const paired = await printerService.listPairedDevices();
      for (const dev of paired) {
        const name = dev.name || '';
        const isPrinter = PRINTER_PATTERNS.some(p => name.toUpperCase().includes(p)) || name.length > 0;
        pairedDevices.push({
          deviceId: dev.address,
          name: name || dev.address,
          type: 'classic',
          isPrinter,
          paired: true,
          source: 'paired',
        });
      }
      // Sort: likely printers first
      pairedDevices.sort((a, b) => (b.isPrinter ? 1 : 0) - (a.isPrinter ? 1 : 0));
      setDiscoveredDevices([...pairedDevices]);
    } catch (err) {
      console.warn('[PrinterSettings] Paired list failed:', err.message);
    }

    // Step 2: Quick BLE scan — ONLY shows devices that broadcast a name
    // Filters out all "Unknown Device" entries
    setScanProgress('Scanning for nearby BLE printers (10s)...');
    try {
      const pairedIds = new Set(pairedDevices.map(d => d.deviceId));
      await printerService.scanBLEDevices((dev) => {
        // Skip if already in paired list or no name
        if (pairedIds.has(dev.deviceId) || !dev.name) return;
        const isPrinter = PRINTER_PATTERNS.some(p => dev.name.toUpperCase().includes(p));
        bleDevices.push({
          deviceId: dev.deviceId,
          name: dev.name,
          type: 'le',
          isPrinter,
          paired: false,
          source: 'ble-scan',
          rssi: dev.rssi,
        });
        // Update combined list: paired first, then BLE printers, then BLE others
        const combined = [...pairedDevices, ...bleDevices.filter(d => d.isPrinter), ...bleDevices.filter(d => !d.isPrinter)];
        setDiscoveredDevices([...combined]);
      }, 10000);
    } catch (bleErr) {
      console.warn('[PrinterSettings] BLE scan error:', bleErr.message);
    }

    setScanProgress('');
    setScanning(false);

    const totalFound = pairedDevices.length + bleDevices.length;
    if (totalFound === 0) {
      setScanError(
        'No Bluetooth devices found.\n\n' +
        'To connect your printer:\n' +
        '1. Open Android Settings > Bluetooth\n' +
        '2. Pair your printer there first\n' +
        '3. Come back here and tap "Find Printers"\n\n' +
        'Or add it manually using the MAC address from your printer\'s settings page.'
      );
    }
  };

  const startScan = () => {
    if (discoveryType === 'wifi') scanWifiPrinters();
    else scanBluetoothDevices();
  };

  const selectDiscoveredDevice = (device) => {
    const address = device.ip ? `${device.ip}:${device.port}` : device.deviceId || '';
    const type = device.ip ? 'wifi' : 'bluetooth';
    setFormData({
      name: device.name || `${type === 'wifi' ? 'Network' : 'BT'} Printer`,
      type,
      address,
      is_default: printers.length === 0,
      paper_width: 80
    });
    setShowDiscovery(false);
    setShowAddPrinter(true);
    toast.success(`Selected: ${address}`);
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
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
            <div>
              <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-1 md:mb-2" data-testid="printer-settings-heading">Printer Settings</h1>
              <p className="text-muted-foreground">Configure ESC/POS thermal printers for receipts</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" data-testid="discover-printers-btn" onClick={() => setShowDiscovery(true)}>
                <Search className="w-4 h-4 mr-2" /> Discover Printers
              </Button>
              <Dialog open={showAddPrinter} onOpenChange={(open) => { setShowAddPrinter(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button data-testid="add-printer-button"><Plus className="w-4 h-4 mr-2" /> Add Printer</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingPrinter ? 'Edit Printer' : 'Add New Printer'}</DialogTitle>
                    <DialogDescription>Configure a thermal receipt printer (ESC/POS compatible)</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="name">Printer Name *</Label>
                      <Input id="name" data-testid="printer-name-input" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g., Kitchen Printer" required />
                    </div>
                    <div>
                      <Label>Connection Type</Label>
                      <Select value={formData.type} onValueChange={(v) => setFormData({...formData, type: v, address: ''})}>
                        <SelectTrigger data-testid="printer-type-select"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="wifi"><div className="flex items-center gap-2"><Wifi className="w-4 h-4" /> WiFi / Network</div></SelectItem>
                          <SelectItem value="bluetooth"><div className="flex items-center gap-2"><Bluetooth className="w-4 h-4" /> Bluetooth</div></SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="address">{formData.type === 'wifi' ? 'IP Address:Port *' : 'Bluetooth MAC Address *'}</Label>
                      <Input id="address" data-testid="printer-address-input" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} placeholder={formData.type === 'wifi' ? '192.168.1.100:9100' : '00:11:22:33:44:55'} required />
                      <p className="text-xs text-muted-foreground mt-1">
                        {formData.type === 'wifi' ? 'Usually port 9100 for ESC/POS printers' : "Find this in your printer's Bluetooth settings"}
                      </p>
                    </div>
                    <div>
                      <Label>Paper Width</Label>
                      <Select value={formData.paper_width.toString()} onValueChange={(v) => setFormData({...formData, paper_width: parseInt(v)})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="80">80mm (Standard)</SelectItem>
                          <SelectItem value="58">58mm (Compact)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="is_default">Set as default printer</Label>
                      <Switch id="is_default" checked={formData.is_default} onCheckedChange={(v) => setFormData({...formData, is_default: v})} />
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Button type="submit" data-testid="save-printer-btn" className="flex-1">{editingPrinter ? 'Update Printer' : 'Add Printer'}</Button>
                      <Button type="button" variant="outline" onClick={() => { setShowAddPrinter(false); resetForm(); }}>Cancel</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Printers List */}
          {printers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Printer className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">No printers configured</h3>
                <p className="text-muted-foreground mb-4">Add a thermal receipt printer to start printing kitchen and customer receipts.</p>
                <div className="flex justify-center gap-3">
                  <Button variant="outline" onClick={() => setShowDiscovery(true)}><Search className="w-4 h-4 mr-2" /> Discover Printers</Button>
                  <Button onClick={() => setShowAddPrinter(true)}><Plus className="w-4 h-4 mr-2" /> Add Manually</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {printers.map((printer) => (
                <Card key={printer.id} data-testid={`printer-${printer.id}`}>
                  <CardContent className="p-4 md:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center shrink-0 ${printer.type === 'wifi' ? 'bg-blue-100' : 'bg-purple-100'}`}>
                          {printer.type === 'wifi' ? <Wifi className="w-6 h-6 text-blue-600" /> : <Bluetooth className="w-6 h-6 text-purple-600" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-lg font-bold truncate">{printer.name}</h3>
                            {printer.is_default && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                                <Star className="w-3 h-3" /> Default
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-2">
                            <span className="font-mono">{printer.address}</span>
                            <span>{printer.paper_width}mm paper</span>
                            <span className="capitalize">{printer.type}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {!printer.is_default && (
                          <Button size="sm" variant="outline" onClick={() => handleSetDefault(printer)} className="h-8"><Star className="w-3.5 h-3.5 mr-1" /> Default</Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => handleTest(printer)} data-testid={`test-printer-${printer.id}`} className="h-8"><TestTube className="w-3.5 h-3.5 mr-1" /> Test</Button>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(printer)} className="h-8"><Edit className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="outline" className="text-red-500 h-8" onClick={() => handleDelete(printer.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
                  {testResult.printSuccess ? (
                    <><Check className="w-5 h-5 text-emerald-500" /> Test Print Successful</>
                  ) : (
                    <><Printer className="w-5 h-5 text-amber-500" /> Test Print Result</>
                  )}
                </CardTitle>
                <CardDescription>
                  {testResult.printSuccess
                    ? `Successfully sent to ${testResult.printer}`
                    : testResult.send_error
                      ? `Could not send to printer: ${testResult.send_error}`
                      : 'ESC/POS commands generated — see below'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-100 rounded-lg p-4">
                  <p className="text-sm mb-2"><strong>Printer:</strong> {testResult.printer}</p>
                  <p className="text-sm mb-2"><strong>Type:</strong> {testResult.type?.toUpperCase()}</p>
                  <p className="text-sm mb-2"><strong>Address:</strong> {testResult.address}</p>
                  <p className="text-sm mb-2">
                    <strong>Status:</strong>{' '}
                    {testResult.printSuccess
                      ? <span className="text-emerald-600 font-semibold">Sent to printer</span>
                      : <span className="text-amber-600 font-semibold">Not sent — check connection</span>
                    }
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Help Section */}
          <Card className="mt-8">
            <CardHeader><CardTitle>How to Connect a Printer</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div>
                <h4 className="font-semibold mb-2">WiFi Printer</h4>
                <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1.5">
                  <li>Connect your printer to the same WiFi as your device</li>
                  <li>Click <strong>Discover Printers</strong> above</li>
                  <li>Tap <strong>Start Scan</strong> — your printer will appear in the list</li>
                  <li>Select it and you're done</li>
                </ol>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Bluetooth Printer</h4>
                <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1.5">
                  <li>Go to your tablet's <strong>Bluetooth Settings</strong> and pair with the printer</li>
                  <li>Open HevaPOS on your tablet (Android app)</li>
                  <li>Go to <strong>Printers &rarr; Discover &rarr; Bluetooth &rarr; Find Printers</strong></li>
                  <li>Your paired printer will appear — tap to add it</li>
                  <li>Hit <strong>Test</strong> to verify it prints correctly</li>
                </ol>
                <p className="text-xs text-muted-foreground mt-2">Supports both Bluetooth Classic (SPP) and BLE printers. Works with Epson, Star, Bixolon, and most ESC/POS thermal printers.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Device Discovery Dialog */}
      <Dialog open={showDiscovery} onOpenChange={setShowDiscovery}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Search className="w-5 h-5" /> Discover Printers</DialogTitle>
            <DialogDescription>Find printers on your network or via Bluetooth</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Discovery Type Selector */}
            <div className="flex gap-2">
              <Button
                variant={discoveryType === 'wifi' ? 'default' : 'outline'}
                onClick={() => { setDiscoveryType('wifi'); setDiscoveredDevices([]); setScanError(''); setScanProgress(''); }}
                data-testid="discover-wifi-btn"
                className="flex-1"
              >
                <Wifi className="w-4 h-4 mr-2" /> WiFi / Network
              </Button>
              <Button
                variant={discoveryType === 'bluetooth' ? 'default' : 'outline'}
                onClick={() => { setDiscoveryType('bluetooth'); setDiscoveredDevices([]); setScanError(''); setScanProgress(''); }}
                data-testid="discover-bluetooth-btn"
                className="flex-1"
              >
                <Bluetooth className="w-4 h-4 mr-2" /> Bluetooth
              </Button>
            </div>

            {/* WiFi Discovery Panel */}
            {discoveryType === 'wifi' && (
              <>
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <p>Make sure your printer is <strong>powered on</strong> and connected to the <strong>same WiFi network</strong> as this device, then tap Scan.</p>
                </div>
                <Button onClick={startScan} disabled={scanning} data-testid="start-scan-btn" className="w-full">
                  {scanning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning your network...</> : <><Search className="w-4 h-4 mr-2" /> Scan for Printers</>}
                </Button>
                {scanProgress && (
                  <div className="text-xs text-muted-foreground text-center animate-pulse">{scanProgress}</div>
                )}
              </>
            )}

            {/* Bluetooth Discovery Panel */}
            {discoveryType === 'bluetooth' && (
              <>
                {isNativeApp ? (
                  <>
                    {/* Native APK — shows paired devices + BLE scan */}
                    <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                      <p className="font-medium">Bluetooth Printer Search</p>
                      <p className="text-muted-foreground text-xs">Shows your <strong>paired Bluetooth devices</strong> first, then scans for nearby BLE printers. For best results, pair your printer in Android Bluetooth Settings before scanning here.</p>
                    </div>
                    <Button onClick={startScan} disabled={scanning} data-testid="start-scan-btn" className="w-full">
                      {scanning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning...</> : <><Bluetooth className="w-4 h-4 mr-2" /> Find Printers</>}
                    </Button>
                    {scanProgress && (
                      <div className="text-xs text-muted-foreground text-center animate-pulse">{scanProgress}</div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Browser — simple explanation */}
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="font-semibold text-amber-900 text-sm">Bluetooth requires the HevaPOS app</p>
                      <p className="text-amber-800 text-xs mt-1">To scan for Bluetooth printers, open HevaPOS on your Android tablet or phone.</p>
                    </div>
                    <div className="p-4 border rounded-lg space-y-2">
                      <p className="font-semibold text-sm">Steps:</p>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0">1</span>
                          <span>Turn on your printer and set it to pairing mode</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0">2</span>
                          <span>Open HevaPOS app on your tablet</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0">3</span>
                          <span>Printers &rarr; Discover &rarr; Bluetooth &rarr; Scan</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0">4</span>
                          <span>Tap your printer to add it</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {scanError && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 whitespace-pre-line">{scanError}</div>
            )}

            {/* Discovered Devices — WiFi */}
            {discoveryType === 'wifi' && discoveredDevices.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <p className="text-sm font-medium">Found {discoveredDevices.length} printer(s):</p>
                {discoveredDevices.map((device, idx) => (
                  <button
                    key={`wifi-${idx}`}
                    data-testid={`discovered-device-${idx}`}
                    onClick={() => selectDiscoveredDevice(device)}
                    className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-blue-100">
                        <Monitor className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-sm truncate block">{device.name || 'Network Printer'}</span>
                        <div className="text-xs text-muted-foreground font-mono">{device.ip}:{device.port}</div>
                      </div>
                    </div>
                    <div className="text-xs text-primary shrink-0 ml-2">Select</div>
                  </button>
                ))}
              </div>
            )}

            {/* Discovered Devices — Bluetooth */}
            {discoveryType === 'bluetooth' && discoveredDevices.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {/* Section headers */}
                {discoveredDevices.some(d => d.paired) && (
                  <p className="text-sm font-semibold text-emerald-700">Paired Devices (from Android Settings)</p>
                )}
                {discoveredDevices.filter(d => d.paired).map((device, idx) => (
                  <button
                    key={`paired-${idx}`}
                    data-testid={`discovered-device-paired-${idx}`}
                    onClick={() => selectDiscoveredDevice(device)}
                    className="w-full flex items-center justify-between p-3 border-2 border-emerald-200 bg-emerald-50/50 rounded-lg hover:bg-emerald-100/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-emerald-100">
                        <Bluetooth className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{device.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold shrink-0">Paired</span>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">{device.deviceId}</div>
                      </div>
                    </div>
                    <div className="text-xs font-medium text-emerald-700 shrink-0 ml-2">Add Printer</div>
                  </button>
                ))}

                {/* BLE devices section (only named ones) */}
                {discoveredDevices.some(d => !d.paired) && (
                  <p className="text-sm font-semibold text-muted-foreground mt-3">Nearby BLE Devices</p>
                )}
                {discoveredDevices.filter(d => !d.paired).map((device, idx) => (
                  <button
                    key={`ble-${idx}`}
                    data-testid={`discovered-device-ble-${idx}`}
                    onClick={() => selectDiscoveredDevice(device)}
                    className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-purple-100">
                        <Bluetooth className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-sm truncate block">{device.name}</span>
                        <div className="text-xs text-muted-foreground font-mono">{device.deviceId}</div>
                      </div>
                    </div>
                    <div className="text-xs text-primary shrink-0 ml-2">Select</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PrinterSettings;
