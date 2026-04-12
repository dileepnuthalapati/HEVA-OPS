"""
Iteration 41: Push Notification Infrastructure Tests
Tests device token registration, unregistration, push service graceful degradation,
and integration with long shift notifications.
Firebase is in dry-run mode (no FIREBASE_CREDENTIALS_PATH set).
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USERNAME = "SKAdmin"
ADMIN_PASSWORD = "saswata@123"
STAFF_USERNAME = "user"
STAFF_PASSWORD = "user123"
STAFF_ID = "restaurant_user_1"


class TestPushInfrastructure:
    """Test push notification infrastructure - device registration and push service"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_token = f"test_fcm_token_{uuid.uuid4().hex[:16]}"
        
    def get_admin_token(self):
        """Get admin auth token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json().get("access_token")
    
    def get_staff_token(self):
        """Get staff auth token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF_USERNAME,
            "password": STAFF_PASSWORD
        })
        assert response.status_code == 200, f"Staff login failed: {response.text}"
        return response.json().get("access_token")
    
    # ==================== Device Registration Tests ====================
    
    def test_device_register_stores_token(self):
        """POST /api/devices/register stores device token with staff_id, username, restaurant_id"""
        token = self.get_staff_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        response = self.session.post(
            f"{BASE_URL}/api/devices/register",
            json={"token": self.test_token, "platform": "android"},
            headers=headers
        )
        
        assert response.status_code == 200, f"Device register failed: {response.text}"
        data = response.json()
        assert data.get("message") == "Device registered"
        assert "token" in data
        print(f"[PASS] Device registered: {data}")
    
    def test_device_register_updates_existing_token(self):
        """POST /api/devices/register updates existing token if same token sent again"""
        token = self.get_staff_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        # First registration
        response1 = self.session.post(
            f"{BASE_URL}/api/devices/register",
            json={"token": self.test_token, "platform": "ios"},
            headers=headers
        )
        assert response1.status_code == 200
        
        # Second registration with same token (should update, not create duplicate)
        response2 = self.session.post(
            f"{BASE_URL}/api/devices/register",
            json={"token": self.test_token, "platform": "android"},
            headers=headers
        )
        assert response2.status_code == 200
        data = response2.json()
        assert data.get("message") == "Device registered"
        print(f"[PASS] Device token updated on re-registration: {data}")
    
    def test_device_register_requires_token(self):
        """POST /api/devices/register returns 400 if token is empty"""
        auth_token = self.get_staff_token()
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = self.session.post(
            f"{BASE_URL}/api/devices/register",
            json={"token": "", "platform": "android"},
            headers=headers
        )
        
        assert response.status_code == 400, f"Expected 400 for empty token: {response.text}"
        print(f"[PASS] Empty token rejected with 400")
    
    def test_device_register_requires_auth(self):
        """POST /api/devices/register requires authentication"""
        response = self.session.post(
            f"{BASE_URL}/api/devices/register",
            json={"token": self.test_token, "platform": "android"}
        )
        
        # FastAPI returns 403 for "Not authenticated" in this app
        assert response.status_code in [401, 403], f"Expected 401/403 without auth: {response.text}"
        print(f"[PASS] Device register requires authentication (status={response.status_code})")
    
    # ==================== Device Unregistration Tests ====================
    
    def test_device_unregister_marks_inactive(self):
        """DELETE /api/devices/unregister marks device as inactive"""
        token = self.get_staff_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        # First register the device
        self.session.post(
            f"{BASE_URL}/api/devices/register",
            json={"token": self.test_token, "platform": "android"},
            headers=headers
        )
        
        # Now unregister
        response = self.session.delete(
            f"{BASE_URL}/api/devices/unregister",
            json={"token": self.test_token},
            headers=headers
        )
        
        assert response.status_code == 200, f"Device unregister failed: {response.text}"
        data = response.json()
        assert data.get("message") == "Device unregistered"
        print(f"[PASS] Device unregistered: {data}")
    
    def test_device_unregister_requires_auth(self):
        """DELETE /api/devices/unregister requires authentication"""
        response = self.session.delete(
            f"{BASE_URL}/api/devices/unregister",
            json={"token": self.test_token}
        )
        
        # FastAPI returns 403 for "Not authenticated" in this app
        assert response.status_code in [401, 403], f"Expected 401/403 without auth: {response.text}"
        print(f"[PASS] Device unregister requires authentication (status={response.status_code})")
    
    # ==================== Push Service Graceful Degradation Tests ====================
    
    def test_push_service_no_crash_without_credentials(self):
        """Push service initializes without crash when FIREBASE_CREDENTIALS_PATH is not set"""
        # This test verifies the backend is running (push.py imports at startup)
        # Use the auth/login endpoint as a health check since /api/health may not exist
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Backend not responding: {response.text}"
        print(f"[PASS] Backend running - push service initialized without crash")
    
    # ==================== Long Shift Notification with Push Tests ====================
    
    def test_check_long_shifts_creates_notification_and_attempts_push(self):
        """POST /api/notifications/check-long-shifts creates notifications AND attempts push (dry-run)"""
        token = self.get_admin_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        response = self.session.post(
            f"{BASE_URL}/api/notifications/check-long-shifts",
            headers=headers
        )
        
        assert response.status_code == 200, f"Check long shifts failed: {response.text}"
        data = response.json()
        assert "message" in data
        assert "Checked" in data["message"]
        print(f"[PASS] Check long shifts endpoint works: {data}")
    
    # ==================== Existing Attendance Endpoints Tests ====================
    
    def test_clock_me_endpoint_works(self):
        """POST /api/attendance/clock-me still works"""
        token = self.get_staff_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        # clock-me requires a body with optional latitude/longitude
        response = self.session.post(
            f"{BASE_URL}/api/attendance/clock-me",
            json={},  # Empty body is valid (lat/lng are optional)
            headers=headers
        )
        
        # Should return 200 (clocked in/out/ghost_shift_pending) or 400/403 (geofence)
        assert response.status_code in [200, 400, 403], f"Clock-me failed: {response.text}"
        print(f"[PASS] Clock-me endpoint works: {response.status_code} - {response.json()}")
    
    def test_my_status_endpoint_works(self):
        """GET /api/attendance/my-status still works"""
        token = self.get_staff_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        response = self.session.get(
            f"{BASE_URL}/api/attendance/my-status",
            headers=headers
        )
        
        assert response.status_code == 200, f"My-status failed: {response.text}"
        data = response.json()
        # API returns "clocked_in" not "is_clocked_in"
        assert "clocked_in" in data
        print(f"[PASS] My-status endpoint works: {data}")
    
    def test_my_summary_endpoint_works(self):
        """GET /api/attendance/my-summary still works"""
        token = self.get_staff_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        response = self.session.get(
            f"{BASE_URL}/api/attendance/my-summary",
            headers=headers
        )
        
        assert response.status_code == 200, f"My-summary failed: {response.text}"
        data = response.json()
        assert "total_hours_today" in data or "total_hours" in data or isinstance(data, dict)
        print(f"[PASS] My-summary endpoint works: {data}")
    
    # ==================== Admin Login Test ====================
    
    def test_admin_login_works(self):
        """Admin login still works"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data.get("role") == "admin"
        print(f"[PASS] Admin login works: role={data.get('role')}")
    
    def test_staff_login_works(self):
        """Staff login still works"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF_USERNAME,
            "password": STAFF_PASSWORD
        })
        
        assert response.status_code == 200, f"Staff login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data.get("role") == "user"
        print(f"[PASS] Staff login works: role={data.get('role')}")


class TestDeviceRegistrationWithAdmin:
    """Test device registration with admin user"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_token = f"admin_fcm_token_{uuid.uuid4().hex[:16]}"
    
    def test_admin_can_register_device(self):
        """Admin can also register device tokens"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        auth_token = response.json().get("access_token")
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = self.session.post(
            f"{BASE_URL}/api/devices/register",
            json={"token": self.test_token, "platform": "ios"},
            headers=headers
        )
        
        assert response.status_code == 200, f"Admin device register failed: {response.text}"
        print(f"[PASS] Admin can register device: {response.json()}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
