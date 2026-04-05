"""
Test suite for HevaPOS refactored backend (iteration 11)
Tests all API endpoints after the monolithic server.py was split into 15 router files.
All endpoint paths remain identical - just organized into separate modules.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://revenue-dash-33.preview.emergentagent.com"


class TestHealthAndRoot:
    """Test health and root endpoints"""
    
    def test_root_endpoint(self):
        """GET /api/ should return Hello World"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data.get("message") == "Hello World"
        print("✓ Root endpoint working")


class TestAuthentication:
    """Test authentication endpoints - login for all 3 user types"""
    
    def test_platform_owner_login(self):
        """Login as platform_owner should return token and role=platform_owner"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data.get("role") == "platform_owner", f"Expected role=platform_owner, got {data.get('role')}"
        assert data.get("username") == "platform_owner"
        print(f"✓ Platform owner login successful - role: {data.get('role')}")
        return data.get("access_token")
    
    def test_restaurant_admin_login(self):
        """Login as restaurant_admin should return token and role=admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data.get("role") == "admin", f"Expected role=admin, got {data.get('role')}"
        assert data.get("username") == "restaurant_admin"
        assert data.get("restaurant_id") is not None, "restaurant_id should not be None for admin"
        print(f"✓ Restaurant admin login successful - role: {data.get('role')}, restaurant_id: {data.get('restaurant_id')}")
        return data.get("access_token")
    
    def test_staff_user_login(self):
        """Login as staff user should return token and role=user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "user",
            "password": "user123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data.get("role") == "user", f"Expected role=user, got {data.get('role')}"
        assert data.get("username") == "user"
        print(f"✓ Staff user login successful - role: {data.get('role')}")
        return data.get("access_token")
    
    def test_invalid_login(self):
        """Invalid credentials should return 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "invalid_user",
            "password": "wrong_password"
        })
        assert response.status_code == 401
        print("✓ Invalid login correctly returns 401")


class TestMenuEndpoints:
    """Test categories and products endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_categories(self):
        """GET /api/categories should return list of categories"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should have at least one category"
        # Verify category structure
        cat = data[0]
        assert "id" in cat
        assert "name" in cat
        print(f"✓ GET /api/categories returned {len(data)} categories")
    
    def test_get_products(self):
        """GET /api/products should return list of products"""
        response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should have at least one product"
        # Verify product structure
        prod = data[0]
        assert "id" in prod
        assert "name" in prod
        assert "price" in prod
        print(f"✓ GET /api/products returned {len(data)} products")


class TestOrderEndpoints:
    """Test order-related endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_pending_orders(self):
        """GET /api/orders/pending should return pending orders"""
        response = requests.get(f"{BASE_URL}/api/orders/pending", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/orders/pending returned {len(data)} pending orders")


class TestReportEndpoints:
    """Test report-related endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_today_stats(self):
        """GET /api/reports/today should return today's stats"""
        response = requests.get(f"{BASE_URL}/api/reports/today", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "total_sales" in data
        assert "total_orders" in data
        assert "cash_total" in data
        assert "card_total" in data
        print(f"✓ GET /api/reports/today - total_sales: {data.get('total_sales')}, orders: {data.get('total_orders')}")


class TestPrinterEndpoints:
    """Test printer-related endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_printers(self):
        """GET /api/printers should return printers list"""
        response = requests.get(f"{BASE_URL}/api/printers", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/printers returned {len(data)} printers")
    
    def test_discover_printers(self):
        """POST /api/printers/discover should scan for printers"""
        response = requests.post(f"{BASE_URL}/api/printers/discover", 
            headers=self.headers,
            json={
                "subnet": "192.168.1",
                "ports": [9100],
                "timeout_ms": 100
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "devices" in data
        assert "scanned_subnet" in data
        print(f"✓ POST /api/printers/discover - scanned {data.get('scanned_subnet')}, found {len(data.get('devices', []))} devices")


class TestStaffEndpoints:
    """Test staff management endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_staff_list(self):
        """GET /api/restaurant/staff should return staff list (admin only)"""
        response = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # Verify password is not exposed
        if len(data) > 0:
            assert "password" not in data[0], "Password should not be in response"
            assert "password_hash" not in data[0], "Password hash should not be in response"
        print(f"✓ GET /api/restaurant/staff returned {len(data)} staff members")


class TestRestaurantEndpoints:
    """Test restaurant-related endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_my_restaurant(self):
        """GET /api/restaurants/my should return restaurant info"""
        response = requests.get(f"{BASE_URL}/api/restaurants/my", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert "business_info" in data
        print(f"✓ GET /api/restaurants/my - restaurant: {data.get('business_info', {}).get('name', 'Unknown')}")


class TestTableEndpoints:
    """Test table management endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_tables(self):
        """GET /api/tables should return tables list"""
        response = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/tables returned {len(data)} tables")


class TestReservationEndpoints:
    """Test reservation endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_reservations(self):
        """GET /api/reservations should return reservations list"""
        response = requests.get(f"{BASE_URL}/api/reservations", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/reservations returned {len(data)} reservations")


class TestPlatformOwnerEndpoints:
    """Test platform owner specific endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get platform owner auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "admin123"
        })
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_subscriptions(self):
        """GET /api/subscriptions should return subscriptions (platform_owner only)"""
        response = requests.get(f"{BASE_URL}/api/subscriptions", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/subscriptions returned {len(data)} subscriptions")
    
    def test_get_notifications(self):
        """GET /api/notifications should return notifications (platform_owner only)"""
        response = requests.get(f"{BASE_URL}/api/notifications", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/notifications returned {len(data)} notifications")
    
    def test_subscriptions_forbidden_for_non_platform_owner(self):
        """GET /api/subscriptions should return 403 for non-platform_owner"""
        # Login as restaurant_admin
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        admin_token = response.json().get("access_token")
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/subscriptions", headers=admin_headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ GET /api/subscriptions correctly returns 403 for non-platform_owner")


class TestEmailEndpoints:
    """Test email endpoints - should gracefully skip when RESEND_API_KEY not configured"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get platform owner auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "admin123"
        })
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_email_send_graceful_skip(self):
        """POST /api/email/send should gracefully return 'skipped' when RESEND_API_KEY not configured"""
        response = requests.post(f"{BASE_URL}/api/email/send", 
            headers=self.headers,
            json={
                "recipient_email": "test@example.com",
                "subject": "Test Email",
                "html_content": "<p>Test content</p>"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        # Should return 'skipped' status when API key not configured
        assert data.get("status") == "skipped", f"Expected status='skipped', got {data.get('status')}"
        assert "not configured" in data.get("message", "").lower() or "skipped" in str(data).lower()
        print(f"✓ POST /api/email/send gracefully skipped - status: {data.get('status')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
