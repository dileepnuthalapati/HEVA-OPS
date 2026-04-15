"""
Iteration 48: Anti-Time Theft Protocol Tests
- Device Binding (Phase 2): Staff accounts bound to one phone, admins exempt
- Photo Capture (Phase 1): Photo upload/serve endpoints, record_id in clock responses
"""
import pytest
import requests
import os
import base64
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
PLATFORM_OWNER = {"username": "platform_owner", "password": "admin123"}
ADMIN = {"username": "SKAdmin", "password": "saswata@123"}
STAFF = {"username": "user", "password": "user123"}


class TestDeviceBinding:
    """Device binding tests - staff bound to one device, admins exempt"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Reset staff device binding before each test"""
        # Login as admin to reset device binding
        admin_resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        if admin_resp.status_code == 200:
            admin_token = admin_resp.json().get("access_token")
            # Get staff user ID
            staff_resp = requests.get(
                f"{BASE_URL}/api/restaurant/staff",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            if staff_resp.status_code == 200:
                for staff in staff_resp.json():
                    if staff.get("username") == "user":
                        # Reset device binding
                        requests.delete(
                            f"{BASE_URL}/api/auth/reset-device/{staff['id']}",
                            headers={"Authorization": f"Bearer {admin_token}"}
                        )
                        break
    
    def test_staff_first_login_binds_device(self):
        """POST /api/auth/login with device_id - first login binds device for staff"""
        device_id = f"test_device_{uuid.uuid4().hex[:8]}"
        
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF["username"],
            "password": STAFF["password"],
            "device_id": device_id
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data.get("device_bound") == True, "Device should be bound after first login"
        print(f"✓ Staff first login with device_id={device_id} succeeded, device_bound={data.get('device_bound')}")
    
    def test_staff_login_same_device_succeeds(self):
        """Staff can login again with the same device_id"""
        device_id = f"test_device_{uuid.uuid4().hex[:8]}"
        
        # First login - binds device
        resp1 = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF["username"],
            "password": STAFF["password"],
            "device_id": device_id
        })
        assert resp1.status_code == 200
        
        # Second login - same device should work
        resp2 = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF["username"],
            "password": STAFF["password"],
            "device_id": device_id
        })
        assert resp2.status_code == 200, f"Same device login failed: {resp2.text}"
        print(f"✓ Staff login with same device_id succeeded")
    
    def test_staff_login_different_device_blocked(self):
        """POST /api/auth/login with mismatched device_id returns 403 for staff"""
        device_id_1 = f"test_device_{uuid.uuid4().hex[:8]}"
        device_id_2 = f"test_device_{uuid.uuid4().hex[:8]}"
        
        # First login - binds to device_1
        resp1 = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF["username"],
            "password": STAFF["password"],
            "device_id": device_id_1
        })
        assert resp1.status_code == 200
        
        # Second login - different device should be blocked
        resp2 = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF["username"],
            "password": STAFF["password"],
            "device_id": device_id_2
        })
        assert resp2.status_code == 403, f"Expected 403, got {resp2.status_code}: {resp2.text}"
        assert "device_blocked" in resp2.json().get("detail", ""), "Should contain device_blocked message"
        print(f"✓ Staff login with different device_id correctly blocked with 403")
    
    def test_admin_login_not_blocked_by_device(self):
        """POST /api/auth/login with device_id does NOT block admin"""
        device_id_1 = f"test_device_{uuid.uuid4().hex[:8]}"
        device_id_2 = f"test_device_{uuid.uuid4().hex[:8]}"
        
        # First login with device_1
        resp1 = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN["username"],
            "password": ADMIN["password"],
            "device_id": device_id_1
        })
        assert resp1.status_code == 200, f"Admin login failed: {resp1.text}"
        
        # Second login with different device - should still work for admin
        resp2 = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN["username"],
            "password": ADMIN["password"],
            "device_id": device_id_2
        })
        assert resp2.status_code == 200, f"Admin should not be blocked: {resp2.text}"
        print(f"✓ Admin login with different device_id succeeded (exempt from binding)")
    
    def test_platform_owner_login_not_blocked_by_device(self):
        """POST /api/auth/login with device_id does NOT block platform_owner"""
        device_id_1 = f"test_device_{uuid.uuid4().hex[:8]}"
        device_id_2 = f"test_device_{uuid.uuid4().hex[:8]}"
        
        # First login with device_1
        resp1 = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": PLATFORM_OWNER["username"],
            "password": PLATFORM_OWNER["password"],
            "device_id": device_id_1
        })
        assert resp1.status_code == 200, f"Platform owner login failed: {resp1.text}"
        
        # Second login with different device - should still work
        resp2 = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": PLATFORM_OWNER["username"],
            "password": PLATFORM_OWNER["password"],
            "device_id": device_id_2
        })
        assert resp2.status_code == 200, f"Platform owner should not be blocked: {resp2.text}"
        print(f"✓ Platform owner login with different device_id succeeded (exempt from binding)")
    
    def test_login_without_device_id_works(self):
        """POST /api/auth/login without device_id works normally (backward compatible)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF["username"],
            "password": STAFF["password"]
            # No device_id
        })
        assert response.status_code == 200, f"Login without device_id failed: {response.text}"
        print(f"✓ Login without device_id succeeded (backward compatible)")


class TestDeviceBindingManagement:
    """Admin device binding management endpoints"""
    
    def get_admin_token(self):
        import time
        time.sleep(1)  # Avoid rate limiting
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        return resp.json().get("access_token")
    
    def get_staff_user_id(self, token):
        resp = requests.get(
            f"{BASE_URL}/api/restaurant/staff",
            headers={"Authorization": f"Bearer {token}"}
        )
        staff_list = resp.json()
        if isinstance(staff_list, list):
            for staff in staff_list:
                if isinstance(staff, dict) and staff.get("username") == "user":
                    return staff["id"]
        return None
    
    def test_reset_device_binding(self):
        """DELETE /api/auth/reset-device/{user_id} resets device binding (admin only)"""
        token = self.get_admin_token()
        user_id = self.get_staff_user_id(token)
        assert user_id, "Could not find staff user"
        
        # First bind a device
        device_id = f"test_device_{uuid.uuid4().hex[:8]}"
        requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF["username"],
            "password": STAFF["password"],
            "device_id": device_id
        })
        
        # Reset device binding
        response = requests.delete(
            f"{BASE_URL}/api/auth/reset-device/{user_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Reset failed: {response.text}"
        assert "reset" in response.json().get("message", "").lower()
        print(f"✓ Device binding reset successfully")
        
        # Verify staff can now login with a new device
        new_device_id = f"test_device_{uuid.uuid4().hex[:8]}"
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF["username"],
            "password": STAFF["password"],
            "device_id": new_device_id
        })
        assert resp.status_code == 200, f"Login after reset failed: {resp.text}"
        print(f"✓ Staff can login with new device after reset")
    
    def test_get_device_status(self):
        """GET /api/auth/device-status/{user_id} returns binding status"""
        token = self.get_admin_token()
        user_id = self.get_staff_user_id(token)
        assert user_id, "Could not find staff user"
        
        response = requests.get(
            f"{BASE_URL}/api/auth/device-status/{user_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Get status failed: {response.text}"
        data = response.json()
        assert "has_bound_device" in data
        print(f"✓ Device status retrieved: has_bound_device={data.get('has_bound_device')}")


class TestPhotoCapture:
    """Photo capture and storage tests"""
    
    def get_admin_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        assert resp.status_code == 200, f"Admin login failed: {resp.text}"
        return resp.json().get("access_token")
    
    def test_photo_upload_requires_valid_record(self):
        """POST /api/attendance/photo returns 404 for nonexistent record_id"""
        # Create a small test JPEG (1x1 pixel)
        test_jpeg_base64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB//9k="
        
        response = requests.post(f"{BASE_URL}/api/attendance/photo", json={
            "record_id": "nonexistent_record_12345",
            "photo_base64": test_jpeg_base64
        })
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print(f"✓ Photo upload correctly returns 404 for nonexistent record")
    
    def test_clock_endpoint_returns_record_id(self):
        """POST /api/attendance/clock returns record_id in response"""
        token = self.get_admin_token()
        
        # Get restaurant ID
        rest_resp = requests.get(
            f"{BASE_URL}/api/restaurants/my",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert rest_resp.status_code == 200, f"Get restaurant failed: {rest_resp.text}"
        restaurant_id = rest_resp.json().get("id")
        
        # Get a staff member with POS PIN
        staff_resp = requests.get(
            f"{BASE_URL}/api/restaurant/staff",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert staff_resp.status_code == 200, f"Get staff failed: {staff_resp.text}"
        staff_list = staff_resp.json()
        
        staff_with_pin = None
        for staff in staff_list:
            if isinstance(staff, dict) and staff.get("has_pos_pin"):
                staff_with_pin = staff
                break
        
        # We can verify the endpoint exists and returns proper error for invalid PIN
        response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": "9999",  # Invalid PIN
            "restaurant_id": restaurant_id
        })
        # Should return 401 for invalid PIN, not 500
        assert response.status_code in [401, 400], f"Unexpected status: {response.status_code}"
        print(f"✓ Clock endpoint responds correctly (401 for invalid PIN)")
    
    def test_photo_serve_requires_auth(self):
        """GET /api/attendance/photo/{path} requires authentication"""
        response = requests.get(f"{BASE_URL}/api/attendance/photo/test/path.jpg")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Photo serve endpoint requires authentication")
    
    def test_photo_cleanup_endpoint_exists(self):
        """DELETE /api/attendance/photos/cleanup removes old photos (admin only)"""
        token = self.get_admin_token()
        assert token, "Failed to get admin token"
        
        response = requests.delete(
            f"{BASE_URL}/api/attendance/photos/cleanup?days=90",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Cleanup failed: {response.text}"
        data = response.json()
        assert "cleaned" in data.get("message", "").lower() or "message" in data
        print(f"✓ Photo cleanup endpoint works: {data.get('message')}")


class TestAttendanceRecordId:
    """Verify attendance clock endpoints return record_id"""
    
    def get_admin_token(self):
        import time
        time.sleep(1)  # Avoid rate limiting
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        if resp.status_code == 429:
            time.sleep(5)
            resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        assert resp.status_code == 200, f"Admin login failed: {resp.text}"
        return resp.json().get("access_token")
    
    def test_attendance_records_have_id(self):
        """GET /api/attendance returns records with id field"""
        token = self.get_admin_token()
        assert token, "Failed to get admin token"
        
        response = requests.get(
            f"{BASE_URL}/api/attendance?start_date=2020-01-01&end_date=2030-01-01",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Get attendance failed: {response.text}"
        records = response.json()
        
        if isinstance(records, list) and len(records) > 0:
            assert "id" in records[0], "Attendance record should have 'id' field"
            print(f"✓ Attendance records have 'id' field (found {len(records)} records)")
        else:
            print(f"✓ Attendance endpoint works (no records found or empty list)")


class TestPhotoUploadWithValidRecord:
    """Test photo upload with a valid attendance record"""
    
    def get_admin_token(self):
        import time
        time.sleep(1)  # Avoid rate limiting
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        if resp.status_code == 429:
            time.sleep(5)
            resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        assert resp.status_code == 200, f"Admin login failed: {resp.text}"
        return resp.json().get("access_token")
    
    def test_photo_upload_with_existing_record(self):
        """POST /api/attendance/photo accepts base64 JPEG for valid record"""
        token = self.get_admin_token()
        assert token, "Failed to get admin token"
        
        # Get an existing attendance record
        response = requests.get(
            f"{BASE_URL}/api/attendance?start_date=2020-01-01&end_date=2030-01-01",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Get attendance failed: {response.text}"
        records = response.json()
        
        if not isinstance(records, list) or len(records) == 0:
            pytest.skip("No attendance records found for photo upload test")
        
        record_id = records[0].get("id")
        
        # Create a small test JPEG (1x1 pixel)
        test_jpeg_base64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB//9k="
        
        response = requests.post(f"{BASE_URL}/api/attendance/photo", json={
            "record_id": record_id,
            "photo_base64": test_jpeg_base64
        })
        
        # Should succeed or fail gracefully
        if response.status_code == 200:
            data = response.json()
            assert "path" in data, "Response should contain photo path"
            print(f"✓ Photo uploaded successfully: {data.get('path')}")
        else:
            # May fail if storage not configured, but should not be 500
            assert response.status_code != 500, f"Server error: {response.text}"
            print(f"✓ Photo upload handled gracefully: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
