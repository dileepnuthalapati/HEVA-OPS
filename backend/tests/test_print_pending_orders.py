"""
Test suite for HevaPOS Print Pending Orders Feature (Iteration 16)
Tests the new features:
1. Print button visible on each pending order with data-testid='print-order-{id}'
2. Print button calls printOrderReceipt() which generates kitchen receipt + sends to printer
3. isPrinting state prevents duplicate simultaneous prints
4. Auto-prints (kitchen/customer) use 'auto' label and don't show toast errors
5. printer.js _printing lock prevents concurrent print jobs with clear 'busy' error
6. Better error message when Bluetooth fails mentioning WiFi for multi-device
7. PrinterSettings help section mentions WiFi for sharing printer between multiple devices
8. BLE scan only shows named devices (no Unknown Device entries)
9. Backend /api/printers/default returns printer
10. Backend /api/print/kitchen/{order_id} returns ESC/POS commands
"""

import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://stripe-billing-ui-1.preview.emergentagent.com')


class TestBackendPrintAPIs:
    """Test backend print API endpoints"""
    
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
    
    def test_get_pending_orders(self):
        """Test /api/orders/pending endpoint returns list of pending orders"""
        response = requests.get(f"{BASE_URL}/api/orders/pending", headers=self.headers)
        assert response.status_code == 200, f"Failed to get pending orders: {response.text}"
        orders = response.json()
        assert isinstance(orders, list)
        print(f"Found {len(orders)} pending orders")
        for o in orders[:3]:  # Show first 3
            print(f"  - Order #{o.get('order_number', 'N/A')} - {o.get('status', 'N/A')}")
        return orders
    
    def test_print_kitchen_receipt_endpoint(self):
        """Test /api/print/kitchen/{order_id} returns ESC/POS commands"""
        # First get a pending order
        response = requests.get(f"{BASE_URL}/api/orders/pending", headers=self.headers)
        assert response.status_code == 200
        orders = response.json()
        
        if not orders:
            pytest.skip("No pending orders to test kitchen receipt")
        
        order = orders[0]
        order_id = order['id']
        
        # Call the kitchen receipt endpoint
        response = requests.post(f"{BASE_URL}/api/print/kitchen/{order_id}", headers=self.headers)
        assert response.status_code == 200, f"Failed to generate kitchen receipt: {response.text}"
        
        data = response.json()
        # Verify required fields
        assert "order_id" in data, "Response missing 'order_id' field"
        assert "order_number" in data, "Response missing 'order_number' field"
        assert "commands" in data, "Response missing 'commands' field (ESC/POS data)"
        
        # Verify commands is base64 encoded
        import base64
        try:
            decoded = base64.b64decode(data['commands'])
            assert len(decoded) > 0, "ESC/POS commands should not be empty"
            print(f"Kitchen receipt generated: {len(decoded)} bytes of ESC/POS data")
        except Exception as e:
            pytest.fail(f"Commands should be valid base64: {e}")
        
        print(f"Order #{data['order_number']} kitchen receipt ready")


class TestPOSScreenPrintButton:
    """Test POSScreen.js Print button on pending orders"""
    
    @pytest.fixture(autouse=True)
    def load_pos_screen(self):
        """Load POSScreen.js content"""
        with open('/app/frontend/src/pages/POSScreen.js', 'r') as f:
            self.pos_screen = f.read()
    
    def test_print_button_exists_on_pending_orders(self):
        """Verify Print button exists with data-testid='print-order-{id}'"""
        pattern = r'data-testid=\{`print-order-\$\{order\.id\}`\}'
        match = re.search(pattern, self.pos_screen)
        assert match, "Print button should have data-testid='print-order-{order.id}'"
        print("Found Print button with correct data-testid")
    
    def test_print_button_calls_print_order_receipt(self):
        """Verify Print button onClick calls printOrderReceipt()"""
        # Look for onClick handler that calls printOrderReceipt
        pattern = r'onClick=\{.*printOrderReceipt\s*\(\s*order\.id'
        match = re.search(pattern, self.pos_screen)
        assert match, "Print button should call printOrderReceipt(order.id, ...)"
        print("Found Print button onClick calling printOrderReceipt()")
    
    def test_print_order_receipt_function_exists(self):
        """Verify printOrderReceipt function is defined"""
        pattern = r'const\s+printOrderReceipt\s*=\s*async'
        match = re.search(pattern, self.pos_screen)
        assert match, "printOrderReceipt async function should be defined"
        print("Found printOrderReceipt async function")
    
    def test_print_order_receipt_calls_kitchen_api(self):
        """Verify printOrderReceipt calls printerAPI.printKitchenReceipt()"""
        pattern = r'printerAPI\.printKitchenReceipt\s*\(\s*orderId\s*\)'
        match = re.search(pattern, self.pos_screen)
        assert match, "printOrderReceipt should call printerAPI.printKitchenReceipt(orderId)"
        print("Found call to printerAPI.printKitchenReceipt()")
    
    def test_four_column_grid_for_pending_order_buttons(self):
        """Verify pending orders have 4-column grid: Print/Edit/Cancel/Pay"""
        # Look for grid-cols-4 in the pending orders section
        pattern = r'grid\s+grid-cols-4'
        match = re.search(pattern, self.pos_screen)
        assert match, "Pending order buttons should be in a 4-column grid"
        print("Found 4-column grid for pending order buttons")


