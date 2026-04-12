"""
Iteration 38: Testing new UX improvements
1. POST /api/attendance/clock-me - JWT auth clock in/out (no PIN needed)
2. Geofence enforcement on clock-me endpoint
3. Original PIN-based clock endpoint still works
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
SKADMIN_USERNAME = "SKAdmin"
SKADMIN_PASSWORD = "saswata@123"
STAFF_USERNAME = "user"
STAFF_PASSWORD = "user123"
STAFF_PIN = "1111"
RESTAURANT_ID = "rest_demo_1"

# Business location (from context: lat=51.5074, lng=-0.1278)
BUSINESS_LAT = 51.5074
BUSINESS_LNG = -0.1278

# Near business location (within 10m)
NEAR_LAT = 51.5074
NEAR_LNG = -0.1278

# Far location (should be rejected)
FAR_LAT = 0.0
FAR_LNG = 0.0


@pytest.fixture(scope="module")
def staff_token():
    """Get JWT token for staff user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": STAFF_USERNAME,
        "password": STAFF_PASSWORD
    })
    assert response.status_code == 200, f"Staff login failed: {response.text}"
    data = response.json()
    assert "access_token" in data, f"No access_token in response: {data}"
    return data["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    """Get JWT token for admin user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": SKADMIN_USERNAME,
        "password": SKADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    data = response.json()
    assert "access_token" in data, f"No access_token in response: {data}"
    return data["access_token"]


class TestClockMeEndpoint:
    """Tests for POST /api/attendance/clock-me (JWT auth, no PIN)"""
    
    def test_clock_me_without_auth_returns_401_or_403(self):
        """Clock-me without JWT should return 401 or 403 (Not authenticated)"""
        response = requests.post(f"{BASE_URL}/api/attendance/clock-me", json={
            "latitude": NEAR_LAT,
            "longitude": NEAR_LNG
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}: {response.text}"
        print(f"Unauthenticated request returned: {response.status_code}")
    
    def test_clock_me_with_jwt_and_near_location_succeeds(self, staff_token):
        """Clock-me with valid JWT and near location should succeed"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.post(f"{BASE_URL}/api/attendance/clock-me", json={
            "latitude": NEAR_LAT,
            "longitude": NEAR_LNG
        }, headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "action" in data, f"No action in response: {data}"
        assert data["action"] in ["clock_in", "clock_out"], f"Invalid action: {data['action']}"
        assert "staff_name" in data, f"No staff_name in response: {data}"
        assert "message" in data, f"No message in response: {data}"
        print(f"Clock-me action: {data['action']}, message: {data['message']}")
    
    def test_clock_me_with_far_location_returns_403(self, staff_token):
        """Clock-me with far coordinates should return 403 geofence error"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.post(f"{BASE_URL}/api/attendance/clock-me", json={
            "latitude": FAR_LAT,
            "longitude": FAR_LNG
        }, headers=headers)
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data, f"No detail in response: {data}"
        assert "away" in data["detail"].lower() or "within" in data["detail"].lower(), \
            f"Expected geofence error message, got: {data['detail']}"
        print(f"Geofence rejection message: {data['detail']}")
    
    def test_clock_me_without_location_returns_400(self, staff_token):
        """Clock-me without location when business has geofence should return 400"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.post(f"{BASE_URL}/api/attendance/clock-me", json={}, headers=headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data, f"No detail in response: {data}"
        assert "location" in data["detail"].lower() or "gps" in data["detail"].lower(), \
            f"Expected location required message, got: {data['detail']}"
        print(f"Location required message: {data['detail']}")


class TestOriginalPinClockEndpoint:
    """Tests for POST /api/attendance/clock (PIN-based, for terminal mode)"""
    
    def test_pin_clock_still_works_for_terminal(self):
        """Original PIN-based clock should still work for pos_terminal"""
        response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": STAFF_PIN,
            "restaurant_id": RESTAURANT_ID,
            "entry_source": "pos_terminal"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "action" in data, f"No action in response: {data}"
        assert data["action"] in ["clock_in", "clock_out"], f"Invalid action: {data['action']}"
        print(f"PIN clock action: {data['action']}, message: {data.get('message', '')}")
    
    def test_pin_clock_mobile_without_location_returns_400(self):
        """PIN clock for mobile_app without location should return 400"""
        response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": STAFF_PIN,
            "restaurant_id": RESTAURANT_ID,
            "entry_source": "mobile_app"
        })
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data, f"No detail in response: {data}"
        print(f"Mobile without location message: {data['detail']}")
    
    def test_pin_clock_mobile_with_far_location_returns_403(self):
        """PIN clock for mobile_app with far location should return 403"""
        response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": STAFF_PIN,
            "restaurant_id": RESTAURANT_ID,
            "latitude": FAR_LAT,
            "longitude": FAR_LNG,
            "entry_source": "mobile_app"
        })
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data, f"No detail in response: {data}"
        assert "away" in data["detail"].lower(), f"Expected distance message, got: {data['detail']}"
        print(f"Mobile far location message: {data['detail']}")


class TestMyStatusEndpoint:
    """Tests for GET /api/attendance/my-status"""
    
    def test_my_status_returns_clock_state(self, staff_token):
        """My-status should return current clock state"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.get(f"{BASE_URL}/api/attendance/my-status", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "clocked_in" in data, f"No clocked_in in response: {data}"
        assert isinstance(data["clocked_in"], bool), f"clocked_in should be bool: {data}"
        print(f"My status: clocked_in={data['clocked_in']}")


class TestClockMeToggle:
    """Test clock-me toggles between clock_in and clock_out"""
    
    def test_clock_me_toggles_state(self, staff_token):
        """Clock-me should toggle between clock_in and clock_out"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        
        # First call
        response1 = requests.post(f"{BASE_URL}/api/attendance/clock-me", json={
            "latitude": NEAR_LAT,
            "longitude": NEAR_LNG
        }, headers=headers)
        assert response1.status_code == 200, f"First clock-me failed: {response1.text}"
        action1 = response1.json()["action"]
        
        # Second call should toggle
        response2 = requests.post(f"{BASE_URL}/api/attendance/clock-me", json={
            "latitude": NEAR_LAT,
            "longitude": NEAR_LNG
        }, headers=headers)
        assert response2.status_code == 200, f"Second clock-me failed: {response2.text}"
        action2 = response2.json()["action"]
        
        # Actions should be different (toggle)
        assert action1 != action2, f"Expected toggle, got same action: {action1} -> {action2}"
        print(f"Clock-me toggle: {action1} -> {action2}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
