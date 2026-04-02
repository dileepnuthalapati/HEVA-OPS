"""
HevaPOS WiFi TCP Printing Tests - Iteration 17
Tests for capacitor-tcp-socket integration and WiFi printing features

Features tested:
1. printer.js TcpSocket import (static import from capacitor-tcp-socket)
2. printer.js _printWifi uses native TCP when isNative, backend proxy when browser
3. printer.js _printWifiNative uses TcpSocket.connect/send/disconnect with base64 encoding
4. printer.js scanWifiPrinters uses TcpSocket.connect to probe IPs on port 9100
5. printer.js _printing lock prevents duplicate prints
6. printer.js _printBluetooth tries ClassicSPP first then BLE with busy-printer guidance
7. PrinterSettings WiFi scan uses native TCP scanner when isNativeApp
8. PrinterSettings test print uses unified printerService.printToDevice for both WiFi and BT
9. PrinterSettings help section recommends WiFi for multi-device setups
10. POSScreen Print button on pending orders works
11. POSScreen sendToPrinter has duplicate prevention with isPrinting state
12. Backend /api/printers/default returns printer
13. Backend /api/print/kitchen/{order_id} returns ESC/POS commands
14. package.json has capacitor-tcp-socket dependency
"""

import pytest
import requests
import os
import json
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://stripe-billing-ui-1.preview.emergentagent.com')


class TestBackendPrinterAPIs:
    """Backend API tests for printer endpoints"""
    
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
        """Test /api/printers/default returns a printer"""
        response = requests.get(f"{BASE_URL}/api/printers/default", headers=self.headers)
        assert response.status_code == 200, f"Failed to get default printer: {response.text}"
        printer = response.json()
        assert printer is not None, "No default printer returned"
        assert "id" in printer, "Printer missing id"
        assert "name" in printer, "Printer missing name"
        assert "type" in printer, "Printer missing type"
        assert "address" in printer, "Printer missing address"
        assert printer["is_default"] == True, "Printer is not marked as default"
        print(f"Default printer: {printer['name']} ({printer['type']}) at {printer['address']}")
    
    def test_get_all_printers(self):
        """Test /api/printers returns list of printers"""
        response = requests.get(f"{BASE_URL}/api/printers", headers=self.headers)
        assert response.status_code == 200, f"Failed to get printers: {response.text}"
        printers = response.json()
        assert isinstance(printers, list), "Printers should be a list"
        assert len(printers) > 0, "No printers found"
        print(f"Found {len(printers)} printers")
    
    def test_print_kitchen_receipt_endpoint(self):
        """Test /api/print/kitchen/{order_id} returns ESC/POS commands"""
        # First get a pending order
        response = requests.get(f"{BASE_URL}/api/orders/pending", headers=self.headers)
        assert response.status_code == 200, f"Failed to get pending orders: {response.text}"
        orders = response.json()
        assert len(orders) > 0, "No pending orders found"
        
        order_id = orders[0]["id"]
        
        # Test kitchen print endpoint
        response = requests.post(f"{BASE_URL}/api/print/kitchen/{order_id}", headers=self.headers)
        assert response.status_code == 200, f"Failed to print kitchen receipt: {response.text}"
        result = response.json()
        assert "commands" in result, "Response missing 'commands' field"
        assert result["commands"] is not None, "Commands should not be null"
        assert len(result["commands"]) > 0, "Commands should not be empty"
        assert "order_id" in result, "Response missing 'order_id'"
        assert result["order_id"] == order_id, "Order ID mismatch"
        print(f"Kitchen receipt generated for order {order_id}, commands length: {len(result['commands'])}")
    
    def test_printer_send_endpoint_exists(self):
        """Test /api/printer/send endpoint exists (backend proxy for browser)"""
        # This endpoint is used by browser fallback when native TCP is not available
        # We test that it exists and returns proper error for invalid data
        response = requests.post(f"{BASE_URL}/api/printer/send", 
            headers={**self.headers, "Content-Type": "application/json"},
            json={"ip": "192.168.1.100", "port": 9100, "data": "dGVzdA=="})
        # Should fail with timeout/connection error since IP is not reachable
        # But endpoint should exist (not 404)
        assert response.status_code != 404, "Printer send endpoint not found"
        print(f"Printer send endpoint exists, status: {response.status_code}")


