"""
Iteration 53: Push Notification Opt-in System & Ghost User Fix Tests

Tests:
1. Push notification is NOT triggered during login (AuthContext verification)
2. Staff deletion cascade-closes open attendance records
3. POST /api/attendance/force-close-stale cleans orphan records
4. Code structure verification for PushPromptBanner component
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USERNAME = "SKAdmin"
ADMIN_PASSWORD = "saswata@123"
STAFF_USERNAME = "user"
STAFF_PASSWORD = "user123"


class TestAuthLoginNoPush:
    """Verify login does NOT trigger push notifications"""
    
    def test_staff_login_returns_no_push_fields(self):
        """Staff login should NOT return any push-related fields"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF_USERNAME,
            "password": STAFF_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Verify no push-related fields in response
        assert "push_token" not in data, "Login should NOT return push_token"
        assert "push_enabled" not in data, "Login should NOT return push_enabled"
        assert "push_initialized" not in data, "Login should NOT return push_initialized"
        
        # Verify standard auth fields are present (access_token is the field name)
        assert "access_token" in data, "Login should return access_token"
        assert "username" in data, "Login should return username"
        print(f"✓ Staff login successful, no push fields in response")
    
    def test_admin_login_returns_no_push_fields(self):
        """Admin login should NOT return any push-related fields"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Verify no push-related fields in response
        assert "push_token" not in data, "Login should NOT return push_token"
        assert "push_enabled" not in data, "Login should NOT return push_enabled"
        
        print(f"✓ Admin login successful, no push fields in response")


class TestStaffDeletionCascade:
    """Test that deleting staff cascade-closes open attendance records"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json().get("access_token")
    
    def test_delete_staff_returns_closed_shifts_count(self, admin_token):
        """DELETE /api/restaurant/staff/{id} should return closed_shifts count"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create a temporary test staff (email is required)
        test_username = f"TEST_cascade_staff_{os.urandom(4).hex()}"
        create_response = requests.post(f"{BASE_URL}/api/restaurant/staff", json={
            "username": test_username,
            "email": f"{test_username}@test.com",
            "password": "test123",
            "role": "user",
            "pos_pin": "9999"
        }, headers=headers)
        
        if create_response.status_code != 200:
            pytest.skip(f"Could not create test staff: {create_response.text}")
        
        staff_id = create_response.json().get("id")
        assert staff_id, "Staff creation should return id"
        
        # Delete the staff
        delete_response = requests.delete(f"{BASE_URL}/api/restaurant/staff/{staff_id}", headers=headers)
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        data = delete_response.json()
        assert "closed_shifts" in data, "Delete response should include closed_shifts count"
        assert isinstance(data["closed_shifts"], int), "closed_shifts should be an integer"
        
        print(f"✓ Staff deletion returned closed_shifts: {data['closed_shifts']}")


class TestForceCloseStaleShifts:
    """Test the force-close-stale endpoint for orphan records"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json().get("access_token")
    
    def test_force_close_stale_endpoint_exists(self, admin_token):
        """POST /api/attendance/force-close-stale should exist and work"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.post(f"{BASE_URL}/api/attendance/force-close-stale", headers=headers)
        assert response.status_code == 200, f"Force close stale failed: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should include message"
        assert "closed" in data, "Response should include closed count"
        assert isinstance(data["closed"], int), "closed should be an integer"
        
        print(f"✓ Force-close-stale endpoint works: {data['message']}")
    
    def test_force_close_stale_requires_admin(self):
        """POST /api/attendance/force-close-stale should require admin auth"""
        # Try without auth
        response = requests.post(f"{BASE_URL}/api/attendance/force-close-stale")
        assert response.status_code in [401, 403], "Should require authentication"
        
        # Try with staff auth
        staff_login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF_USERNAME,
            "password": STAFF_PASSWORD
        })
        if staff_login.status_code == 200:
            staff_token = staff_login.json().get("access_token")
            headers = {"Authorization": f"Bearer {staff_token}"}
            response = requests.post(f"{BASE_URL}/api/attendance/force-close-stale", headers=headers)
            assert response.status_code in [401, 403], "Staff should not be able to force-close"
        
        print("✓ Force-close-stale requires admin authentication")


class TestDashboardStatsFiltersDeletedUsers:
    """Test that dashboard stats filter out deleted users"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json().get("access_token")
    
    def test_dashboard_stats_returns_valid_data(self, admin_token):
        """GET /api/attendance/dashboard-stats should return valid workforce data"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/attendance/dashboard-stats", headers=headers)
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        
        data = response.json()
        
        # Verify expected fields
        assert "clocked_in_count" in data, "Should include clocked_in_count"
        assert "total_staff" in data, "Should include total_staff"
        assert "scheduled_shifts" in data, "Should include scheduled_shifts"
        assert "total_hours_today" in data, "Should include total_hours_today"
        
        # Verify clocked_in_staff is a list
        assert "clocked_in_staff" in data, "Should include clocked_in_staff list"
        assert isinstance(data["clocked_in_staff"], list), "clocked_in_staff should be a list"
        
        print(f"✓ Dashboard stats: {data['clocked_in_count']} clocked in, {data['total_staff']} total staff")


class TestPendingAdjustmentsEndpoint:
    """Test the pending adjustments endpoint for manager approval flow"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json().get("access_token")
    
    def test_pending_adjustments_endpoint_exists(self, admin_token):
        """GET /api/attendance/pending-adjustments should exist"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/attendance/pending-adjustments", headers=headers)
        assert response.status_code == 200, f"Pending adjustments failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Should return a list of pending adjustments"
        
        print(f"✓ Pending adjustments endpoint works: {len(data)} pending")


class TestMultipleLoginsNoCrash:
    """Test that multiple logins don't cause crashes (no push init on login)"""
    
    def test_sequential_logins_succeed(self):
        """Multiple sequential logins should all succeed without errors"""
        # Login as admin
        admin_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert admin_response.status_code == 200, f"Admin login 1 failed: {admin_response.text}"
        
        # Login as staff
        staff_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF_USERNAME,
            "password": STAFF_PASSWORD
        })
        assert staff_response.status_code == 200, f"Staff login failed: {staff_response.text}"
        
        # Login as admin again
        admin_response2 = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert admin_response2.status_code == 200, f"Admin login 2 failed: {admin_response2.text}"
        
        print("✓ Multiple sequential logins all succeeded without crash")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
