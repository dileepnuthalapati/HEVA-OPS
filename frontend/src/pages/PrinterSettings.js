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
  const [customPort, setCustomPort] = useState('');
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

  // WiFi Network Discovery — scans multiple common printer ports
  const scanWifiPrinters = async () => {
    setScanning(true);
    setScanError('');
    setDiscoveredDevices([]);
    
    // Ports to scan: 9100 (ESC/POS raw), 515 (LPR), 631 (IPP/CUPS), 80 (web config)
    const portsToScan = [9100, 515, 631, 80];
    if (customPort && !isNaN(customPort) && !portsToScan.includes(Number(customPort))) {
      portsToScan.unshift(Number(customPort));
    }
    
    try {
      // Detect local subnet via WebRTC
      const localIPs = [];
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
      } catch (e) { /* WebRTC unavailable */ }

      const subnet = localIPs.length > 0 ? localIPs[0] : '192.168.1';
      const found = [];
      
      // Scan each port across the subnet
      for (const port of portsToScan) {
        setScanProgress(`Scanning ${subnet}.x on port ${port}...`);
        const ips = [];
        for (let i = 1; i <= 254; i++) ips.push(`${subnet}.${i}`);
        
        const batchSize = 40;
        for (let batch = 0; batch < Math.min(ips.length, 120); batch += batchSize) {
          const batchIPs = ips.slice(batch, batch + batchSize);
          const results = await Promise.allSettled(
            batchIPs.map(ip =>
              Promise.race([
                fetch(`http://${ip}:${port}`, { mode: 'no-cors', signal: AbortSignal.timeout(1200) })
                  .then(() => ({ ip, port, reachable: true })),
                new Promise((_, reject) => setTimeout(() => reject(), 1200))
              ])
            )
          );
          results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value?.reachable) {
              const dup = found.find(d => d.ip === result.value.ip && d.port === result.value.port);
              if (!dup) {
                const portLabel = { 9100: 'ESC/POS Raw', 515: 'LPR', 631: 'IPP/CUPS', 80: 'Web Config' };
                found.push({ ...result.value, name: portLabel[port] || `Port ${port}` });
              }
            }
          });
          if (found.length > 0) setDiscoveredDevices([...found]);
        }
      }
      
      setScanProgress('');
      if (found.length === 0) {
        setDiscoveredDevices([
          { ip: `${subnet}.100`, port: 9100, suggested: true, name: 'ESC/POS Raw (common)' },
          { ip: `${subnet}.200`, port: 9100, suggested: true, name: 'ESC/POS Raw (common)' },
          { ip: `${subnet}.1`, port: 631, suggested: true, name: 'IPP/CUPS (router/server)' },
        ]);
        setScanError(`No printers found on ${subnet}.x across ports ${portsToScan.join(', ')}. Try the suggestions below or enter the IP manually.`);
      }
    } catch (error) {
      setScanProgress('');
      setScanError('Network scan failed. Enter the printer IP:Port manually.');
      setDiscoveredDevices([
        { ip: '192.168.1.100', port: 9100, suggested: true, name: 'Default ESC/POS' },
      ]);
    } finally {
      setScanning(false);
      setScanProgress('');
    }
  };

  // Bluetooth Discovery — works properly ONLY in Capacitor native APK
  const scanBluetoothDevices = async () => {
    // In browser: Bluetooth scanning is not possible. Show clear guidance.
    if (!isNativeApp) {
      setScanning(false);
      setScanError('');
      setDiscoveredDevices([]);
      return; // The UI below will show the explanation card
    }

    // Native APK: Real BLE scan
    setScanning(true);
    setScanError('');
    setDiscoveredDevices([]);

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

      // Scan for 10 seconds
      setScanProgress('Scanning for Bluetooth devices...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      await BleClient.stopLEScan();
      setScanProgress('');
      
      if (devices.length === 0) {
        setScanError('No Bluetooth devices found. Make sure your printer is:\n1. Powered on\n2. In pairing/discoverable mode\n3. Within range (< 10 meters)');
      }
    } catch (bleError) {
      setScanProgress('');
      setScanError(`Bluetooth error: ${bleError.message}. Make sure Bluetooth is turned on in your device settings.`);
    } finally {
      setScanning(false);
      setScanProgress('');
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
            <CardContent className="space-y-5">
              <div>
                <h4 className="font-semibold mb-1">WiFi / Network Printers</h4>
                <p className="text-sm text-muted-foreground">Connect your printer to the same WiFi network as your POS device. Use "Discover Printers" to auto-find it, or enter the IP address and port manually. Common ports: 9100 (ESC/POS), 515 (LPR), 631 (IPP). Example: 192.168.1.100:9100</p>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Bluetooth Printers</h4>
                <p className="text-sm text-muted-foreground mb-2">Bluetooth printing works <strong>only in the Android/iOS app</strong> (built with Capacitor), not in a web browser.</p>
                <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                  <p className="font-medium">To set up Bluetooth:</p>
                  <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-0.5">
                    <li>Install HevaPOS APK on your tablet/phone</li>
                    <li>Power on your BT printer and set it to discoverable mode</li>
                    <li>In the app: Printers &rarr; Discover &rarr; Bluetooth &rarr; Start Scan</li>
                    <li>Tap your printer in the results to add it</li>
                  </ol>
                  <p className="text-xs text-muted-foreground mt-2">If you know the MAC address, you can also add manually: Add Printer &rarr; Bluetooth &rarr; enter MAC (e.g., 00:11:22:33:44:55)</p>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Supported Printers</h4>
                <p className="text-sm text-muted-foreground">HevaPOS supports ESC/POS compatible thermal printers: Epson TM series, Star TSP series, and most generic 58mm/80mm thermal printers.</p>
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
                <div className="p-3 bg-muted rounded-lg text-sm space-y-2">
                  <p className="font-medium">How WiFi discovery works:</p>
                  <p>Scans your local network for devices on these ports:</p>
                  <ul className="list-disc list-inside text-xs space-y-0.5 text-muted-foreground">
                    <li><strong>Port 9100</strong> — ESC/POS Raw (most thermal printers)</li>
                    <li><strong>Port 515</strong> — LPR/LPD protocol</li>
                    <li><strong>Port 631</strong> — IPP / CUPS</li>
                    <li><strong>Port 80</strong> — Printer web config page</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-1">Make sure your printer is powered on and connected to the same WiFi network as this device.</p>
                </div>
                <div>
                  <Label className="text-sm">Custom Port (optional)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      data-testid="custom-port-input"
                      type="number"
                      placeholder="e.g. 8080"
                      value={customPort}
                      onChange={(e) => setCustomPort(e.target.value)}
                      className="w-32"
                    />
                    <span className="text-xs text-muted-foreground self-center">Added to scan if not in default list</span>
                  </div>
                </div>
                <Button onClick={startScan} disabled={scanning} data-testid="start-scan-btn" className="w-full">
                  {scanning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning...</> : <><Search className="w-4 h-4 mr-2" /> Start WiFi Scan</>}
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
                    {/* Native APK — real BLE scan */}
                    <div className="p-3 bg-muted rounded-lg text-sm">
                      <p className="font-medium mb-1">Bluetooth LE Scanner</p>
                      <p className="text-muted-foreground text-xs">Scans for nearby Bluetooth printers. Make sure your printer is powered on and in discoverable/pairing mode. Scan takes about 10 seconds.</p>
                    </div>
                    <Button onClick={startScan} disabled={scanning} data-testid="start-scan-btn" className="w-full">
                      {scanning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning (10s)...</> : <><Bluetooth className="w-4 h-4 mr-2" /> Start Bluetooth Scan</>}
                    </Button>
                    {scanProgress && (
                      <div className="text-xs text-muted-foreground text-center animate-pulse">{scanProgress}</div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Browser — explain clearly that BT doesn't work here */}
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                      <div className="flex items-start gap-2">
                        <Bluetooth className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-amber-900 text-sm">Bluetooth scanning requires the Android/iOS app</p>
                          <p className="text-amber-800 text-xs mt-1">Web browsers cannot scan for Bluetooth printers. Bluetooth Low Energy (BLE) scanning is only available when HevaPOS is installed as a native app on your tablet or phone.</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg space-y-3">
                      <p className="font-semibold text-sm">How to use Bluetooth printers:</p>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0">1</span>
                          <span>Build the HevaPOS APK using Capacitor and install it on your Android tablet/phone</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0">2</span>
                          <span>Turn on your Bluetooth printer and put it in pairing/discoverable mode</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0">3</span>
                          <span>Open HevaPOS app &rarr; Printers &rarr; Discover &rarr; Bluetooth &rarr; Start Scan</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0">4</span>
                          <span>Select your printer from the list and it will be added automatically</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                      <p className="font-medium text-blue-900 text-xs">Already know the MAC address?</p>
                      <p className="text-blue-700 text-xs mt-1">You can skip discovery and add your printer manually using "Add Printer" &rarr; Bluetooth &rarr; enter the MAC address (e.g., 00:11:22:33:44:55). Find it on a label on the printer or in its settings menu.</p>
                    </div>
                  </>
                )}
              </>
            )}

            {scanError && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 whitespace-pre-line">{scanError}</div>
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
                        <div className="font-medium text-sm truncate">{device.name || (device.ip ? 'Network Device' : 'BT Device')}</div>
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