class TestIsPrintingState:
    """Test isPrinting state prevents duplicate prints"""
    
    @pytest.fixture(autouse=True)
    def load_files(self):
        """Load POSScreen.js and printer.js content"""
        with open('/app/frontend/src/pages/POSScreen.js', 'r') as f:
            self.pos_screen = f.read()
        with open('/app/frontend/src/services/printer.js', 'r') as f:
            self.printer_js = f.read()
    
    def test_is_printing_state_in_pos_screen(self):
        """Verify isPrinting state is defined in POSScreen"""
        pattern = r'\[isPrinting,\s*setIsPrinting\]\s*=\s*useState\s*\(\s*false\s*\)'
        match = re.search(pattern, self.pos_screen)
        assert match, "POSScreen should have [isPrinting, setIsPrinting] = useState(false)"
        print("Found isPrinting state in POSScreen")
    
    def test_is_printing_check_in_send_to_printer(self):
        """Verify sendToPrinter checks isPrinting before printing"""
        pattern = r'if\s*\(\s*isPrinting\s*\)'
        match = re.search(pattern, self.pos_screen)
        assert match, "sendToPrinter should check if (isPrinting)"
        print("Found isPrinting check in sendToPrinter")
    
    def test_is_printing_check_in_print_order_receipt(self):
        """Verify printOrderReceipt checks isPrinting before printing"""
        # Look for isPrinting check in printOrderReceipt function
        # The function should return early if isPrinting is true
        pattern = r'printOrderReceipt.*?if\s*\(\s*isPrinting\s*\)'
        match = re.search(pattern, self.pos_screen, re.DOTALL)
        assert match, "printOrderReceipt should check isPrinting"
        print("Found isPrinting check in printOrderReceipt")
    
    def test_printing_lock_in_printer_service(self):
        """Verify printer.js has _printing lock"""
        pattern = r'this\._printing\s*='
        match = re.search(pattern, self.printer_js)
        assert match, "printer.js should have this._printing lock"
        print("Found _printing lock in printer.js")
    
    def test_printing_lock_check_in_print_to_device(self):
        """Verify printToDevice checks _printing lock"""
        pattern = r'if\s*\(\s*this\._printing\s*\)'
        match = re.search(pattern, self.printer_js)
        assert match, "printToDevice should check if (this._printing)"
        print("Found _printing lock check in printToDevice")
    
    def test_busy_error_message(self):
        """Verify busy printer error message is clear"""
        pattern = r'Printer is busy'
        match = re.search(pattern, self.printer_js)
        assert match, "Should have 'Printer is busy' error message"
        print("Found 'Printer is busy' error message")


class TestAutoVsManualPrintLabels:
    """Test auto-prints use 'auto' label and don't show toast errors"""
    
    @pytest.fixture(autouse=True)
    def load_pos_screen(self):
        """Load POSScreen.js content"""
        with open('/app/frontend/src/pages/POSScreen.js', 'r') as f:
            self.pos_screen = f.read()
    
    def test_kitchen_auto_label(self):
        """Verify kitchen auto-print uses 'kitchen-auto' label"""
        pattern = r"sendToPrinter\s*\([^)]*,\s*['\"]kitchen-auto['\"]"
        match = re.search(pattern, self.pos_screen)
        assert match, "Kitchen auto-print should use 'kitchen-auto' label"
        print("Found 'kitchen-auto' label for auto kitchen prints")
    
    def test_customer_auto_label(self):
        """Verify customer auto-print uses 'customer-auto' label"""
        pattern = r"sendToPrinter\s*\([^)]*,\s*['\"]customer-auto['\"]"
        match = re.search(pattern, self.pos_screen)
        assert match, "Customer auto-print should use 'customer-auto' label"
        print("Found 'customer-auto' label for auto customer prints")
    
    def test_auto_prints_dont_show_toast_errors(self):
        """Verify auto-prints don't show toast errors"""
        # Look for the condition that skips toast for auto prints
        pattern = r"label\s*!==\s*['\"]kitchen-auto['\"].*label\s*!==\s*['\"]customer-auto['\"]"
        match = re.search(pattern, self.pos_screen)
        assert match, "Auto-prints should not show toast errors"
        print("Found condition to skip toast for auto-prints")


