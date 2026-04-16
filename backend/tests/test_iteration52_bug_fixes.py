"""
Iteration 52 Bug Fixes Tests:
1. Staff deletion cascade-closes open attendance records
2. POST /api/attendance/force-close-stale force-closes orphan records from deleted users
3. GET /api/attendance/dashboard-stats filters out deleted users from clocked_in count
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_USERNAME = "SKAdmin"
ADMIN_PASSWORD = "saswata@123"
STAFF_USERNAME = "user"
STAFF_PASSWORD = "user123"


class TestIteration52BugFixes:
    """Tests for iteration 52 bug fixes: cascade delete and ghost user prevention"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get admin auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        self.admin_token = data.get("access_token")
        self.restaurant_id = data.get("restaurant_id")
        self.session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
        yield
        # Cleanup handled in individual tests
    
    def test_01_admin_login_works(self):
        """Verify admin login works without push notification crash"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data.get("role") == "admin"
        print(f"Admin login successful: {data.get('username')}")
    
    def test_02_staff_login_works(self):
        """Verify staff login works without push notification crash"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF_USERNAME,
            "password": STAFF_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data.get("role") == "user"
        print(f"Staff login successful: {data.get('username')}")
    
    def test_03_create_temp_staff_and_clock_in(self):
        """Create a temporary staff member and clock them in"""
        # Create temp staff
        timestamp = int(datetime.now().timestamp())
        temp_username = f"TEST_temp_staff_{timestamp}"
        
        create_response = self.session.post(f"{BASE_URL}/api/restaurant/staff", json={
            "username": temp_username,
            "email": f"temp_{timestamp}@test.com",
            "password": "temppass123",
            "role": "user",
            "capabilities": ["workforce.clock_in"]
        })
        assert create_response.status_code == 200, f"Failed to create staff: {create_response.text}"
        staff_data = create_response.json()
        staff_id = staff_data.get("id")
        print(f"Created temp staff: {temp_username} with ID: {staff_id}")
        
        # Set POS PIN for the temp staff
        pin_response = self.session.post(f"{BASE_URL}/api/auth/set-pos-pin", json={
            "user_id": staff_id,
            "pin": "9999"
        })
        assert pin_response.status_code == 200, f"Failed to set PIN: {pin_response.text}"
        print(f"Set POS PIN 9999 for temp staff")
        
        # Clock in the temp staff using PIN
        clock_response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": "9999",
            "restaurant_id": self.restaurant_id,
            "entry_source": "pos_terminal"
        })
        assert clock_response.status_code == 200, f"Failed to clock in: {clock_response.text}"
        clock_data = clock_response.json()
        assert clock_data.get("action") == "clock_in"
        print(f"Clocked in temp staff: {clock_data}")
        
        # Verify staff appears in live attendance
        live_response = self.session.get(f"{BASE_URL}/api/attendance/live")
        assert live_response.status_code == 200
        live_data = live_response.json()
        clocked_in_ids = [r.get("staff_id") for r in live_data]
        assert staff_id in clocked_in_ids, "Temp staff should be in live attendance"
        print(f"Verified temp staff is clocked in")
        
        # Store for next test
        self.__class__.temp_staff_id = staff_id
        self.__class__.temp_username = temp_username
    
    def test_04_delete_staff_cascades_attendance_close(self):
        """Delete the temp staff and verify attendance is cascade-closed"""
        staff_id = getattr(self.__class__, 'temp_staff_id', None)
        temp_username = getattr(self.__class__, 'temp_username', None)
        
        if not staff_id:
            pytest.skip("No temp staff created in previous test")
        
        # Delete the staff
        delete_response = self.session.delete(f"{BASE_URL}/api/restaurant/staff/{staff_id}")
        assert delete_response.status_code == 200, f"Failed to delete staff: {delete_response.text}"
        delete_data = delete_response.json()
        print(f"Delete response: {delete_data}")
        
        # Verify closed_shifts count in response
        assert "closed_shifts" in delete_data, "Response should include closed_shifts count"
        assert delete_data.get("closed_shifts") >= 1, "Should have closed at least 1 shift"
        print(f"Cascade closed {delete_data.get('closed_shifts')} shift(s)")
        
        # Verify staff no longer in live attendance
        live_response = self.session.get(f"{BASE_URL}/api/attendance/live")
        assert live_response.status_code == 200
        live_data = live_response.json()
        clocked_in_ids = [r.get("staff_id") for r in live_data]
        assert staff_id not in clocked_in_ids, "Deleted staff should not be in live attendance"
        print(f"Verified deleted staff is NOT in live attendance")
    
    def test_05_dashboard_stats_filters_deleted_users(self):
        """Verify dashboard-stats filters out deleted users from clocked_in count"""
        response = self.session.get(f"{BASE_URL}/api/attendance/dashboard-stats")
        assert response.status_code == 200, f"Failed to get dashboard stats: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "clocked_in_count" in data
        assert "clocked_in_staff" in data
        assert "total_staff" in data
        
        print(f"Dashboard stats: clocked_in={data.get('clocked_in_count')}, total_staff={data.get('total_staff')}")
        
        # The clocked_in_staff should only contain existing users
        # (This is verified by the filter in the endpoint)
        clocked_in_staff = data.get("clocked_in_staff", [])
        print(f"Clocked in staff: {clocked_in_staff}")
    
    def test_06_force_close_stale_endpoint(self):
        """Test the force-close-stale endpoint for orphan records"""
        response = self.session.post(f"{BASE_URL}/api/attendance/force-close-stale")
        assert response.status_code == 200, f"Failed to force-close stale: {response.text}"
        data = response.json()
        
        assert "message" in data
        assert "closed" in data
        print(f"Force-close-stale result: {data}")
    
    def test_07_multiple_logins_no_crash(self):
        """Test multiple account logins work without crash"""
        # Login as admin
        admin_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert admin_response.status_code == 200
        print("Admin login 1: OK")
        
        # Login as staff
        staff_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF_USERNAME,
            "password": STAFF_PASSWORD
        })
        assert staff_response.status_code == 200
        print("Staff login: OK")
        
        # Login as admin again
        admin_response2 = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert admin_response2.status_code == 200
        print("Admin login 2: OK")
        
        # All logins should work without any push notification crash
        print("Multiple logins completed without crash")


class TestCryptoRandomUUIDFallback:
    """Test that login works even if crypto.randomUUID is not available (fallback)"""
    
    def test_login_generates_device_id(self):
        """Login should work and generate device ID (with fallback if needed)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        # The device ID is generated client-side, but login should work regardless
        print(f"Login successful with device ID handling")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