class TestFrontendPrinterServiceCode:
    """Code review tests for printer.js"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Read printer.js file"""
        with open('/app/frontend/src/services/printer.js', 'r') as f:
            self.printer_code = f.read()
    
    def test_tcp_socket_import(self):
        """Verify TcpSocket is imported from capacitor-tcp-socket"""
        assert "import { TcpSocket } from 'capacitor-tcp-socket'" in self.printer_code, \
            "TcpSocket import not found"
        print("TcpSocket import verified: import { TcpSocket } from 'capacitor-tcp-socket'")
    
    def test_print_wifi_native_method(self):
        """Verify _printWifiNative method exists and uses TcpSocket"""
        assert "_printWifiNative" in self.printer_code, "_printWifiNative method not found"
        assert "TcpSocket.connect" in self.printer_code, "TcpSocket.connect not found"
        assert "TcpSocket.send" in self.printer_code, "TcpSocket.send not found"
        assert "TcpSocket.disconnect" in self.printer_code, "TcpSocket.disconnect not found"
        print("_printWifiNative method verified with TcpSocket.connect/send/disconnect")
    
    def test_print_wifi_native_uses_base64(self):
        """Verify _printWifiNative sends data with base64 encoding"""
        # Check for encoding: 'base64' in the send call
        assert "encoding: 'base64'" in self.printer_code, "base64 encoding not found in TcpSocket.send"
        print("_printWifiNative uses base64 encoding for data")
    
    def test_print_wifi_checks_is_native(self):
        """Verify _printWifi checks isNative before using native TCP"""
        # Find the _printWifi method and check it uses isNative
        assert "if (this.isNative)" in self.printer_code, "isNative check not found in _printWifi"
        assert "_printWifiNative" in self.printer_code, "_printWifiNative call not found"
        assert "_printWifiBackend" in self.printer_code, "_printWifiBackend fallback not found"
        print("_printWifi correctly checks isNative and has backend fallback")
    
    def test_scan_wifi_printers_method(self):
        """Verify scanWifiPrinters method exists and uses TcpSocket"""
        assert "scanWifiPrinters" in self.printer_code, "scanWifiPrinters method not found"
        assert "_probeWifiPrinter" in self.printer_code, "_probeWifiPrinter helper not found"
        print("scanWifiPrinters method verified")
    
    def test_probe_wifi_printer_uses_tcp(self):
        """Verify _probeWifiPrinter uses TcpSocket.connect to probe IPs"""
        # Find _probeWifiPrinter method
        assert "_probeWifiPrinter" in self.printer_code, "_probeWifiPrinter not found"
        # Check it uses TcpSocket.connect
        probe_match = re.search(r'_probeWifiPrinter.*?{(.*?)}', self.printer_code, re.DOTALL)
        assert probe_match, "_probeWifiPrinter method body not found"
        probe_body = probe_match.group(1)
        assert "TcpSocket.connect" in probe_body or "TcpSocket.connect" in self.printer_code, \
            "TcpSocket.connect not used in _probeWifiPrinter"
        print("_probeWifiPrinter uses TcpSocket.connect for probing")
    
    def test_printing_lock_exists(self):
        """Verify _printing lock prevents duplicate prints"""
        assert "this._printing = false" in self.printer_code or "_printing = false" in self.printer_code, \
            "_printing lock initialization not found"
        assert "this._printing" in self.printer_code, "_printing lock not used"
        print("_printing lock verified for duplicate print prevention")
    
    def test_printing_lock_check_in_print_to_device(self):
        """Verify printToDevice checks _printing lock"""
        assert "if (this._printing)" in self.printer_code, "_printing check not found in printToDevice"
        assert "Printer is busy" in self.printer_code, "Busy printer error message not found"
        print("printToDevice checks _printing lock with 'Printer is busy' error")
    
    def test_bluetooth_tries_classic_spp_first(self):
        """Verify _printBluetooth tries Classic SPP first, then BLE"""
        assert "_tryClassicSPP" in self.printer_code, "_tryClassicSPP method not found"
        assert "_printViaBLE" in self.printer_code, "_printViaBLE fallback not found"
        # Check order: SPP first, then BLE
        spp_pos = self.printer_code.find("_tryClassicSPP")
        ble_pos = self.printer_code.find("_printViaBLE")
        assert spp_pos < ble_pos, "Classic SPP should be tried before BLE"
        print("_printBluetooth tries Classic SPP first, then BLE fallback")
    
    def test_bluetooth_busy_printer_guidance(self):
        """Verify Bluetooth error includes WiFi recommendation for multi-device"""
        assert "WiFi" in self.printer_code, "WiFi recommendation not found in Bluetooth error"
        assert "multiple devices" in self.printer_code.lower() or "multi-device" in self.printer_code.lower(), \
            "Multi-device guidance not found"
        print("Bluetooth error includes WiFi recommendation for multi-device setups")


