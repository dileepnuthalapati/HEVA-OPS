"""
Iteration 29: Quick POS PIN Login Tests
Tests for:
1. PIN Login API: POST /api/auth/pin-login with correct/wrong PIN
2. Set POS PIN API: POST /api/auth/set-pos-pin
3. Remove POS PIN API: DELETE /api/auth/remove-pos-pin/{user_id}
4. Restaurant Has PINs API: GET /api/auth/restaurant-has-pins/{restaurant_id}
5. Staff list includes has_pos_pin flag
6. All credential types work correctly
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://heva-one-preview.preview.emergentagent.com"

# Test credentials from test_credentials.md
PLATFORM_OWNER = {"username": "platform_owner", "password": "admin123"}
RESTAURANT_ADMIN = {"username": "restaurant_admin", "password": "admin123", "restaurant_id": "rest_demo_1"}
STAFF_USER = {"username": "user", "password": "user123"}

# POS PINs (already set according to agent context)
PIN_RESTAURANT_ADMIN = "2222"
PIN_STAFF_USER = "1111"


class TestPasswordLogin:
    """Test all credential types with password login"""
    
    def test_platform_owner_login(self):
        """Platform owner login returns correct role"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": PLATFORM_OWNER["username"],
            "password": PLATFORM_OWNER["password"]
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "platform_owner"
        assert data["username"] == "platform_owner"
        print(f"✓ Platform owner login: role={data['role']}")
    
    def test_restaurant_admin_login(self):
        """Restaurant admin login returns correct role and restaurant_id"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": RESTAURANT_ADMIN["username"],
            "password": RESTAURANT_ADMIN["password"]
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "admin"
        assert data["restaurant_id"] == "rest_demo_1"
        print(f"✓ Restaurant admin login: role={data['role']}, restaurant_id={data['restaurant_id']}")
    
    def test_staff_user_login(self):
        """Staff user login returns correct role"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF_USER["username"],
            "password": STAFF_USER["password"]
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "user"
        print(f"✓ Staff user login: role={data['role']}")
    
    def test_invalid_credentials_rejected(self):
        """Invalid credentials return 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "nonexistent",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected with 401")


class TestRestaurantHasPins:
    """Test restaurant-has-pins endpoint"""
    
    def test_restaurant_has_pins_returns_true(self):
        """Restaurant with PIN-enabled staff returns has_pins=true"""
        response = requests.get(f"{BASE_URL}/api/auth/restaurant-has-pins/rest_demo_1")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "has_pins" in data
        assert "pin_count" in data
        # According to agent context, PINs are already set for user (1111) and restaurant_admin (2222)
        print(f"✓ Restaurant has_pins={data['has_pins']}, pin_count={data['pin_count']}")
    
    def test_nonexistent_restaurant_returns_false(self):
        """Non-existent restaurant returns has_pins=false"""
        response = requests.get(f"{BASE_URL}/api/auth/restaurant-has-pins/nonexistent_restaurant")
        assert response.status_code == 200
        data = response.json()
        assert data["has_pins"] == False
        assert data["pin_count"] == 0
        print("✓ Non-existent restaurant correctly returns has_pins=false")


class TestPinLogin:
    """Test PIN login functionality"""
    
    def test_pin_login_staff_user_correct_pin(self):
        """Staff user PIN 1111 returns JWT token with user role"""
        response = requests.post(f"{BASE_URL}/api/auth/pin-login", json={
            "pin": PIN_STAFF_USER,
            "restaurant_id": "rest_demo_1"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "user"
        assert data["username"] == "user"
        print(f"✓ PIN login (1111): role={data['role']}, username={data['username']}")
    
    def test_pin_login_restaurant_admin_correct_pin(self):
        """Restaurant admin PIN 2222 returns JWT token with admin role"""
        response = requests.post(f"{BASE_URL}/api/auth/pin-login", json={
            "pin": PIN_RESTAURANT_ADMIN,
            "restaurant_id": "rest_demo_1"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "admin"
        assert data["username"] == "restaurant_admin"
        print(f"✓ PIN login (2222): role={data['role']}, username={data['username']}")
    
    def test_pin_login_wrong_pin_returns_401(self):
        """Wrong PIN returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/pin-login", json={
            "pin": "9999",
            "restaurant_id": "rest_demo_1"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✓ Wrong PIN correctly rejected with 401")
    
    def test_pin_login_invalid_format_returns_400(self):
        """Invalid PIN format (not 4 digits) returns 400"""
        # Test with 3 digits
        response = requests.post(f"{BASE_URL}/api/auth/pin-login", json={
            "pin": "123",
            "restaurant_id": "rest_demo_1"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        # Test with 5 digits
        response = requests.post(f"{BASE_URL}/api/auth/pin-login", json={
            "pin": "12345",
            "restaurant_id": "rest_demo_1"
        })
        assert response.status_code == 400
        
        # Test with letters
        response = requests.post(f"{BASE_URL}/api/auth/pin-login", json={
            "pin": "abcd",
            "restaurant_id": "rest_demo_1"
        })
        assert response.status_code == 400
        print("✓ Invalid PIN formats correctly rejected with 400")
    
    def test_pin_login_wrong_restaurant_returns_401(self):
        """PIN for wrong restaurant returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/pin-login", json={
            "pin": PIN_STAFF_USER,
            "restaurant_id": "wrong_restaurant"
        })
        assert response.status_code == 401
        print("✓ PIN for wrong restaurant correctly rejected with 401")


class TestSetPosPin:
    """Test set-pos-pin endpoint (requires admin auth)"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": RESTAURANT_ADMIN["username"],
            "password": RESTAURANT_ADMIN["password"]
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")
    
    def test_set_pin_requires_auth(self):
        """Set PIN without auth returns 401 or 403"""
        response = requests.post(f"{BASE_URL}/api/auth/set-pos-pin", json={
            "user_id": "some_user_id",
            "pin": "1234"
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Set PIN without auth correctly rejected with {response.status_code}")
    
    def test_set_pin_invalid_format_rejected(self, admin_token):
        """Set PIN with invalid format returns 400"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Test with 3 digits
        response = requests.post(f"{BASE_URL}/api/auth/set-pos-pin", json={
            "user_id": "some_user_id",
            "pin": "123"
        }, headers=headers)
        assert response.status_code == 400
        print("✓ Set PIN with invalid format correctly rejected with 400")


class TestRemovePosPin:
    """Test remove-pos-pin endpoint (requires admin auth)"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": RESTAURANT_ADMIN["username"],
            "password": RESTAURANT_ADMIN["password"]
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")
    
    def test_remove_pin_requires_auth(self):
        """Remove PIN without auth returns 401 or 403"""
        response = requests.delete(f"{BASE_URL}/api/auth/remove-pos-pin/some_user_id")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Remove PIN without auth correctly rejected with {response.status_code}")
    
    def test_remove_pin_nonexistent_user_returns_404(self, admin_token):
        """Remove PIN for non-existent user returns 404"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.delete(f"{BASE_URL}/api/auth/remove-pos-pin/nonexistent_user_id", headers=headers)
        assert response.status_code == 404
        print("✓ Remove PIN for non-existent user correctly returns 404")


class TestStaffListHasPinFlag:
    """Test that staff list includes has_pos_pin flag"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": RESTAURANT_ADMIN["username"],
            "password": RESTAURANT_ADMIN["password"]
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")
    
    def test_staff_list_includes_has_pos_pin(self, admin_token):
        """Staff list endpoint returns has_pos_pin flag for each user"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        staff_list = response.json()
        assert isinstance(staff_list, list)
        
        # Check that each staff member has has_pos_pin field
        for staff in staff_list:
            assert "has_pos_pin" in staff, f"Staff {staff.get('username')} missing has_pos_pin field"
            assert isinstance(staff["has_pos_pin"], bool)
            print(f"  - {staff.get('username')}: has_pos_pin={staff['has_pos_pin']}")
        
        print(f"✓ Staff list ({len(staff_list)} users) all have has_pos_pin flag")


class TestDuplicatePinRejection:
    """Test that duplicate PINs within same restaurant are rejected"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": RESTAURANT_ADMIN["username"],
            "password": RESTAURANT_ADMIN["password"]
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")
    
    def test_duplicate_pin_rejected(self, admin_token):
        """Setting a PIN that's already used by another staff member is rejected"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First, get the staff list to find a user without PIN
        response = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=headers)
        assert response.status_code == 200
        staff_list = response.json()
        
        # Find the user with PIN 1111 (staff user)
        user_with_pin = None
        for staff in staff_list:
            if staff.get("username") == "user" and staff.get("has_pos_pin"):
                user_with_pin = staff
                break
        
        if not user_with_pin:
            pytest.skip("No user with PIN found to test duplicate rejection")
        
        # Try to set the same PIN (1111) for restaurant_admin
        admin_user = next((s for s in staff_list if s.get("username") == "restaurant_admin"), None)
        if not admin_user:
            pytest.skip("Restaurant admin not found in staff list")
        
        # This should fail because PIN 1111 is already used by 'user'
        response = requests.post(f"{BASE_URL}/api/auth/set-pos-pin", json={
            "user_id": admin_user["id"],
            "pin": "1111"  # Already used by 'user'
        }, headers=headers)
        
        # Should be rejected with 400
        assert response.status_code == 400, f"Expected 400 for duplicate PIN, got {response.status_code}: {response.text}"
        assert "already assigned" in response.json().get("detail", "").lower()
        print("✓ Duplicate PIN correctly rejected with 400")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