class TestBluetoothErrorMessages:
    """Test better Bluetooth error messages mentioning WiFi for multi-device"""
    
    @pytest.fixture(autouse=True)
    def load_printer_js(self):
        """Load printer.js content"""
        with open('/app/frontend/src/services/printer.js', 'r') as f:
            self.printer_js = f.read()
    
    def test_wifi_recommendation_in_bt_error(self):
        """Verify Bluetooth error mentions WiFi for multi-device sharing"""
        pattern = r'WiFi.*multiple devices|multiple devices.*WiFi'
        match = re.search(pattern, self.printer_js, re.IGNORECASE)
        assert match, "Bluetooth error should mention WiFi for multi-device sharing"
        print("Found WiFi recommendation in Bluetooth error message")
    
    def test_busy_printer_hint(self):
        """Verify busy printer hint mentions another device connection"""
        pattern = r'connected to another device|another device.*connected'
        match = re.search(pattern, self.printer_js, re.IGNORECASE)
        assert match, "Should mention printer may be connected to another device"
        print("Found hint about printer connected to another device")


class TestPrinterSettingsMultiDeviceTip:
    """Test PrinterSettings help section mentions WiFi for multi-device"""
    
    @pytest.fixture(autouse=True)
    def load_printer_settings(self):
        """Load PrinterSettings.js content"""
        with open('/app/frontend/src/pages/PrinterSettings.js', 'r') as f:
            self.printer_settings = f.read()
    
    def test_multi_device_sharing_tip(self):
        """Verify help section mentions WiFi for sharing printer between devices"""
        pattern = r'Sharing a printer between multiple devices'
        match = re.search(pattern, self.printer_settings)
        assert match, "Help section should mention sharing printer between multiple devices"
        print("Found multi-device sharing tip in help section")
    
    def test_wifi_recommended_for_multi_device(self):
        """Verify WiFi is recommended for multi-device setups"""
        pattern = r'WiFi is recommended|WiFi.*multiple devices'
        match = re.search(pattern, self.printer_settings, re.IGNORECASE)
        assert match, "Should recommend WiFi for multi-device setups"
        print("Found WiFi recommendation for multi-device")
    
    def test_bluetooth_one_device_limitation(self):
        """Verify Bluetooth one-device limitation is mentioned"""
        pattern = r'Bluetooth.*one device at a time|one device.*Bluetooth'
        match = re.search(pattern, self.printer_settings, re.IGNORECASE)
        assert match, "Should mention Bluetooth only allows one device at a time"
        print("Found Bluetooth one-device limitation note")


class TestBLEScanNamedDevicesOnly:
    """Test BLE scan only shows named devices (no Unknown Device entries)"""
    
    @pytest.fixture(autouse=True)
    def load_files(self):
        """Load printer.js and PrinterSettings.js content"""
        with open('/app/frontend/src/services/printer.js', 'r') as f:
            self.printer_js = f.read()
        with open('/app/frontend/src/pages/PrinterSettings.js', 'r') as f:
            self.printer_settings = f.read()
    
    def test_ble_scan_filters_unnamed_devices(self):
        """Verify BLE scan filters out devices without names"""
        # Look for the filter condition: result.device.name
        pattern = r'if\s*\(\s*!seen\.has\(id\)\s*&&\s*result\.device\.name\s*\)'
        match = re.search(pattern, self.printer_js)
        assert match, "BLE scan should filter: if (!seen.has(id) && result.device.name)"
        print("Found BLE scan filter for named devices only")
    
    def test_printer_settings_filters_unnamed_ble(self):
        """Verify PrinterSettings also filters unnamed BLE devices"""
        # Look for the filter in scanBluetoothDevices
        pattern = r'if\s*\(.*!dev\.name\s*\)\s*return'
        match = re.search(pattern, self.printer_settings)
        if not match:
            # Alternative pattern
            pattern = r'pairedIds\.has\(dev\.deviceId\)\s*\|\|\s*!dev\.name'
            match = re.search(pattern, self.printer_settings)
        assert match, "PrinterSettings should filter unnamed BLE devices"
        print("Found unnamed BLE device filter in PrinterSettings")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
