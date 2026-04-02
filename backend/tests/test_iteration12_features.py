"""
Test suite for HevaPOS iteration 12 features:
1. Printer subnet auto-detection (GET /api/printers/detect-subnet)
2. Email integration endpoints (status, welcome, trial-reminder, payment-reminder)

Email API key is NOT configured, so all email sends should return status='skipped' gracefully.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://stripe-billing-ui-1.preview.emergentagent.com"


class TestPrinterSubnetDetection:
    """Test printer subnet auto-detection feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_detect_subnet_returns_valid_response(self):
        """GET /api/printers/detect-subnet should return auto-detected subnet"""
        response = requests.get(f"{BASE_URL}/api/printers/detect-subnet", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "subnets" in data, "Response should contain 'subnets' field"
        assert "primary" in data, "Response should contain 'primary' field"
        assert isinstance(data["subnets"], list), "subnets should be a list"
        assert len(data["subnets"]) > 0, "Should have at least one subnet"
        
        # Verify subnet format (should be like "192.168.1" or "10.0.0")
        primary = data["primary"]
        parts = primary.split(".")
        assert len(parts) == 3, f"Subnet should have 3 parts (e.g., 192.168.1), got: {primary}"
        
        print(f"✓ GET /api/printers/detect-subnet - primary: {primary}, all subnets: {data['subnets']}")
    
    def test_discover_printers_with_detected_subnet(self):
        """POST /api/printers/discover should work with auto-detected subnet"""
        # First get the detected subnet
        detect_response = requests.get(f"{BASE_URL}/api/printers/detect-subnet", headers=self.headers)
        assert detect_response.status_code == 200
        detected_subnet = detect_response.json().get("primary")
        
        # Now use it for discovery
        response = requests.post(f"{BASE_URL}/api/printers/discover", 
            headers=self.headers,
            json={
                "subnet": detected_subnet,
                "ports": [9100],
                "timeout_ms": 100
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "devices" in data, "Response should contain 'devices'"
        assert "scanned_subnet" in data, "Response should contain 'scanned_subnet'"
        assert data["scanned_subnet"] == detected_subnet, f"Scanned subnet should match detected: {detected_subnet}"
        
        print(f"✓ POST /api/printers/discover with detected subnet {detected_subnet} - found {len(data.get('devices', []))} devices")


class TestEmailStatus:
    """Test email status endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get platform owner auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_email_status_returns_not_configured(self):
        """GET /api/email/status should return configured=false when no API key"""
        response = requests.get(f"{BASE_URL}/api/email/status", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "configured" in data, "Response should contain 'configured' field"
        assert data["configured"] == False, f"Expected configured=false, got {data['configured']}"
        assert "message" in data, "Response should contain 'message' field"
        
        print(f"✓ GET /api/email/status - configured: {data['configured']}, message: {data['message'][:50]}...")
    
    def test_email_status_requires_platform_owner(self):
        """GET /api/email/status should require platform_owner role"""
        # Login as restaurant_admin
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        admin_token = response.json().get("access_token")
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/email/status", headers=admin_headers)
        assert response.status_code == 403, f"Expected 403 for non-platform_owner, got {response.status_code}"
        print("✓ GET /api/email/status correctly returns 403 for non-platform_owner")


class TestEmailWelcome:
    """Test welcome email endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get platform owner auth token and restaurant ID"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Get restaurant ID from subscriptions
        subs_response = requests.get(f"{BASE_URL}/api/subscriptions", headers=self.headers)
        if subs_response.status_code == 200 and len(subs_response.json()) > 0:
            self.restaurant_id = subs_response.json()[0].get("id")
        else:
            self.restaurant_id = "rest_demo_1"  # fallback
    
    def test_welcome_email_returns_skipped(self):
        """POST /api/email/welcome/{restaurant_id} should return 'skipped' status gracefully"""
        response = requests.post(f"{BASE_URL}/api/email/welcome/{self.restaurant_id}", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "status" in data, "Response should contain 'status' field"
        assert data["status"] == "skipped", f"Expected status='skipped', got {data['status']}"
        assert "message" in data, "Response should contain 'message' field"
        
        print(f"✓ POST /api/email/welcome/{self.restaurant_id} - status: {data['status']}")
    
    def test_welcome_email_invalid_restaurant(self):
        """POST /api/email/welcome/{invalid_id} should return 404"""
        response = requests.post(f"{BASE_URL}/api/email/welcome/invalid_restaurant_id", headers=self.headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ POST /api/email/welcome/invalid_id correctly returns 404")


class TestEmailTrialReminder:
    """Test trial reminder email endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get platform owner auth token and restaurant ID"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Get restaurant ID from subscriptions
        subs_response = requests.get(f"{BASE_URL}/api/subscriptions", headers=self.headers)
        if subs_response.status_code == 200 and len(subs_response.json()) > 0:
            self.restaurant_id = subs_response.json()[0].get("id")
        else:
            self.restaurant_id = "rest_demo_1"
    
    def test_trial_reminder_returns_skipped(self):
        """POST /api/email/trial-reminder/{restaurant_id} should return 'skipped' status gracefully"""
        response = requests.post(f"{BASE_URL}/api/email/trial-reminder/{self.restaurant_id}", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "status" in data, "Response should contain 'status' field"
        assert data["status"] == "skipped", f"Expected status='skipped', got {data['status']}"
        
        print(f"✓ POST /api/email/trial-reminder/{self.restaurant_id} - status: {data['status']}")
    
    def test_trial_reminder_invalid_restaurant(self):
        """POST /api/email/trial-reminder/{invalid_id} should return 404"""
        response = requests.post(f"{BASE_URL}/api/email/trial-reminder/invalid_restaurant_id", headers=self.headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ POST /api/email/trial-reminder/invalid_id correctly returns 404")


class TestEmailPaymentReminder:
    """Test payment reminder email endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get platform owner auth token and restaurant ID"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Get restaurant ID from subscriptions
        subs_response = requests.get(f"{BASE_URL}/api/subscriptions", headers=self.headers)
        if subs_response.status_code == 200 and len(subs_response.json()) > 0:
            self.restaurant_id = subs_response.json()[0].get("id")
        else:
            self.restaurant_id = "rest_demo_1"
    
    def test_payment_reminder_returns_skipped(self):
        """POST /api/email/payment-reminder/{restaurant_id} should return 'skipped' status gracefully"""
        response = requests.post(f"{BASE_URL}/api/email/payment-reminder/{self.restaurant_id}", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "status" in data, "Response should contain 'status' field"
        assert data["status"] == "skipped", f"Expected status='skipped', got {data['status']}"
        
        print(f"✓ POST /api/email/payment-reminder/{self.restaurant_id} - status: {data['status']}")
    
    def test_payment_reminder_invalid_restaurant(self):
        """POST /api/email/payment-reminder/{invalid_id} should return 404"""
        response = requests.post(f"{BASE_URL}/api/email/payment-reminder/invalid_restaurant_id", headers=self.headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ POST /api/email/payment-reminder/invalid_id correctly returns 404")


class TestLoginFlows:
    """Test login flows for all user types"""
    
    def test_platform_owner_login(self):
        """Login as platform_owner should return token and role=platform_owner"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data.get("role") == "platform_owner"
        print(f"✓ Platform owner login - role: {data.get('role')}")
    
    def test_restaurant_admin_login(self):
        """Login as restaurant_admin should return token and role=admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data.get("role") == "admin"
        assert data.get("restaurant_id") is not None
        print(f"✓ Restaurant admin login - role: {data.get('role')}, restaurant_id: {data.get('restaurant_id')}")
    
    def test_staff_user_login(self):
        """Login as staff user should return token and role=user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "user",
            "password": "user123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data.get("role") == "user"
        print(f"✓ Staff user login - role: {data.get('role')}")


class TestPOSAccess:
    """Test POS access after login"""
    
    def test_staff_can_access_products(self):
        """Staff user should be able to access products for POS"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "user",
            "password": "user123"
        })
        token = response.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get products
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Should have products for POS"
        print(f"✓ Staff can access {len(data)} products for POS")
    
    def test_staff_can_access_categories(self):
        """Staff user should be able to access categories for POS"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "user",
            "password": "user123"
        })
        token = response.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get categories
        response = requests.get(f"{BASE_URL}/api/categories", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Staff can access {len(data)} categories for POS")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
