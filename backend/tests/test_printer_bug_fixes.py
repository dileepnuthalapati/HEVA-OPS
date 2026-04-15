"""
Test suite for HevaPOS Printer Bug Fixes (Iteration 15)
Tests the fixes for:
1. 66 'Unknown Device' entries in BLE scan - fixed by filtering to named-only devices
2. 'Classic BT plugin not available' error - fixed by switching to static import

Tests verify:
- printer.js uses STATIC import for BluetoothPrinter
- printer.js _tryClassicSPP calls BluetoothPrinter.connectAndPrint directly
- printer.js listPairedDevices calls BluetoothPrinter.list() directly
- printer.js scanBLEDevices only reports devices with result.device.name
- PrinterSettings shows 'Paired Devices (from Android Settings)' section header
- PrinterSettings BLE devices section shows 'Nearby BLE Devices' header
- PrinterSettings WiFi devices render separately from Bluetooth devices
- Backend /api/printers/default works
- Backend /api/printers/{id}/test returns sent/send_error fields
"""

import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://heva-one-preview.preview.emergentagent.com')


class TestBackendPrinterAPIs:
    """Test backend printer API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_default_printer(self):
        """Test /api/printers/default endpoint returns printer or null"""
        response = requests.get(f"{BASE_URL}/api/printers/default", headers=self.headers)
        assert response.status_code == 200, f"Failed to get default printer: {response.text}"
        data = response.json()
        # Can be null or a printer object
        if data is not None:
            assert "id" in data
            assert "name" in data
            assert "type" in data
            assert "address" in data
            print(f"Default printer: {data['name']} ({data['type']})")
        else:
            print("No default printer configured")
    
    def test_get_all_printers(self):
        """Test /api/printers endpoint returns list of printers"""
        response = requests.get(f"{BASE_URL}/api/printers", headers=self.headers)
        assert response.status_code == 200, f"Failed to get printers: {response.text}"
        printers = response.json()
        assert isinstance(printers, list)
        print(f"Found {len(printers)} printers")
        for p in printers:
            print(f"  - {p['name']} ({p['type']}) at {p['address']}")
    
    def test_test_printer_returns_sent_and_send_error_fields(self):
        """Test /api/printers/{id}/test returns sent and send_error fields"""
        # First get a printer
        response = requests.get(f"{BASE_URL}/api/printers", headers=self.headers)
        assert response.status_code == 200
        printers = response.json()
        
        if not printers:
            pytest.skip("No printers configured to test")
        
        printer = printers[0]
        response = requests.post(f"{BASE_URL}/api/printers/{printer['id']}/test", headers=self.headers)
        assert response.status_code == 200, f"Test printer failed: {response.text}"
        
        data = response.json()
        # Verify required fields exist
        assert "sent" in data, "Response missing 'sent' field"
        assert "send_error" in data, "Response missing 'send_error' field"
        assert "commands" in data, "Response missing 'commands' field"
        assert "printer" in data
        assert "type" in data
        assert "address" in data
        
        print(f"Test print result: sent={data['sent']}, send_error={data['send_error']}")
        if data['sent']:
            print("  Print was successfully sent to printer")
        else:
            print(f"  Print not sent: {data['send_error'] or 'Bluetooth printer (requires app)'}")


class TestPrinterJSStaticImport:
    """Test that printer.js uses STATIC import for BluetoothPrinter"""
    
    @pytest.fixture(autouse=True)
    def load_printer_js(self):
        """Load printer.js content"""
        with open('/app/frontend/src/services/printer.js', 'r') as f:
            self.printer_js = f.read()
    
    def test_static_import_for_bluetooth_printer(self):
        """Verify BluetoothPrinter is imported statically (not dynamically)"""
        # Check for static import at top of file
        static_import_pattern = r"^import\s+\{[^}]*BluetoothPrinter[^}]*\}\s+from\s+['\"]@kduma-autoid/capacitor-bluetooth-printer['\"]"
        match = re.search(static_import_pattern, self.printer_js, re.MULTILINE)
        assert match, "BluetoothPrinter should be imported statically at top of file"
        print(f"Found static import: {match.group(0)[:80]}...")
        
        # Verify NO dynamic import for BluetoothPrinter
        dynamic_import_pattern = r"import\s*\(\s*['\"]@kduma-autoid/capacitor-bluetooth-printer['\"]\s*\)"
        dynamic_match = re.search(dynamic_import_pattern, self.printer_js)
        assert not dynamic_match, "BluetoothPrinter should NOT use dynamic import()"
        print("Confirmed: No dynamic import() for BluetoothPrinter")
    
    def test_try_classic_spp_calls_connect_and_print_directly(self):
        """Verify _tryClassicSPP calls BluetoothPrinter.connectAndPrint directly"""
        # Look for direct call to BluetoothPrinter.connectAndPrint
        pattern = r"await\s+BluetoothPrinter\.connectAndPrint\s*\("
        match = re.search(pattern, self.printer_js)
        assert match, "_tryClassicSPP should call BluetoothPrinter.connectAndPrint directly"
        print("Found direct call: BluetoothPrinter.connectAndPrint()")
    
    def test_list_paired_devices_calls_list_directly(self):
        """Verify listPairedDevices calls BluetoothPrinter.list() directly"""
        # Look for direct call to BluetoothPrinter.list()
        pattern = r"await\s+BluetoothPrinter\.list\s*\(\s*\)"
        match = re.search(pattern, self.printer_js)
        assert match, "listPairedDevices should call BluetoothPrinter.list() directly"
        print("Found direct call: BluetoothPrinter.list()")


class TestBLEScanFilter:
    """Test that BLE scan filters out unnamed devices"""
    
    @pytest.fixture(autouse=True)
    def load_printer_js(self):
        """Load printer.js content"""
        with open('/app/frontend/src/services/printer.js', 'r') as f:
            self.printer_js = f.read()
    
    def test_scan_ble_devices_filters_unnamed_devices(self):
        """Verify scanBLEDevices only reports devices with result.device.name"""
        # Look for the filter condition in scanBLEDevices
        # The code should check for result.device.name before adding to results
        pattern = r"result\.device\.name"
        matches = re.findall(pattern, self.printer_js)
        assert len(matches) >= 1, "scanBLEDevices should check for result.device.name"
        print(f"Found {len(matches)} references to result.device.name")
        
        # Verify the filter is in the scan callback
        # Look for pattern like: if (!seen.has(id) && result.device.name)
        # The actual code is: if (!seen.has(id) && result.device.name) {
        filter_pattern = r"if\s*\(\s*!seen\.has\(id\)\s*&&\s*result\.device\.name\s*\)"
        filter_match = re.search(filter_pattern, self.printer_js)
        assert filter_match, "scanBLEDevices should filter: if (!seen.has(id) && result.device.name)"
        print("Found filter condition for named devices only")


class TestPrinterSettingsUI:
    """Test PrinterSettings.js UI elements"""
    
    @pytest.fixture(autouse=True)
    def load_printer_settings(self):
        """Load PrinterSettings.js content"""
        with open('/app/frontend/src/pages/PrinterSettings.js', 'r') as f:
            self.printer_settings = f.read()
    
    def test_paired_devices_section_header(self):
        """Verify 'Paired Devices (from Android Settings)' section header exists"""
        assert "Paired Devices (from Android Settings)" in self.printer_settings, \
            "PrinterSettings should show 'Paired Devices (from Android Settings)' header"
        print("Found section header: 'Paired Devices (from Android Settings)'")
    
    def test_nearby_ble_devices_section_header(self):
        """Verify 'Nearby BLE Devices' section header exists"""
        assert "Nearby BLE Devices" in self.printer_settings, \
            "PrinterSettings should show 'Nearby BLE Devices' header"
        print("Found section header: 'Nearby BLE Devices'")
    
    def test_wifi_and_bluetooth_devices_rendered_separately(self):
        """Verify WiFi and Bluetooth devices are rendered in separate sections"""
        # Check for discoveryType === 'wifi' conditional rendering
        wifi_section = re.search(r"discoveryType\s*===\s*['\"]wifi['\"]", self.printer_settings)
        assert wifi_section, "Should have conditional rendering for WiFi devices"
        
        # Check for discoveryType === 'bluetooth' conditional rendering
        bt_section = re.search(r"discoveryType\s*===\s*['\"]bluetooth['\"]", self.printer_settings)
        assert bt_section, "Should have conditional rendering for Bluetooth devices"
        
        print("Confirmed: WiFi and Bluetooth devices rendered separately")
    
    def test_paired_devices_have_distinct_styling(self):
        """Verify paired devices have distinct styling (emerald color scheme)"""
        # Look for emerald styling for paired devices
        assert "border-emerald" in self.printer_settings or "bg-emerald" in self.printer_settings, \
            "Paired devices should have emerald color styling"
        print("Found emerald styling for paired devices")
    
    def test_ble_devices_have_distinct_styling(self):
        """Verify BLE devices have distinct styling (purple color scheme)"""
        # Look for purple styling for BLE devices
        assert "bg-purple" in self.printer_settings, \
            "BLE devices should have purple color styling"
        print("Found purple styling for BLE devices")


class TestPOSScreenPrinting:
    """Test POSScreen.js printer integration"""
    
    @pytest.fixture(autouse=True)
    def load_pos_screen(self):
        """Load POSScreen.js content"""
        with open('/app/frontend/src/pages/POSScreen.js', 'r') as f:
            self.pos_screen = f.read()
    
    def test_send_to_printer_helper_exists(self):
        """Verify sendToPrinter helper function exists"""
        assert "sendToPrinter" in self.pos_screen, \
            "POSScreen should have sendToPrinter helper"
        print("Found sendToPrinter helper function")
    
    def test_send_to_printer_gets_default_printer(self):
        """Verify sendToPrinter fetches default printer via printerAPI.getDefault()"""
        pattern = r"printerAPI\.getDefault\s*\(\s*\)"
        match = re.search(pattern, self.pos_screen)
        assert match, "sendToPrinter should call printerAPI.getDefault()"
        print("Found call to printerAPI.getDefault()")
    
    def test_send_to_printer_calls_print_to_device(self):
        """Verify sendToPrinter calls printerService.printToDevice()"""
        pattern = r"printerService\.printToDevice\s*\("
        match = re.search(pattern, self.pos_screen)
        assert match, "sendToPrinter should call printerService.printToDevice()"
        print("Found call to printerService.printToDevice()")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
