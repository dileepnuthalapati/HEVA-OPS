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
import { Plus, Printer, Wifi, Bluetooth, Trash2, TestTube, Check, Star, Edit, Search, Loader2, Radio, Monitor } from 'lucide-react';

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
    try {
      toast.loading('Testing printer...');
      const result = await printerAPI.test(printer.id);
      setTestResult(result);
      toast.dismiss();
      toast.success('Test receipt generated!');
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to test printer');
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

  // WiFi Network Discovery (Port 9100 scanning)
  const scanWifiPrinters = async () => {
    setScanning(true);
    setScanError('');
    setDiscoveredDevices([]);
    
    try {
      // Try to get local network info
      const localIPs = [];
      
      // Use WebRTC to detect local IP range
      try {
        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        await new Promise((resolve) => {
          const timeout = setTimeout(resolve, 3000);
          pc.onicecandidate = (e) => {
            if (!e.candidate) { clearTimeout(timeout); resolve(); return; }
            const match = e.candidate.candidate.match(/(\d+\.\d+\.\d+)\.\d+/);
            if (match && !match[1].startsWith('0.')) localIPs.push(match[1]);
          };
        });
        pc.close();
      } catch (e) { /* WebRTC not available */ }

      const subnet = localIPs.length > 0 ? localIPs[0] : '192.168.1';
      const found = [];
      
      // Scan common printer IPs on the detected subnet
      const commonIPs = [];
      for (let i = 1; i <= 254; i++) commonIPs.push(`${subnet}.${i}`);
      
      // Batch scan using fetch with short timeout (port 9100)
      const batchSize = 30;
      for (let batch = 0; batch < Math.min(commonIPs.length, 90); batch += batchSize) {
        const batchIPs = commonIPs.slice(batch, batch + batchSize);
        const results = await Promise.allSettled(
          batchIPs.map(ip => 
            Promise.race([
              fetch(`http://${ip}:9100`, { mode: 'no-cors', signal: AbortSignal.timeout(1500) })
                .then(() => ({ ip, port: 9100, reachable: true })),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
            ])
          )
        );
        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value?.reachable) {
            found.push(result.value);
          }
        });
        // Update UI progressively
        if (found.length > 0) setDiscoveredDevices([...found]);
      }
      
      if (found.length === 0) {
        // Add helpful message with common suggestions
        setDiscoveredDevices([
          { ip: `${subnet}.100`, port: 9100, suggested: true, name: 'Common printer IP' },
          { ip: `${subnet}.200`, port: 9100, suggested: true, name: 'Common printer IP' },
        ]);
        setScanError(`No printers auto-detected on ${subnet}.x:9100. Try the suggested IPs below or enter manually.`);
      }
    } catch (error) {
      setScanError('Network scan not supported in this browser. Please enter the printer IP manually.');
      setDiscoveredDevices([
        { ip: '192.168.1.100', port: 9100, suggested: true, name: 'Default suggestion' },
      ]);
    } finally {
      setScanning(false);
    }
  };

  // Bluetooth Discovery
  const scanBluetoothDevices = async () => {
    setScanning(true);
    setScanError('');
    setDiscoveredDevices([]);

    try {
      // Check for Capacitor BLE plugin (native app)
      if (window.Capacitor?.isNativePlatform?.()) {
        try {
          const { BleClient } = await import('@capacitor-community/bluetooth-le');
          await BleClient.initialize();
          
          const devices = [];
          await BleClient.requestLEScan({}, (result) => {
            if (result.device?.name || result.device?.deviceId) {
              const existing = devices.find(d => d.deviceId === result.device.deviceId);
              if (!existing) {
                devices.push({
                  deviceId: result.device.deviceId,
                  name: result.device.name || 'Unknown Device',
                  rssi: result.rssi,
                });
                setDiscoveredDevices([...devices]);
              }
            }
          });

          // Scan for 8 seconds
          await new Promise(resolve => setTimeout(resolve, 8000));
          await BleClient.stopLEScan();
          
          if (devices.length === 0) {
            setScanError('No Bluetooth devices found. Make sure your printer is powered on and in pairing mode.');
          }
        } catch (bleError) {
          setScanError(`BLE error: ${bleError.message}. Ensure Bluetooth is enabled.`);
        }
      }
      // Web Bluetooth API (Chrome)
      else if (navigator.bluetooth) {
        try {
          const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: ['00001101-0000-1000-8000-00805f9b34fb']
          });
          if (device) {
            setDiscoveredDevices([{
              deviceId: device.id,
              name: device.name || 'Bluetooth Device',
              webBluetooth: true,
            }]);
          }
        } catch (btError) {
          if (btError.name !== 'NotFoundError') {
            setScanError('Bluetooth scan cancelled or not supported.');
          }
        }
      } else {
        setScanError('Bluetooth is not available. For native Bluetooth scanning, use the Android/iOS app. In Chrome, Web Bluetooth may be available.');
      }
    } catch (error) {
      setScanError('Bluetooth discovery failed. Please enter the MAC address manually.');
    } finally {
      setScanning(false);
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
                <CardTitle className="flex items-center gap-2"><Check className="w-5 h-5 text-emerald-500" /> Test Receipt Generated</CardTitle>
                <CardDescription>Send these ESC/POS commands to your printer</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-100 rounded-lg p-4">
                  <p className="text-sm mb-2"><strong>Printer:</strong> {testResult.printer}</p>
                  <p className="text-sm mb-2"><strong>Type:</strong> {testResult.type}</p>
                  <p className="text-sm mb-2"><strong>Address:</strong> {testResult.address}</p>
                  <div className="mt-4">
                    <p className="text-sm font-semibold mb-2">ESC/POS Commands (Base64):</p>
                    <div className="bg-white p-3 rounded font-mono text-xs break-all max-h-40 overflow-auto">{testResult.commands}</div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">{testResult.instructions}</p>
                </div>
                <Button variant="outline" className="mt-4" onClick={() => { navigator.clipboard.writeText(testResult.commands); toast.success('Copied!'); }}>Copy Commands</Button>
              </CardContent>
            </Card>
          )}

          {/* Help Section */}
          <Card className="mt-8">
            <CardHeader><CardTitle>Printing Guide</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-1">WiFi Printers</h4>
                <p className="text-sm text-muted-foreground">Connect your printer to the same network as your POS device. Use the printer's IP address and port (usually 9100). Example: 192.168.1.100:9100</p>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Bluetooth Printers</h4>
                <p className="text-sm text-muted-foreground">Pair your Bluetooth printer with your device first. Enter the Bluetooth MAC address from your printer's settings. Example: 00:11:22:33:44:55</p>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Supported Printers</h4>
                <p className="text-sm text-muted-foreground">HevaPOS supports ESC/POS compatible thermal printers including Epson TM series, Star TSP series, and most generic 58mm/80mm thermal printers.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Device Discovery Dialog */}
      <Dialog open={showDiscovery} onOpenChange={setShowDiscovery}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Search className="w-5 h-5" /> Discover Printers</DialogTitle>
            <DialogDescription>Scan your network for available printers</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Discovery Type Selector */}
            <div className="flex gap-2">
              <Button
                variant={discoveryType === 'wifi' ? 'default' : 'outline'}
                onClick={() => { setDiscoveryType('wifi'); setDiscoveredDevices([]); setScanError(''); }}
                data-testid="discover-wifi-btn"
                className="flex-1"
              >
                <Wifi className="w-4 h-4 mr-2" /> WiFi / Network
              </Button>
              <Button
                variant={discoveryType === 'bluetooth' ? 'default' : 'outline'}
                onClick={() => { setDiscoveryType('bluetooth'); setDiscoveredDevices([]); setScanError(''); }}
                data-testid="discover-bluetooth-btn"
                className="flex-1"
              >
                <Bluetooth className="w-4 h-4 mr-2" /> Bluetooth
              </Button>
            </div>

            <div className="p-3 bg-muted rounded-lg text-sm">
              {discoveryType === 'wifi' ? (
                <p><Radio className="w-4 h-4 inline mr-1" /> Scans your local network for devices on port 9100 (standard ESC/POS printer port). Ensure printers are powered on and connected to the same network.</p>
              ) : (
                <p><Bluetooth className="w-4 h-4 inline mr-1" /> {window.Capacitor?.isNativePlatform?.() ? 'Uses Bluetooth LE to scan for nearby printers. Ensure Bluetooth is enabled.' : 'Uses Web Bluetooth to find nearby printers. Best supported in Chrome on Android.'}</p>
              )}
            </div>

            <Button onClick={startScan} disabled={scanning} data-testid="start-scan-btn" className="w-full">
              {scanning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning...</> : <><Search className="w-4 h-4 mr-2" /> Start Scan</>}
            </Button>

            {scanError && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">{scanError}</div>
            )}

            {/* Discovered Devices */}
            {discoveredDevices.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <p className="text-sm font-medium">{discoveredDevices.some(d => d.suggested) ? 'Suggested Addresses:' : `Found ${discoveredDevices.length} device(s):`}</p>
                {discoveredDevices.map((device, idx) => (
                  <button
                    key={idx}
                    data-testid={`discovered-device-${idx}`}
                    onClick={() => selectDiscoveredDevice(device)}
                    className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${device.ip ? 'bg-blue-100' : 'bg-purple-100'}`}>
                        {device.ip ? <Monitor className="w-4 h-4 text-blue-600" /> : <Bluetooth className="w-4 h-4 text-purple-600" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{device.name || (device.ip ? `Network Device` : 'BT Device')}</div>
                        <div className="text-xs text-muted-foreground font-mono">{device.ip ? `${device.ip}:${device.port}` : device.deviceId}</div>
                      </div>
                    </div>
                    <div className="text-xs text-primary shrink-0 ml-2">
                      {device.suggested ? 'Try this' : 'Select'}
                    </div>
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
