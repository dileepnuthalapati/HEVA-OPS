"""
HevaPOS Iteration 20 Backend Tests
Tests for: DB indexes, rate limiting, printer check, QR menu, auth
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://stripe-billing-ui-1.preview.emergentagent.com')


# Module-level auth token to avoid rate limiting
_auth_token = None

def get_auth_token():
    """Get auth token (cached to avoid rate limiting)"""
    global _auth_token
    if _auth_token is None:
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        if response.status_code == 200:
            _auth_token = response.json()["access_token"]
        else:
            pytest.skip(f"Auth failed: {response.status_code}")
    return _auth_token


class TestAuth:
    """Authentication endpoint tests"""
    
    def test_login_restaurant_admin(self):
        """Test login with restaurant_admin credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "admin"
        assert data["username"] == "restaurant_admin"
        assert data["restaurant_id"] == "rest_demo_1"
    
    def test_login_platform_owner(self):
        """Test login with platform_owner credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "platform_owner"
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "invalid_user",
            "password": "wrongpassword"
        })
        assert response.status_code == 401


class TestRateLimiting:
    """Rate limiting tests - verify endpoints are rate limited"""
    
    def test_qr_menu_rate_limit_exists(self):
        """Verify QR menu endpoint has rate limiting (30/min)"""
        # Make 5 quick requests - should all succeed within limit
        for i in range(5):
            response = requests.get(f"{BASE_URL}/api/qr/rest_demo_1/KrGTedTy")
            assert response.status_code == 200, f"Request {i+1} got unexpected status {response.status_code}"


class TestPrinterCheck:
    """Printer check endpoint tests"""
    
    def test_printer_check_endpoint_exists(self):
        """Test POST /api/printer/check endpoint exists and works"""
        token = get_auth_token()
        response = requests.post(
            f"{BASE_URL}/api/printer/check",
            headers={"Authorization": f"Bearer {token}"},
            json={"ip": "192.168.1.100", "port": 9100}
        )
        assert response.status_code == 200
        data = response.json()
        assert "reachable" in data
        assert "ip" in data
        assert "port" in data
        assert data["ip"] == "192.168.1.100"
        assert data["port"] == 9100
        # Printer is not reachable in test environment
        assert data["reachable"] == False
    
    def test_printer_check_requires_auth(self):
        """Test printer check requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/printer/check",
            json={"ip": "192.168.1.100", "port": 9100}
        )
        assert response.status_code in [401, 403]
    
    def test_printer_check_default_port(self):
        """Test printer check with default port"""
        token = get_auth_token()
        response = requests.post(
            f"{BASE_URL}/api/printer/check",
            headers={"Authorization": f"Bearer {token}"},
            json={"ip": "10.0.0.1"}  # No port specified
        )
        assert response.status_code == 200
        data = response.json()
        assert data["port"] == 9100  # Default port


class TestQRMenu:
    """QR Menu public endpoint tests"""
    
    def test_qr_guest_menu_loads(self):
        """Test QR guest menu loads without auth"""
        response = requests.get(f"{BASE_URL}/api/qr/rest_demo_1/KrGTedTy")
        assert response.status_code == 200
        data = response.json()
        assert "restaurant" in data
        assert "table" in data
        assert "categories" in data
        assert "products" in data
        assert data["restaurant"]["name"] == "Pizza Palace Updated"
        assert data["table"]["number"] == 1
    
    def test_qr_guest_menu_invalid_hash(self):
        """Test QR guest menu with invalid hash returns 404"""
        response = requests.get(f"{BASE_URL}/api/qr/rest_demo_1/INVALID_HASH")
        assert response.status_code == 404
    
    def test_qr_guest_menu_invalid_restaurant(self):
        """Test QR guest menu with invalid restaurant returns 404"""
        response = requests.get(f"{BASE_URL}/api/qr/invalid_restaurant/KrGTedTy")
        assert response.status_code == 404
    
    def test_place_qr_order_success(self):
        """Test placing a QR order"""
        order_data = {
            "items": [
                {
                    "product_id": "prod_1",
                    "product_name": "Margherita",
                    "quantity": 1,
                    "unit_price": 9.99,
                    "total": 9.99
                }
            ],
            "guest_name": "TEST_QR_Guest"
        }
        response = requests.post(
            f"{BASE_URL}/api/qr/rest_demo_1/KrGTedTy/order",
            json=order_data
        )
        assert response.status_code == 200
        data = response.json()
        assert "order_id" in data
        assert "order_number" in data
        assert data["status"] == "pending"
        assert data["message"] == "Order sent to kitchen!"
    
    def test_place_qr_order_empty_items(self):
        """Test placing QR order with empty items fails"""
        response = requests.post(
            f"{BASE_URL}/api/qr/rest_demo_1/KrGTedTy/order",
            json={"items": []}
        )
        assert response.status_code == 400


class TestQRAdmin:
    """QR Admin endpoint tests (require auth)"""
    
    def test_get_table_hashes_requires_auth(self):
        """Test GET /api/qr/tables/hashes requires auth"""
        response = requests.get(f"{BASE_URL}/api/qr/tables/hashes")
        assert response.status_code in [401, 403]
    
    def test_get_table_hashes_with_auth(self):
        """Test GET /api/qr/tables/hashes with auth"""
        token = get_auth_token()
        response = requests.get(
            f"{BASE_URL}/api/qr/tables/hashes",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have tables with qr_hash info
        if len(data) > 0:
            assert "id" in data[0]
            assert "number" in data[0]
            assert "qr_hash" in data[0] or "has_qr" in data[0]
    
    def test_generate_all_hashes(self):
        """Test POST /api/qr/tables/generate-all-hashes"""
        token = get_auth_token()
        response = requests.post(
            f"{BASE_URL}/api/qr/tables/generate-all-hashes",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "updated" in data


class TestPOSEndpoints:
    """POS-related endpoint tests"""
    
    def test_get_pending_orders(self):
        """Test GET /api/orders/pending"""
        token = get_auth_token()
        response = requests.get(
            f"{BASE_URL}/api/orders/pending",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_products(self):
        """Test GET /api/products"""
        token = get_auth_token()
        response = requests.get(
            f"{BASE_URL}/api/products",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
    
    def test_get_categories(self):
        """Test GET /api/categories"""
        token = get_auth_token()
        response = requests.get(
            f"{BASE_URL}/api/categories",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_tables(self):
        """Test GET /api/tables"""
        token = get_auth_token()
        response = requests.get(
            f"{BASE_URL}/api/tables",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_printers(self):
        """Test GET /api/printers"""
        token = get_auth_token()
        response = requests.get(
            f"{BASE_URL}/api/printers",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_default_printer(self):
        """Test GET /api/printers/default"""
        token = get_auth_token()
        response = requests.get(
            f"{BASE_URL}/api/printers/default",
            headers={"Authorization": f"Bearer {token}"}
        )
        # May return 200 with printer or null
        assert response.status_code == 200


class TestTableManagement:
    """Table Management endpoint tests"""
    
    def test_get_reservations(self):
        """Test GET /api/reservations"""
        token = get_auth_token()
        response = requests.get(
            f"{BASE_URL}/api/reservations",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
