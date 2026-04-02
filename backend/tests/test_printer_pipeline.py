"""
Test suite for HevaPOS Printer Pipeline - Iteration 13
Tests the complete print execution pipeline including:
- GET /api/printers/default - returns default printer for restaurant
- POST /api/printers/{id}/test - test print with sent/send_error fields for WiFi
- POST /api/printer/send - WiFi TCP print proxy
- POST /api/print/kitchen/{order_id} - ESC/POS kitchen receipt
- POST /api/print/customer/{order_id} - ESC/POS customer receipt with currency
"""

import pytest
import requests
import os
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
PLATFORM_OWNER = {"username": "platform_owner", "password": "admin123"}
RESTAURANT_ADMIN = {"username": "restaurant_admin", "password": "admin123"}
STAFF_USER = {"username": "user", "password": "user123"}


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def platform_owner_token(api_client):
    """Get platform owner auth token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER)
    assert response.status_code == 200, f"Platform owner login failed: {response.text}"
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def restaurant_admin_token(api_client):
    """Get restaurant admin auth token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
    assert response.status_code == 200, f"Restaurant admin login failed: {response.text}"
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def staff_token(api_client):
    """Get staff user auth token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=STAFF_USER)
    assert response.status_code == 200, f"Staff login failed: {response.text}"
    return response.json().get("access_token")


class TestPrinterDefaultEndpoint:
    """Tests for GET /api/printers/default"""
    
    def test_get_default_printer_as_admin(self, api_client, restaurant_admin_token):
        """Restaurant admin can get default printer"""
        response = api_client.get(
            f"{BASE_URL}/api/printers/default",
            headers={"Authorization": f"Bearer {restaurant_admin_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        # Can be None if no printer configured, or a printer object
        if data is not None:
            assert "id" in data
            assert "name" in data
            assert "type" in data
            assert "address" in data
            assert "is_default" in data
            print(f"Default printer: {data.get('name')} ({data.get('type')}) at {data.get('address')}")
        else:
            print("No default printer configured")
    
    def test_get_default_printer_as_staff(self, api_client, staff_token):
        """Staff user can get default printer"""
        response = api_client.get(
            f"{BASE_URL}/api/printers/default",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        # Staff should be able to access this for printing
        print("Staff can access default printer endpoint")
    
    def test_get_default_printer_unauthorized(self, api_client):
        """Unauthenticated request should fail"""
        response = api_client.get(f"{BASE_URL}/api/printers/default")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestPrinterTestEndpoint:
    """Tests for POST /api/printers/{id}/test"""
    
    def test_test_printer_returns_sent_field(self, api_client, restaurant_admin_token):
        """Test printer endpoint returns sent and send_error fields for WiFi printers"""
        # First get list of printers
        response = api_client.get(
            f"{BASE_URL}/api/printers",
            headers={"Authorization": f"Bearer {restaurant_admin_token}"}
        )
        assert response.status_code == 200
        printers = response.json()
        
        if not printers:
            pytest.skip("No printers configured to test")
        
        # Find a WiFi printer to test
        wifi_printer = next((p for p in printers if p.get("type") == "wifi"), None)
        if not wifi_printer:
            pytest.skip("No WiFi printer configured")
        
        # Test the printer
        response = api_client.post(
            f"{BASE_URL}/api/printers/{wifi_printer['id']}/test",
            headers={"Authorization": f"Bearer {restaurant_admin_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "message" in data
        assert "printer" in data
        assert "type" in data
        assert "address" in data
        assert "commands" in data  # Base64 ESC/POS commands
        assert "sent" in data  # NEW: boolean indicating if data was sent
        assert "send_error" in data  # NEW: error message if send failed
        
        # For unreachable printer, sent should be False with error
        print(f"Test result: sent={data['sent']}, error={data.get('send_error')}")
        
        # Verify commands is valid base64
        try:
            decoded = base64.b64decode(data["commands"])
            assert len(decoded) > 0, "Commands should not be empty"
            print(f"ESC/POS commands generated: {len(decoded)} bytes")
        except Exception as e:
            pytest.fail(f"Commands is not valid base64: {e}")
    
    def test_test_printer_not_found(self, api_client, restaurant_admin_token):
        """Test non-existent printer returns 404"""
        response = api_client.post(
            f"{BASE_URL}/api/printers/nonexistent_printer_id/test",
            headers={"Authorization": f"Bearer {restaurant_admin_token}"}
        )
        assert response.status_code == 404


class TestPrinterSendEndpoint:
    """Tests for POST /api/printer/send - WiFi TCP proxy"""
    
    def test_send_to_wifi_printer_timeout(self, api_client, restaurant_admin_token):
        """Sending to unreachable IP should return timeout error"""
        # Create minimal ESC/POS test data
        test_data = base64.b64encode(b"\x1b@TEST\n").decode()
        
        response = api_client.post(
            f"{BASE_URL}/api/printer/send",
            headers={"Authorization": f"Bearer {restaurant_admin_token}"},
            json={
                "ip": "192.168.1.100",  # Unreachable test IP
                "port": 9100,
                "data": test_data
            }
        )
        # Should return error for unreachable printer (400 wraps the timeout, or 408/503 directly)
        assert response.status_code in [400, 408, 503, 500], f"Expected timeout/error, got {response.status_code}: {response.text}"
        # Verify the error message mentions timeout or connection issue
        detail = response.json().get('detail', '')
        assert any(x in detail.lower() for x in ['timeout', 'connection', 'refused', 'failed']), f"Error should mention connection issue: {detail}"
        print(f"WiFi send to unreachable IP returned: {response.status_code} - {detail}")
    
    def test_send_to_wifi_printer_invalid_data(self, api_client, restaurant_admin_token):
        """Sending invalid base64 should return 400"""
        response = api_client.post(
            f"{BASE_URL}/api/printer/send",
            headers={"Authorization": f"Bearer {restaurant_admin_token}"},
            json={
                "ip": "192.168.1.100",
                "port": 9100,
                "data": "not-valid-base64!!!"
            }
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
    
    def test_send_to_wifi_printer_unauthorized(self, api_client):
        """Unauthenticated request should fail"""
        test_data = base64.b64encode(b"TEST").decode()
        response = api_client.post(
            f"{BASE_URL}/api/printer/send",
            json={"ip": "192.168.1.100", "port": 9100, "data": test_data}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestKitchenReceiptEndpoint:
    """Tests for POST /api/print/kitchen/{order_id}"""
    
    @pytest.fixture(scope="class")
    def test_order_id(self, api_client, staff_token):
        """Create a test order and return its ID"""
        # First get products
        response = api_client.get(
            f"{BASE_URL}/api/products",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        assert response.status_code == 200
        products = response.json()
        if not products:
            pytest.skip("No products available")
        
        # Create an order
        product = products[0]
        order_data = {
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 2,
                "unit_price": product["price"],
                "total": product["price"] * 2
            }],
            "subtotal": product["price"] * 2,
            "total_amount": product["price"] * 2
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {staff_token}"},
            json=order_data
        )
        assert response.status_code == 200, f"Failed to create order: {response.text}"
        return response.json()["id"]
    
    def test_print_kitchen_receipt(self, api_client, staff_token, test_order_id):
        """Kitchen receipt endpoint returns ESC/POS commands"""
        response = api_client.post(
            f"{BASE_URL}/api/print/kitchen/{test_order_id}",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "order_id" in data
        assert "order_number" in data
        assert "commands" in data
        
        # Verify commands is valid base64
        try:
            decoded = base64.b64decode(data["commands"])
            assert len(decoded) > 0
            # Check for ESC/POS init command (0x1B 0x40)
            assert b'\x1b@' in decoded or decoded[:2] == b'\x1b@', "Should contain ESC/POS init"
            print(f"Kitchen receipt: {len(decoded)} bytes, order #{data['order_number']}")
        except Exception as e:
            pytest.fail(f"Commands is not valid base64: {e}")
    
    def test_print_kitchen_receipt_not_found(self, api_client, staff_token):
        """Non-existent order returns 404"""
        response = api_client.post(
            f"{BASE_URL}/api/print/kitchen/nonexistent_order_id",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        assert response.status_code == 404


class TestCustomerReceiptEndpoint:
    """Tests for POST /api/print/customer/{order_id}"""
    
    @pytest.fixture(scope="class")
    def completed_order_id(self, api_client, staff_token):
        """Create and complete a test order"""
        # Get products
        response = api_client.get(
            f"{BASE_URL}/api/products",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        products = response.json()
        if not products:
            pytest.skip("No products available")
        
        # Create order
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
        
        response = api_client.post(
            f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {staff_token}"},
            json=order_data
        )
        assert response.status_code == 200
        order_id = response.json()["id"]
        
        # Complete the order
        response = api_client.put(
            f"{BASE_URL}/api/orders/{order_id}/complete",
            headers={"Authorization": f"Bearer {staff_token}"},
            json={"payment_method": "cash"}
        )
        assert response.status_code == 200, f"Failed to complete order: {response.text}"
        return order_id
    
    def test_print_customer_receipt(self, api_client, staff_token, completed_order_id):
        """Customer receipt endpoint returns ESC/POS commands with currency"""
        response = api_client.post(
            f"{BASE_URL}/api/print/customer/{completed_order_id}",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "order_id" in data
        assert "order_number" in data
        assert "commands" in data
        
        # Verify commands is valid base64
        try:
            decoded = base64.b64decode(data["commands"])
            assert len(decoded) > 0
            print(f"Customer receipt: {len(decoded)} bytes, order #{data['order_number']}")
        except Exception as e:
            pytest.fail(f"Commands is not valid base64: {e}")
    
    def test_print_customer_receipt_pending_order_fails(self, api_client, staff_token):
        """Customer receipt for pending (not completed) order should fail"""
        # Create a pending order
        response = api_client.get(
            f"{BASE_URL}/api/products",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        products = response.json()
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
        
        response = api_client.post(
            f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {staff_token}"},
            json=order_data
        )
        pending_order_id = response.json()["id"]
        
        # Try to print customer receipt for pending order
        response = api_client.post(
            f"{BASE_URL}/api/print/customer/{pending_order_id}",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        assert response.status_code == 400, f"Expected 400 for pending order, got {response.status_code}"
        assert "completed" in response.json().get("detail", "").lower()


class TestPrinterAPIStructure:
    """Tests for printerAPI methods in frontend api.js"""
    
    def test_printers_list_endpoint(self, api_client, restaurant_admin_token):
        """GET /api/printers returns list of printers"""
        response = api_client.get(
            f"{BASE_URL}/api/printers",
            headers={"Authorization": f"Bearer {restaurant_admin_token}"}
        )
        assert response.status_code == 200
        printers = response.json()
        assert isinstance(printers, list)
        
        if printers:
            printer = printers[0]
            assert "id" in printer
            assert "name" in printer
            assert "type" in printer
            assert "address" in printer
            assert "is_default" in printer
            assert "paper_width" in printer
            print(f"Found {len(printers)} printer(s)")
            for p in printers:
                print(f"  - {p['name']} ({p['type']}) at {p['address']} {'[DEFAULT]' if p['is_default'] else ''}")


class TestFrontendIntegration:
    """Verify frontend code structure for print pipeline"""
    
    def test_printer_service_file_exists(self):
        """Verify printer.js service file exists"""
        import os
        printer_js_path = "/app/frontend/src/services/printer.js"
        assert os.path.exists(printer_js_path), f"printer.js not found at {printer_js_path}"
        
        with open(printer_js_path, 'r') as f:
            content = f.read()
        
        # Check for key methods
        assert "printToDevice" in content, "printToDevice method missing"
        assert "_printWifi" in content, "_printWifi method missing"
        assert "_printBluetooth" in content, "_printBluetooth method missing"
        assert "/api/printer/send" in content, "WiFi proxy endpoint missing"
        print("printer.js contains all required methods")
    
    def test_api_service_printer_methods(self):
        """Verify api.js has printerAPI methods"""
        import os
        api_js_path = "/app/frontend/src/services/api.js"
        assert os.path.exists(api_js_path), f"api.js not found at {api_js_path}"
        
        with open(api_js_path, 'r') as f:
            content = f.read()
        
        # Check for printerAPI methods
        assert "printerAPI" in content, "printerAPI object missing"
        assert "getDefault" in content, "getDefault method missing"
        assert "sendToWifi" in content, "sendToWifi method missing"
        assert "printKitchenReceipt" in content, "printKitchenReceipt method missing"
        assert "printCustomerReceipt" in content, "printCustomerReceipt method missing"
        print("api.js contains all required printerAPI methods")
    
    def test_pos_screen_send_to_printer(self):
        """Verify POSScreen.js has sendToPrinter helper"""
        import os
        pos_screen_path = "/app/frontend/src/pages/POSScreen.js"
        assert os.path.exists(pos_screen_path), f"POSScreen.js not found"
        
        with open(pos_screen_path, 'r') as f:
            content = f.read()
        
        # Check for sendToPrinter helper
        assert "sendToPrinter" in content, "sendToPrinter helper missing"
        assert "printerAPI.getDefault" in content, "getDefault call missing"
        assert "printerService.printToDevice" in content, "printToDevice call missing"
        assert "printKitchenReceipt" in content, "Kitchen receipt print missing"
        assert "printCustomerReceipt" in content, "Customer receipt print missing"
        print("POSScreen.js has complete print pipeline integration")
    
    def test_printer_settings_test_handler(self):
        """Verify PrinterSettings.js handleTest shows proper status"""
        import os
        settings_path = "/app/frontend/src/pages/PrinterSettings.js"
        assert os.path.exists(settings_path), f"PrinterSettings.js not found"
        
        with open(settings_path, 'r') as f:
            content = f.read()
        
        # Check for proper test result handling
        assert "result.sent" in content, "sent field check missing"
        assert "result.send_error" in content or "send_error" in content, "send_error handling missing"
        assert "printSuccess" in content, "printSuccess state missing"
        print("PrinterSettings.js properly handles test print status")
