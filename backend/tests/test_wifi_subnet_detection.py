"""
Test WiFi Subnet Auto-Detection Feature (Iteration 18)

Tests the @capgo/capacitor-wifi integration for auto-detecting the tablet's
WiFi subnet instead of hardcoding 192.168.1.x.

Features tested:
1. CapacitorWifi import from @capgo/capacitor-wifi
2. getDeviceSubnet() method calls CapacitorWifi.getIpAddress()
3. scanWifiPrinters() calls getDeviceSubnet() first
4. scanWifiPrinters() reports progress via onProgress callback
5. scanWifiPrinters() throws clear error if no WiFi detected
6. PrinterSettings WiFi scan uses updated printerService.scanWifiPrinters(onPrinterFound, onProgress)
7. PrinterSettings shows scan progress messages during WiFi scan
8. package.json has @capgo/capacitor-wifi dependency
9. All previous features still work
"""

import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# ============================================================
# Code Structure Tests - Verify printer.js implementation
# ============================================================

class TestCapacitorWifiIntegration:
    """Tests for @capgo/capacitor-wifi integration in printer.js"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Read printer.js content for code analysis"""
        printer_js_path = '/app/frontend/src/services/printer.js'
        with open(printer_js_path, 'r') as f:
            self.printer_js = f.read()
    
    def test_capacitor_wifi_import(self):
        """Verify CapacitorWifi is imported from @capgo/capacitor-wifi"""
        # Check for the import statement
        assert "import { CapacitorWifi } from '@capgo/capacitor-wifi'" in self.printer_js, \
            "CapacitorWifi should be imported from @capgo/capacitor-wifi"
        print("PASSED: CapacitorWifi imported from @capgo/capacitor-wifi")
    
    def test_get_device_subnet_method_exists(self):
        """Verify getDeviceSubnet() method exists"""
        assert "async getDeviceSubnet()" in self.printer_js, \
            "getDeviceSubnet() method should exist"
        print("PASSED: getDeviceSubnet() method exists")
    
    def test_get_device_subnet_calls_capacitor_wifi(self):
        """Verify getDeviceSubnet() calls CapacitorWifi.getIpAddress()"""
        # Find the getDeviceSubnet method
        method_match = re.search(r'async getDeviceSubnet\(\)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}', self.printer_js, re.DOTALL)
        assert method_match, "getDeviceSubnet() method should exist"
        method_body = method_match.group(1)
        
        assert "CapacitorWifi.getIpAddress()" in method_body, \
            "getDeviceSubnet() should call CapacitorWifi.getIpAddress()"
        print("PASSED: getDeviceSubnet() calls CapacitorWifi.getIpAddress()")
    
    def test_get_device_subnet_extracts_subnet(self):
        """Verify getDeviceSubnet() extracts subnet from IP address"""
        # Check for subnet extraction logic (splitting IP and taking first 3 parts)
        assert "ip.split('.')" in self.printer_js or "parts[0]" in self.printer_js, \
            "getDeviceSubnet() should split IP to extract subnet"
        
        # Check for subnet construction
        assert "${parts[0]}.${parts[1]}.${parts[2]}" in self.printer_js, \
            "getDeviceSubnet() should construct subnet from first 3 octets"
        print("PASSED: getDeviceSubnet() extracts subnet from IP")
    
    def test_get_device_subnet_returns_null_on_web(self):
        """Verify getDeviceSubnet() returns null when not on native platform"""
        method_match = re.search(r'async getDeviceSubnet\(\)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}', self.printer_js, re.DOTALL)
        assert method_match, "getDeviceSubnet() method should exist"
        method_body = method_match.group(1)
        
        assert "if (!this.isNative) return null" in method_body, \
            "getDeviceSubnet() should return null when not on native platform"
        print("PASSED: getDeviceSubnet() returns null on web")


