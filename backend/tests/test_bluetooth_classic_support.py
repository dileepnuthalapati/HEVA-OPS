"""
Test suite for HevaPOS Bluetooth Classic (SPP) Support - Iteration 14
Tests the new @kduma-autoid/capacitor-bluetooth-printer integration:
- printer.js has SPP+BLE dual support with fallback logic
- listPairedDevices() calls BluetoothPrinter.list()
- PrinterSettings scanBluetoothDevices shows paired devices first
- Package.json has @kduma-autoid/capacitor-bluetooth-printer dependency
- Backend printer endpoints still work correctly
"""

import pytest
import requests
import os
import base64
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
RESTAURANT_ADMIN = {"username": "restaurant_admin", "password": "admin123"}
STAFF_USER = {"username": "user", "password": "user123"}


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get restaurant admin auth token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def staff_token(api_client):
    """Get staff user auth token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=STAFF_USER)
    assert response.status_code == 200, f"Staff login failed: {response.text}"
    return response.json().get("access_token")


class TestBackendPrinterEndpoints:
    """Verify backend printer endpoints still work correctly"""
    
    def test_get_default_printer(self, api_client, admin_token):
        """GET /api/printers/default returns default printer"""
        response = api_client.get(
            f"{BASE_URL}/api/printers/default",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        if data:
            assert "id" in data
            assert "name" in data
            assert "type" in data
            assert "address" in data
            print(f"Default printer: {data['name']} ({data['type']})")
        else:
            print("No default printer configured")
    
    def test_test_printer_returns_sent_field(self, api_client, admin_token):
        """POST /api/printers/{id}/test returns sent/send_error for WiFi"""
        # Get printers
        response = api_client.get(
            f"{BASE_URL}/api/printers",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        printers = response.json()
        
        if not printers:
            pytest.skip("No printers configured")
        
        # Find WiFi printer
        wifi_printer = next((p for p in printers if p.get("type") == "wifi"), None)
        if not wifi_printer:
            pytest.skip("No WiFi printer configured")
        
        # Test the printer
        response = api_client.post(
            f"{BASE_URL}/api/printers/{wifi_printer['id']}/test",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify sent/send_error fields exist
        assert "sent" in data, "Missing 'sent' field in response"
        assert "send_error" in data, "Missing 'send_error' field in response"
        assert "commands" in data, "Missing 'commands' field"
        
        print(f"Test result: sent={data['sent']}, error={data.get('send_error')}")
    
    def test_wifi_tcp_proxy_endpoint(self, api_client, admin_token):
        """POST /api/printer/send handles WiFi TCP proxy"""
        test_data = base64.b64encode(b"\x1b@TEST\n").decode()
        
        response = api_client.post(
            f"{BASE_URL}/api/printer/send",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"ip": "192.168.1.100", "port": 9100, "data": test_data}
        )
        # Expected to fail with timeout for unreachable IP
        assert response.status_code in [400, 408, 503, 500]
        print(f"WiFi proxy returned expected error: {response.status_code}")
    
    def test_print_kitchen_receipt_returns_base64(self, api_client, staff_token):
        """POST /api/print/kitchen/{order_id} returns ESC/POS base64"""
        # Get pending orders
        response = api_client.get(
            f"{BASE_URL}/api/orders/pending",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        assert response.status_code == 200
        orders = response.json()
        
        if not orders:
            # Create a test order
            products_resp = api_client.get(
                f"{BASE_URL}/api/products",
                headers={"Authorization": f"Bearer {staff_token}"}
            )
            products = products_resp.json()
            if not products:
                pytest.skip("No products available")
            
            product = products[0]
            order_data = {
                "items": [{
                    "product_id": product["id"],
                    "product_name": product["name"],
                    "quantity": 1,
                    "unit_price": product["price"],
                    "total": product["price"]
                }],
                "subtotal": product["price"],
                "total_amount": product["price"]
            }
            
            create_resp = api_client.post(
                f"{BASE_URL}/api/orders",
                headers={"Authorization": f"Bearer {staff_token}"},
                json=order_data
            )
            assert create_resp.status_code == 200
            order_id = create_resp.json()["id"]
        else:
            order_id = orders[0]["id"]
        
        # Print kitchen receipt
        response = api_client.post(
            f"{BASE_URL}/api/print/kitchen/{order_id}",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "commands" in data
        # Verify valid base64
        decoded = base64.b64decode(data["commands"])
        assert len(decoded) > 0
        print(f"Kitchen receipt: {len(decoded)} bytes")
    
    def test_print_customer_receipt_returns_base64(self, api_client, staff_token):
        """POST /api/print/customer/{order_id} returns ESC/POS base64"""
        # Get completed orders
        response = api_client.get(
            f"{BASE_URL}/api/orders?today_only=true",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        assert response.status_code == 200
        orders = response.json()
        
        completed = [o for o in orders if o.get("status") == "completed"]
        if not completed:
            pytest.skip("No completed orders available")
        
        order_id = completed[0]["id"]
        
        # Print customer receipt
        response = api_client.post(
            f"{BASE_URL}/api/print/customer/{order_id}",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "commands" in data
        decoded = base64.b64decode(data["commands"])
        assert len(decoded) > 0
        print(f"Customer receipt: {len(decoded)} bytes")


class TestBluetoothClassicFrontendCode:
    """Verify frontend code has Bluetooth Classic (SPP) support"""
    
    def test_package_json_has_bluetooth_printer_dependency(self):
        """package.json includes @kduma-autoid/capacitor-bluetooth-printer"""
        package_path = "/app/frontend/package.json"
        assert os.path.exists(package_path)
        
        with open(package_path, 'r') as f:
            package = json.load(f)
        
        deps = package.get("dependencies", {})
        assert "@kduma-autoid/capacitor-bluetooth-printer" in deps, \
            "Missing @kduma-autoid/capacitor-bluetooth-printer dependency"
        
        version = deps["@kduma-autoid/capacitor-bluetooth-printer"]
        print(f"@kduma-autoid/capacitor-bluetooth-printer version: {version}")
    
    def test_printer_js_imports_bluetooth_classic_plugin(self):
        """printer.js dynamically imports @kduma-autoid/capacitor-bluetooth-printer"""
        printer_path = "/app/frontend/src/services/printer.js"
        assert os.path.exists(printer_path)
        
        with open(printer_path, 'r') as f:
            content = f.read()
        
        # Check for dynamic import of Bluetooth Classic plugin
        assert "@kduma-autoid/capacitor-bluetooth-printer" in content, \
            "Missing import for @kduma-autoid/capacitor-bluetooth-printer"
        assert "BluetoothPrinter" in content, \
            "Missing BluetoothPrinter reference"
        assert "getBluetoothClassicPlugin" in content or "import('@kduma-autoid" in content, \
            "Missing dynamic import function for Bluetooth Classic plugin"
        
        print("printer.js correctly imports Bluetooth Classic plugin")
    
    def test_printer_js_has_spp_ble_fallback_logic(self):
        """printer.js _printBluetooth tries SPP first, then BLE"""
        printer_path = "/app/frontend/src/services/printer.js"
        
        with open(printer_path, 'r') as f:
            content = f.read()
        
        # Check for SPP+BLE fallback pattern
        assert "_printBluetooth" in content, "Missing _printBluetooth method"
        assert "_tryClassicSPP" in content, "Missing _tryClassicSPP method"
        assert "_printViaBLE" in content, "Missing _printViaBLE method"
        
        # Verify fallback logic exists
        assert "sppResult" in content or "Classic SPP" in content, \
            "Missing SPP result handling"
        assert "trying BLE" in content.lower() or "fallback" in content.lower(), \
            "Missing BLE fallback logic"
        
        print("printer.js has SPP+BLE dual support with fallback")
    
    def test_printer_js_has_list_paired_devices(self):
        """printer.js has listPairedDevices() method"""
        printer_path = "/app/frontend/src/services/printer.js"
        
        with open(printer_path, 'r') as f:
            content = f.read()
        
        assert "listPairedDevices" in content, "Missing listPairedDevices method"
        assert "BluetoothPrinter.list" in content, \
            "listPairedDevices should call BluetoothPrinter.list()"
        
        print("printer.js has listPairedDevices() calling BluetoothPrinter.list()")
    
    def test_printer_js_has_scan_ble_devices(self):
        """printer.js has scanBLEDevices() method"""
        printer_path = "/app/frontend/src/services/printer.js"
        
        with open(printer_path, 'r') as f:
            content = f.read()
        
        assert "scanBLEDevices" in content, "Missing scanBLEDevices method"
        assert "BleClient" in content, "Missing BleClient reference"
        
        print("printer.js has scanBLEDevices() for BLE discovery")
    
    def test_printer_js_has_print_to_device(self):
        """printer.js has printToDevice() main method"""
        printer_path = "/app/frontend/src/services/printer.js"
        
        with open(printer_path, 'r') as f:
            content = f.read()
        
        assert "printToDevice" in content, "Missing printToDevice method"
        assert "_printWifi" in content, "Missing _printWifi method"
        assert "_printBluetooth" in content, "Missing _printBluetooth method"
        
        # Check it handles both wifi and bluetooth types
        assert "printer.type === 'wifi'" in content or "'wifi'" in content
        assert "printer.type === 'bluetooth'" in content or "'bluetooth'" in content
        
        print("printer.js has printToDevice() with wifi/bluetooth handling")


class TestPrinterSettingsBluetoothDiscovery:
    """Verify PrinterSettings shows paired devices first"""
    
    def test_printer_settings_calls_list_paired_devices(self):
        """PrinterSettings scanBluetoothDevices calls listPairedDevices"""
        settings_path = "/app/frontend/src/pages/PrinterSettings.js"
        assert os.path.exists(settings_path)
        
        with open(settings_path, 'r') as f:
            content = f.read()
        
        assert "scanBluetoothDevices" in content, "Missing scanBluetoothDevices function"
        assert "listPairedDevices" in content, \
            "scanBluetoothDevices should call listPairedDevices"
        
        print("PrinterSettings calls listPairedDevices for paired device discovery")
    
    def test_printer_settings_calls_scan_ble_devices(self):
        """PrinterSettings scanBluetoothDevices also calls scanBLEDevices"""
        settings_path = "/app/frontend/src/pages/PrinterSettings.js"
        
        with open(settings_path, 'r') as f:
            content = f.read()
        
        assert "scanBLEDevices" in content, \
            "scanBluetoothDevices should also call scanBLEDevices for BLE scan"
        
        print("PrinterSettings calls scanBLEDevices for BLE discovery")
    
    def test_printer_settings_shows_paired_badge(self):
        """PrinterSettings shows 'Paired' badge for paired devices"""
        settings_path = "/app/frontend/src/pages/PrinterSettings.js"
        
        with open(settings_path, 'r') as f:
            content = f.read()
        
        # Check for paired device indicator
        assert "paired" in content.lower(), "Missing paired device indicator"
        assert "Paired" in content, "Missing 'Paired' badge text"
        
        print("PrinterSettings shows 'Paired' badge for paired devices")
    
    def test_printer_settings_mentions_paired_devices_in_ui(self):
        """PrinterSettings UI mentions paired Bluetooth devices"""
        settings_path = "/app/frontend/src/pages/PrinterSettings.js"
        
        with open(settings_path, 'r') as f:
            content = f.read()
        
        # Check for UI text about paired devices
        assert "paired" in content.lower()
        # Check for helpful text about pairing
        assert "Android Bluetooth" in content or "Bluetooth Settings" in content, \
            "Should mention Android Bluetooth settings for pairing"
        
        print("PrinterSettings UI mentions paired devices and pairing instructions")


class TestPOSScreenPrintIntegration:
    """Verify POSScreen sendToPrinter helper works correctly"""
    
    def test_pos_screen_has_send_to_printer(self):
        """POSScreen has sendToPrinter helper function"""
        pos_path = "/app/frontend/src/pages/POSScreen.js"
        assert os.path.exists(pos_path)
        
        with open(pos_path, 'r') as f:
            content = f.read()
        
        assert "sendToPrinter" in content, "Missing sendToPrinter helper"
        print("POSScreen has sendToPrinter helper")
    
    def test_pos_screen_fetches_default_printer(self):
        """POSScreen sendToPrinter fetches default printer"""
        pos_path = "/app/frontend/src/pages/POSScreen.js"
        
        with open(pos_path, 'r') as f:
            content = f.read()
        
        assert "printerAPI.getDefault" in content, \
            "sendToPrinter should call printerAPI.getDefault()"
        
        print("POSScreen fetches default printer via printerAPI.getDefault()")
    
    def test_pos_screen_calls_print_to_device(self):
        """POSScreen sendToPrinter calls printerService.printToDevice"""
        pos_path = "/app/frontend/src/pages/POSScreen.js"
        
        with open(pos_path, 'r') as f:
            content = f.read()
        
        assert "printerService.printToDevice" in content, \
            "sendToPrinter should call printerService.printToDevice()"
        
        print("POSScreen calls printerService.printToDevice()")


class TestAPIServicePrinterMethods:
    """Verify api.js has required printerAPI methods"""
    
    def test_api_js_has_get_default(self):
        """api.js printerAPI has getDefault method"""
        api_path = "/app/frontend/src/services/api.js"
        assert os.path.exists(api_path)
        
        with open(api_path, 'r') as f:
            content = f.read()
        
        assert "getDefault" in content, "Missing getDefault method"
        assert "/printers/default" in content, "Missing /printers/default endpoint"
        
        print("api.js has printerAPI.getDefault()")
    
    def test_api_js_has_send_to_wifi(self):
        """api.js printerAPI has sendToWifi method"""
        api_path = "/app/frontend/src/services/api.js"
        
        with open(api_path, 'r') as f:
            content = f.read()
        
        assert "sendToWifi" in content, "Missing sendToWifi method"
        assert "/printer/send" in content, "Missing /printer/send endpoint"
        
        print("api.js has printerAPI.sendToWifi()")