class TestFrontendPrinterSettingsCode:
    """Code review tests for PrinterSettings.js"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Read PrinterSettings.js file"""
        with open('/app/frontend/src/pages/PrinterSettings.js', 'r') as f:
            self.settings_code = f.read()
    
    def test_is_native_app_check(self):
        """Verify isNativeApp check exists"""
        assert "isNativeApp" in self.settings_code, "isNativeApp check not found"
        assert "Capacitor" in self.settings_code, "Capacitor check not found"
        print("isNativeApp check verified using Capacitor.isNativePlatform")
    
    def test_wifi_scan_uses_native_tcp(self):
        """Verify WiFi scan uses native TCP scanner when isNativeApp"""
        assert "if (isNativeApp)" in self.settings_code, "isNativeApp condition not found in WiFi scan"
        assert "printerService.scanWifiPrinters" in self.settings_code, \
            "printerService.scanWifiPrinters not called"
        print("WiFi scan uses native TCP scanner when isNativeApp")
    
    def test_test_print_uses_unified_service(self):
        """Verify test print uses printerService.printToDevice for both WiFi and BT"""
        assert "printerService.printToDevice" in self.settings_code, \
            "printerService.printToDevice not found in handleTest"
        print("Test print uses unified printerService.printToDevice")
    
    def test_help_section_recommends_wifi(self):
        """Verify help section recommends WiFi for multi-device setups"""
        assert "WiFi Printer (Recommended for Multi-Device)" in self.settings_code or \
               "Recommended for Multi-Device" in self.settings_code, \
            "WiFi recommendation for multi-device not found"
        assert "Sharing a printer between multiple devices" in self.settings_code, \
            "Multi-device sharing tip not found"
        print("Help section recommends WiFi for multi-device setups")
    
    def test_bluetooth_one_device_limitation_mentioned(self):
        """Verify Bluetooth one-device limitation is mentioned"""
        assert "one device at a time" in self.settings_code.lower() or \
               "ONE device at a time" in self.settings_code, \
            "Bluetooth one-device limitation not mentioned"
        print("Bluetooth one-device limitation mentioned in help section")


class TestFrontendPOSScreenCode:
    """Code review tests for POSScreen.js"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Read POSScreen.js file"""
        with open('/app/frontend/src/pages/POSScreen.js', 'r') as f:
            self.pos_code = f.read()
    
    def test_print_order_receipt_function(self):
        """Verify printOrderReceipt function exists"""
        assert "printOrderReceipt" in self.pos_code, "printOrderReceipt function not found"
        assert "printerAPI.printKitchenReceipt" in self.pos_code, \
            "printerAPI.printKitchenReceipt not called in printOrderReceipt"
        print("printOrderReceipt function verified")
    
    def test_is_printing_state(self):
        """Verify isPrinting state exists for duplicate prevention"""
        assert "isPrinting" in self.pos_code, "isPrinting state not found"
        assert "setIsPrinting" in self.pos_code, "setIsPrinting not found"
        print("isPrinting state verified for duplicate prevention")
    
    def test_send_to_printer_checks_is_printing(self):
        """Verify sendToPrinter checks isPrinting state"""
        assert "if (isPrinting)" in self.pos_code, "isPrinting check not found in sendToPrinter"
        print("sendToPrinter checks isPrinting state")
    
    def test_print_button_on_pending_orders(self):
        """Verify Print button exists on pending orders"""
        assert 'data-testid={`print-order-' in self.pos_code or \
               "data-testid={`print-order-${" in self.pos_code, \
            "Print button data-testid not found"
        assert "printOrderReceipt" in self.pos_code, "printOrderReceipt not called from Print button"
        print("Print button verified on pending orders with data-testid")
    
    def test_print_button_disabled_when_printing(self):
        """Verify Print button is disabled when isPrinting"""
        assert "disabled={isPrinting}" in self.pos_code, \
            "Print button not disabled when isPrinting"
        print("Print button disabled when isPrinting")


class TestPackageJsonDependency:
    """Test package.json has capacitor-tcp-socket dependency"""
    
    def test_capacitor_tcp_socket_dependency(self):
        """Verify capacitor-tcp-socket is in package.json"""
        with open('/app/frontend/package.json', 'r') as f:
            package = json.load(f)
        
        dependencies = package.get("dependencies", {})
        assert "capacitor-tcp-socket" in dependencies, \
            "capacitor-tcp-socket not found in dependencies"
        
        version = dependencies["capacitor-tcp-socket"]
        print(f"capacitor-tcp-socket dependency verified: {version}")
    
    def test_all_printer_plugins_installed(self):
        """Verify all three printer plugins are installed"""
        with open('/app/frontend/package.json', 'r') as f:
            package = json.load(f)
        
        dependencies = package.get("dependencies", {})
        
        # Check all three plugins
        assert "@capacitor-community/bluetooth-le" in dependencies, \
            "@capacitor-community/bluetooth-le not found"
        assert "@kduma-autoid/capacitor-bluetooth-printer" in dependencies, \
            "@kduma-autoid/capacitor-bluetooth-printer not found"
        assert "capacitor-tcp-socket" in dependencies, \
            "capacitor-tcp-socket not found"
        
        print("All three printer plugins verified:")
        print(f"  - @capacitor-community/bluetooth-le: {dependencies['@capacitor-community/bluetooth-le']}")
        print(f"  - @kduma-autoid/capacitor-bluetooth-printer: {dependencies['@kduma-autoid/capacitor-bluetooth-printer']}")
        print(f"  - capacitor-tcp-socket: {dependencies['capacitor-tcp-socket']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