class TestScanWifiPrintersMethod:
    """Tests for scanWifiPrinters() method updates"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Read printer.js content for code analysis"""
        printer_js_path = '/app/frontend/src/services/printer.js'
        with open(printer_js_path, 'r') as f:
            self.printer_js = f.read()
    
    def test_scan_wifi_printers_signature(self):
        """Verify scanWifiPrinters() accepts onPrinterFound and onProgress callbacks"""
        assert "async scanWifiPrinters(onPrinterFound, onProgress)" in self.printer_js, \
            "scanWifiPrinters() should accept onPrinterFound and onProgress callbacks"
        print("PASSED: scanWifiPrinters() has correct signature with onProgress callback")
    
    def test_scan_wifi_printers_calls_get_device_subnet(self):
        """Verify scanWifiPrinters() calls getDeviceSubnet() first"""
        # Find the scanWifiPrinters method
        method_start = self.printer_js.find("async scanWifiPrinters(onPrinterFound, onProgress)")
        assert method_start != -1, "scanWifiPrinters() method should exist"
        
        # Get method body (approximate - look for next method or end)
        method_body = self.printer_js[method_start:method_start + 2000]
        
        assert "await this.getDeviceSubnet()" in method_body or "this.getDeviceSubnet()" in method_body, \
            "scanWifiPrinters() should call getDeviceSubnet()"
        print("PASSED: scanWifiPrinters() calls getDeviceSubnet()")
    
    def test_scan_wifi_printers_reports_progress(self):
        """Verify scanWifiPrinters() reports progress via onProgress callback"""
        method_start = self.printer_js.find("async scanWifiPrinters(onPrinterFound, onProgress)")
        assert method_start != -1, "scanWifiPrinters() method should exist"
        
        method_body = self.printer_js[method_start:method_start + 2000]
        
        # Check for onProgress calls
        assert "onProgress" in method_body, \
            "scanWifiPrinters() should use onProgress callback"
        
        # Check for progress messages
        assert "if (onProgress)" in method_body, \
            "scanWifiPrinters() should check if onProgress exists before calling"
        print("PASSED: scanWifiPrinters() reports progress via onProgress callback")
    
    def test_scan_wifi_printers_throws_on_no_wifi(self):
        """Verify scanWifiPrinters() throws clear error if no WiFi detected"""
        method_start = self.printer_js.find("async scanWifiPrinters(onPrinterFound, onProgress)")
        assert method_start != -1, "scanWifiPrinters() method should exist"
        
        method_body = self.printer_js[method_start:method_start + 2000]
        
        # Check for error when subnet is null
        assert "if (!subnet)" in method_body, \
            "scanWifiPrinters() should check if subnet is null"
        
        assert "Could not detect your WiFi network" in method_body or "WiFi" in method_body, \
            "scanWifiPrinters() should throw clear error about WiFi detection"
        print("PASSED: scanWifiPrinters() throws clear error if no WiFi detected")
    
    def test_scan_wifi_printers_uses_detected_subnet(self):
        """Verify scanWifiPrinters() uses the detected subnet for scanning"""
        method_start = self.printer_js.find("async scanWifiPrinters(onPrinterFound, onProgress)")
        assert method_start != -1, "scanWifiPrinters() method should exist"
        
        method_body = self.printer_js[method_start:method_start + 2000]
        
        # Check that it uses the subnet variable for IP construction
        assert "${subnet}." in method_body, \
            "scanWifiPrinters() should use detected subnet for IP construction"
        print("PASSED: scanWifiPrinters() uses detected subnet for scanning")


class TestPrinterSettingsIntegration:
    """Tests for PrinterSettings.js integration with updated scanWifiPrinters"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Read PrinterSettings.js content for code analysis"""
        settings_js_path = '/app/frontend/src/pages/PrinterSettings.js'
        with open(settings_js_path, 'r') as f:
            self.settings_js = f.read()
    
    def test_printer_settings_uses_on_progress_callback(self):
        """Verify PrinterSettings passes onProgress callback to scanWifiPrinters"""
        # Check for scanWifiPrinters call with both callbacks
        assert "printerService.scanWifiPrinters(" in self.settings_js, \
            "PrinterSettings should call printerService.scanWifiPrinters()"
        
        # Check for onProgress callback being passed
        assert "setScanProgress" in self.settings_js, \
            "PrinterSettings should have setScanProgress state setter"
        print("PASSED: PrinterSettings uses onProgress callback")
    
    def test_printer_settings_shows_scan_progress(self):
        """Verify PrinterSettings shows scan progress messages during WiFi scan"""
        # Check for scanProgress state
        assert "scanProgress" in self.settings_js, \
            "PrinterSettings should have scanProgress state"
        
        # Check for progress display in UI
        assert "{scanProgress}" in self.settings_js, \
            "PrinterSettings should display scanProgress in UI"
        print("PASSED: PrinterSettings shows scan progress messages")
    
    def test_printer_settings_native_wifi_scan_path(self):
        """Verify PrinterSettings uses native path for WiFi scanning"""
        # Check for isNativeApp check
        assert "isNativeApp" in self.settings_js, \
            "PrinterSettings should check isNativeApp"
        
        # Check for native path using printerService.scanWifiPrinters
        assert "if (isNativeApp)" in self.settings_js, \
            "PrinterSettings should have native app check"
        print("PASSED: PrinterSettings uses native path for WiFi scanning")


