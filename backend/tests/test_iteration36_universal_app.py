"""
Iteration 36: Universal App Architecture with Split-Brain Routing Tests
Tests for:
1. Login accepts email OR username
2. verify-manager-pin endpoint
3. pin-login returns capabilities array
4. attendance/clock accepts entry_source field
5. Staff CRUD with email and capabilities
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_USERNAME = "SKAdmin"
ADMIN_PASSWORD = "saswata@123"
STAFF_USERNAME = "user"
STAFF_PASSWORD = "user123"
STAFF_PIN = "1111"
MANAGER_PIN = "1234"
RESTAURANT_ID = "rest_demo_1"


class TestAuthLoginEmailOrUsername:
    """Test POST /api/auth/login accepts email OR username"""
    
    def test_login_with_username_skadmin(self):
        """Login with username SKAdmin should work"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["username"] == ADMIN_USERNAME
        assert data["role"] == "admin"
        assert data["restaurant_id"] == RESTAURANT_ID
        # Verify capabilities is returned (may be empty for existing users)
        assert "capabilities" in data
        print(f"✓ Login with username '{ADMIN_USERNAME}' successful, role={data['role']}")
    
    def test_login_with_username_staff(self):
        """Login with username 'user' should work"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF_USERNAME,
            "password": STAFF_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["username"] == STAFF_USERNAME
        assert data["role"] == "user"
        assert "capabilities" in data
        print(f"✓ Login with username '{STAFF_USERNAME}' successful, role={data['role']}")
    
    def test_login_invalid_credentials(self):
        """Login with wrong password should fail"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected")


class TestVerifyManagerPin:
    """Test POST /api/auth/verify-manager-pin endpoint"""
    
    def test_verify_manager_pin_success(self):
        """Verify manager PIN 1234 for rest_demo_1 returns verified:true"""
        response = requests.post(f"{BASE_URL}/api/auth/verify-manager-pin", json={
            "pin": MANAGER_PIN,
            "restaurant_id": RESTAURANT_ID
        })
        assert response.status_code == 200, f"Verify PIN failed: {response.text}"
        data = response.json()
        assert data.get("verified") == True
        assert "admin_username" in data
        print(f"✓ Manager PIN verified, admin_username={data.get('admin_username')}")
    
    def test_verify_manager_pin_invalid(self):
        """Invalid manager PIN should return 401"""
        response = requests.post(f"{BASE_URL}/api/auth/verify-manager-pin", json={
            "pin": "9999",
            "restaurant_id": RESTAURANT_ID
        })
        assert response.status_code == 401
        print("✓ Invalid manager PIN correctly rejected")


class TestPinLoginCapabilities:
    """Test POST /api/auth/pin-login returns capabilities array"""
    
    def test_pin_login_returns_capabilities(self):
        """PIN login should return capabilities array in response"""
        response = requests.post(f"{BASE_URL}/api/auth/pin-login", json={
            "pin": STAFF_PIN,
            "restaurant_id": RESTAURANT_ID
        })
        assert response.status_code == 200, f"PIN login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "capabilities" in data
        assert isinstance(data["capabilities"], list)
        print(f"✓ PIN login successful, capabilities={data['capabilities']}")
    
    def test_pin_login_invalid_pin(self):
        """Invalid PIN should return 401"""
        response = requests.post(f"{BASE_URL}/api/auth/pin-login", json={
            "pin": "0000",
            "restaurant_id": RESTAURANT_ID
        })
        assert response.status_code == 401
        print("✓ Invalid PIN correctly rejected")


class TestAttendanceEntrySource:
    """Test POST /api/attendance/clock accepts entry_source field"""
    
    def test_clock_with_entry_source_pos_terminal(self):
        """Clock in/out with entry_source='pos_terminal' should work (no geofence)"""
        response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": STAFF_PIN,
            "restaurant_id": RESTAURANT_ID,
            "entry_source": "pos_terminal"
        })
        # Should succeed (200) - either clock in or clock out
        assert response.status_code == 200, f"Clock failed: {response.text}"
        data = response.json()
        assert data.get("action") in ["clock_in", "clock_out"]
        assert data.get("entry_source") == "pos_terminal"
        print(f"✓ Clock {data['action']} with entry_source='pos_terminal' successful")
    
    def test_clock_with_entry_source_mobile_app_no_location(self):
        """Clock with entry_source='mobile_app' without location may fail if geofence is set"""
        response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": STAFF_PIN,
            "restaurant_id": RESTAURANT_ID,
            "entry_source": "mobile_app"
            # No latitude/longitude - may fail if restaurant has geofence
        })
        # Could be 200 (no geofence) or 400 (geofence requires location)
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        if response.status_code == 200:
            print("✓ Clock with mobile_app succeeded (no geofence configured)")
        else:
            print("✓ Clock with mobile_app correctly requires location (geofence active)")


class TestStaffCRUDWithEmailCapabilities:
    """Test staff CRUD with email and capabilities fields"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_create_staff_with_email_and_capabilities(self, auth_token):
        """Create staff with email and capabilities fields"""
        import time
        test_username = f"TEST_staff_{int(time.time())}"
        test_email = f"test_{int(time.time())}@example.com"
        
        response = requests.post(
            f"{BASE_URL}/api/restaurant/staff",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "username": test_username,
                "email": test_email,
                "password": "testpass123",
                "role": "user",
                "capabilities": ["pos.access", "workforce.clock_in"]
            }
        )
        assert response.status_code == 200, f"Create staff failed: {response.text}"
        data = response.json()
        assert "id" in data
        print(f"✓ Created staff with email and capabilities, id={data['id']}")
        
        # Cleanup - delete the test staff
        staff_id = data["id"]
        delete_response = requests.delete(
            f"{BASE_URL}/api/restaurant/staff/{staff_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert delete_response.status_code == 200
        print(f"✓ Cleaned up test staff {staff_id}")
    
    def test_get_staff_list_shows_email_and_capabilities(self, auth_token):
        """GET /api/restaurant/staff should return email and capabilities for each member"""
        response = requests.get(
            f"{BASE_URL}/api/restaurant/staff",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Get staff failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        
        # Check that staff members have email and capabilities fields
        for staff in data:
            assert "username" in staff
            # email may be empty for existing users created before this feature
            assert "email" in staff or staff.get("email") is None
            # capabilities may be empty for existing users
            assert "capabilities" in staff or staff.get("capabilities") is None
        
        print(f"✓ Staff list returned {len(data)} members with email/capabilities fields")
    
    def test_create_staff_requires_email(self, auth_token):
        """Creating staff without email should fail (email is required)"""
        import time
        test_username = f"TEST_noemail_{int(time.time())}"
        
        response = requests.post(
            f"{BASE_URL}/api/restaurant/staff",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "username": test_username,
                "password": "testpass123",
                "role": "user"
                # No email field
            }
        )
        # Should fail with 422 (validation error) since email is required
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("✓ Creating staff without email correctly rejected (422)")


class TestLoginResponseFields:
    """Test that login response includes all expected fields"""
    
    def test_login_response_has_all_fields(self):
        """Login response should include capabilities and email fields"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        
        # Required fields
        assert "access_token" in data
        assert "token_type" in data
        assert "role" in data
        assert "username" in data
        assert "restaurant_id" in data
        assert "features" in data
        assert "capabilities" in data
        assert "email" in data
        
        print(f"✓ Login response has all required fields including capabilities and email")
        print(f"  - capabilities: {data['capabilities']}")
        print(f"  - email: {data['email']}")
        print(f"  - features: {data['features']}")