class TestPackageJsonDependency:
    """Tests for package.json @capgo/capacitor-wifi dependency"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Read package.json content"""
        import json
        package_json_path = '/app/frontend/package.json'
        with open(package_json_path, 'r') as f:
            self.package_json = json.load(f)
    
    def test_capacitor_wifi_dependency_exists(self):
        """Verify @capgo/capacitor-wifi is in dependencies"""
        deps = self.package_json.get('dependencies', {})
        assert '@capgo/capacitor-wifi' in deps, \
            "@capgo/capacitor-wifi should be in dependencies"
        print(f"PASSED: @capgo/capacitor-wifi dependency found: {deps['@capgo/capacitor-wifi']}")
    
    def test_all_four_native_plugins_installed(self):
        """Verify all 4 native plugins are installed"""
        deps = self.package_json.get('dependencies', {})
        
        required_plugins = [
            '@capacitor-community/bluetooth-le',
            '@kduma-autoid/capacitor-bluetooth-printer',
            'capacitor-tcp-socket',
            '@capgo/capacitor-wifi'
        ]
        
        for plugin in required_plugins:
            assert plugin in deps, f"{plugin} should be in dependencies"
            print(f"  - {plugin}: {deps[plugin]}")
        
        print("PASSED: All 4 native plugins are installed")


class TestPreviousFeaturesStillWork:
    """Tests to verify previous features still work"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Read source files"""
        with open('/app/frontend/src/services/printer.js', 'r') as f:
            self.printer_js = f.read()
        with open('/app/frontend/src/pages/PrinterSettings.js', 'r') as f:
            self.settings_js = f.read()
    
    def test_print_to_device_still_exists(self):
        """Verify printToDevice method still exists with duplicate prevention"""
        assert "async printToDevice(printer, escposBase64, apiUrl, authToken)" in self.printer_js, \
            "printToDevice method should still exist"
        assert "this._printing" in self.printer_js, \
            "Duplicate prevention lock should still exist"
        print("PASSED: printToDevice with duplicate prevention still works")
    
    def test_bluetooth_discovery_still_works(self):
        """Verify Bluetooth discovery methods still exist"""
        assert "async listPairedDevices()" in self.printer_js, \
            "listPairedDevices method should still exist"
        assert "async scanBLEDevices(" in self.printer_js, \
            "scanBLEDevices method should still exist"
        print("PASSED: Bluetooth discovery methods still exist")
    
    def test_tcp_socket_import_still_exists(self):
        """Verify TcpSocket import still exists"""
        assert "import { TcpSocket } from 'capacitor-tcp-socket'" in self.printer_js, \
            "TcpSocket import should still exist"
        print("PASSED: TcpSocket import still exists")
    
    def test_print_wifi_native_still_works(self):
        """Verify _printWifiNative method still exists"""
        assert "async _printWifiNative(ip, port, base64Data)" in self.printer_js, \
            "_printWifiNative method should still exist"
        print("PASSED: _printWifiNative method still exists")
    
    def test_printer_settings_test_button_still_works(self):
        """Verify test button functionality still exists"""
        assert "handleTest" in self.settings_js, \
            "handleTest function should still exist"
        assert "printerService.printToDevice" in self.settings_js, \
            "Test should use printerService.printToDevice"
        print("PASSED: Test button functionality still exists")


# ============================================================
# API Tests - Verify backend APIs still work
# ============================================================

class TestBackendAPIs:
    """Tests for backend API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get auth token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_printers_endpoint(self):
        """Verify GET /api/printers endpoint works"""
        response = self.session.get(f"{BASE_URL}/api/printers")
        assert response.status_code == 200, f"GET /api/printers failed: {response.status_code}"
        printers = response.json()
        assert isinstance(printers, list), "Response should be a list"
        print(f"PASSED: GET /api/printers returns {len(printers)} printers")
    
    def test_get_default_printer_endpoint(self):
        """Verify GET /api/printers/default endpoint works"""
        response = self.session.get(f"{BASE_URL}/api/printers/default")
        # 200 if default exists, 404 if not
        assert response.status_code in [200, 404], \
            f"GET /api/printers/default failed: {response.status_code}"
        print(f"PASSED: GET /api/printers/default returns {response.status_code}")
    
    def test_printer_test_endpoint(self):
        """Verify POST /api/printers/{id}/test endpoint works"""
        # First get a printer
        printers_response = self.session.get(f"{BASE_URL}/api/printers")
        if printers_response.status_code == 200 and len(printers_response.json()) > 0:
            printer_id = printers_response.json()[0]['id']
            response = self.session.post(f"{BASE_URL}/api/printers/{printer_id}/test")
            assert response.status_code == 200, \
                f"POST /api/printers/{printer_id}/test failed: {response.status_code}"
            result = response.json()
            assert 'commands' in result, "Test response should contain commands"
            print(f"PASSED: POST /api/printers/{printer_id}/test returns ESC/POS commands")
        else:
            pytest.skip("No printers available for testing")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
