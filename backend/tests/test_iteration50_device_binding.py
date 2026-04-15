"""
Iteration 50: Device Binding Toggle Tests
Tests for 3 critical bug fixes:
1. Device binding is now a toggle (default OFF) - login works from any device when OFF
2. Device binding blocks login only when enabled AND device mismatch
3. GET/PUT /api/restaurants/my/security includes device_binding_enabled field
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_CREDS = {"username": "SKAdmin", "password": "saswata@123"}
STAFF_CREDS = {"username": "user", "password": "user123"}


class TestDeviceBindingToggle:
    """Test device binding toggle functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get admin token and ensure device_binding_enabled is OFF"""
        # Login as admin
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert resp.status_code == 200, f"Admin login failed: {resp.text}"
        self.admin_token = resp.json()["access_token"]
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Reset device_binding_enabled to false (default state)
        reset_resp = requests.put(
            f"{BASE_URL}/api/restaurants/my/security",
            json={"biometric_required": False, "photo_audit_enabled": True, "photo_retention_days": 90, "device_binding_enabled": False},
            headers=self.admin_headers
        )
        assert reset_resp.status_code == 200, f"Failed to reset security settings: {reset_resp.text}"
        
        yield
        
        # Teardown: Reset device_binding_enabled to false
        requests.put(
            f"{BASE_URL}/api/restaurants/my/security",
            json={"biometric_required": False, "photo_audit_enabled": True, "photo_retention_days": 90, "device_binding_enabled": False},
            headers=self.admin_headers
        )
    
    def test_get_security_settings_includes_device_binding_enabled(self):
        """GET /api/restaurants/my/security returns device_binding_enabled field (default false)"""
        resp = requests.get(f"{BASE_URL}/api/restaurants/my/security", headers=self.admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify device_binding_enabled field exists and defaults to false
        assert "device_binding_enabled" in data, "device_binding_enabled field missing from response"
        assert data["device_binding_enabled"] == False, f"Expected device_binding_enabled=False, got {data['device_binding_enabled']}"
        print(f"✓ GET security settings returns device_binding_enabled={data['device_binding_enabled']}")
    
    def test_put_security_settings_can_toggle_device_binding(self):
        """PUT /api/restaurants/my/security can toggle device_binding_enabled"""
        # Enable device binding
        resp = requests.put(
            f"{BASE_URL}/api/restaurants/my/security",
            json={"biometric_required": False, "photo_audit_enabled": True, "photo_retention_days": 90, "device_binding_enabled": True},
            headers=self.admin_headers
        )
        assert resp.status_code == 200, f"Failed to enable device binding: {resp.text}"
        
        # Verify it was enabled
        get_resp = requests.get(f"{BASE_URL}/api/restaurants/my/security", headers=self.admin_headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["device_binding_enabled"] == True, "device_binding_enabled should be True after update"
        print("✓ device_binding_enabled toggled to True")
        
        # Disable device binding
        resp2 = requests.put(
            f"{BASE_URL}/api/restaurants/my/security",
            json={"biometric_required": False, "photo_audit_enabled": True, "photo_retention_days": 90, "device_binding_enabled": False},
            headers=self.admin_headers
        )
        assert resp2.status_code == 200
        
        # Verify it was disabled
        get_resp2 = requests.get(f"{BASE_URL}/api/restaurants/my/security", headers=self.admin_headers)
        assert get_resp2.status_code == 200
        assert get_resp2.json()["device_binding_enabled"] == False, "device_binding_enabled should be False after update"
        print("✓ device_binding_enabled toggled back to False")
    
    def test_login_with_device_id_succeeds_when_binding_disabled(self):
        """POST /api/auth/login with device_id does NOT block when device_binding_enabled=false (default)"""
        # Ensure device binding is OFF
        requests.put(
            f"{BASE_URL}/api/restaurants/my/security",
            json={"biometric_required": False, "photo_audit_enabled": True, "photo_retention_days": 90, "device_binding_enabled": False},
            headers=self.admin_headers
        )
        
        # Login as staff with a random device_id - should succeed
        login_data = {**STAFF_CREDS, "device_id": "test_device_random_12345"}
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
        assert resp.status_code == 200, f"Login should succeed when device_binding_enabled=false: {resp.text}"
        print("✓ Login with device_id succeeds when device_binding_enabled=false")
        
        # Login again with a DIFFERENT device_id - should also succeed
        login_data2 = {**STAFF_CREDS, "device_id": "test_device_different_67890"}
        resp2 = requests.post(f"{BASE_URL}/api/auth/login", json=login_data2)
        assert resp2.status_code == 200, f"Login with different device should succeed when binding disabled: {resp2.text}"
        print("✓ Login with different device_id also succeeds when device_binding_enabled=false")
    
    def test_login_blocks_when_binding_enabled_and_device_mismatch(self):
        """POST /api/auth/login with device_id BLOCKS when device_binding_enabled=true and device mismatch"""
        # First, reset the staff user's bound_device_id
        # Get staff list to find user's ID
        staff_resp = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=self.admin_headers)
        assert staff_resp.status_code == 200, f"Failed to get staff list: {staff_resp.text}"
        staff_list = staff_resp.json()
        user_staff = next((s for s in staff_list if s["username"] == "user"), None)
        
        if user_staff:
            # Reset device binding for the user
            reset_resp = requests.delete(f"{BASE_URL}/api/auth/reset-device/{user_staff['id']}", headers=self.admin_headers)
            # May return 200 or 404 if no binding exists - both are fine
            print(f"Reset device binding for user: {reset_resp.status_code}")
        
        # Enable device binding
        enable_resp = requests.put(
            f"{BASE_URL}/api/restaurants/my/security",
            json={"biometric_required": False, "photo_audit_enabled": True, "photo_retention_days": 90, "device_binding_enabled": True},
            headers=self.admin_headers
        )
        assert enable_resp.status_code == 200, f"Failed to enable device binding: {enable_resp.text}"
        
        # First login binds the device
        first_device = "bound_device_abc123"
        login1 = requests.post(f"{BASE_URL}/api/auth/login", json={**STAFF_CREDS, "device_id": first_device})
        assert login1.status_code == 200, f"First login should succeed and bind device: {login1.text}"
        print(f"✓ First login with device_id={first_device} succeeded (device bound)")
        
        # Second login with DIFFERENT device should be BLOCKED
        different_device = "different_device_xyz789"
        login2 = requests.post(f"{BASE_URL}/api/auth/login", json={**STAFF_CREDS, "device_id": different_device})
        assert login2.status_code == 403, f"Login with different device should be blocked (403), got {login2.status_code}: {login2.text}"
        assert "device_blocked" in login2.json().get("detail", ""), f"Error should contain 'device_blocked': {login2.text}"
        print(f"✓ Login with different device_id={different_device} correctly blocked with 403")
        
        # Login with SAME device should still work
        login3 = requests.post(f"{BASE_URL}/api/auth/login", json={**STAFF_CREDS, "device_id": first_device})
        assert login3.status_code == 200, f"Login with same bound device should succeed: {login3.text}"
        print(f"✓ Login with same bound device_id={first_device} still succeeds")
    
    def test_admin_login_not_affected_by_device_binding(self):
        """Admin/platform_owner logins are not affected by device binding"""
        time.sleep(10)  # Wait for rate limit to reset
        
        # Enable device binding
        requests.put(
            f"{BASE_URL}/api/restaurants/my/security",
            json={"biometric_required": False, "photo_audit_enabled": True, "photo_retention_days": 90, "device_binding_enabled": True},
            headers=self.admin_headers
        )
        
        # Admin login with any device_id should work
        login1 = requests.post(f"{BASE_URL}/api/auth/login", json={**ADMIN_CREDS, "device_id": "admin_device_1"})
        assert login1.status_code == 200, f"Admin login should not be affected by device binding: {login1.text}"
        
        login2 = requests.post(f"{BASE_URL}/api/auth/login", json={**ADMIN_CREDS, "device_id": "admin_device_2"})
        assert login2.status_code == 200, f"Admin login with different device should work: {login2.text}"
        print("✓ Admin logins not affected by device binding")
    
    def test_login_without_device_id_always_works(self):
        """Login without device_id should always work regardless of binding setting"""
        time.sleep(10)  # Wait for rate limit to reset
        
        # Enable device binding
        requests.put(
            f"{BASE_URL}/api/restaurants/my/security",
            json={"biometric_required": False, "photo_audit_enabled": True, "photo_retention_days": 90, "device_binding_enabled": True},
            headers=self.admin_headers
        )
        
        # Login without device_id (web browser scenario)
        login = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        assert login.status_code == 200, f"Login without device_id should work: {login.text}"
        print("✓ Login without device_id works even when device_binding_enabled=true")


class TestPushNotificationService:
    """Test push notification service has proper error handling (code review)"""
    
    def test_push_service_has_try_catch(self):
        """Verify push.js has try/catch around permission and register calls"""
        push_file = "/app/frontend/src/services/push.js"
        with open(push_file, 'r') as f:
            content = f.read()
        
        # Check for try/catch around checkPermissions
        assert "try {" in content and "checkPermissions" in content, "push.js should have try/catch around checkPermissions"
        assert "catch (permErr)" in content or "catch (err)" in content, "push.js should catch permission errors"
        
        # Check for try/catch around register
        assert "PushNotifications.register()" in content, "push.js should call PushNotifications.register()"
        assert "catch (regErr)" in content, "push.js should have separate catch for registration errors"
        
        # Check for non-fatal error handling
        assert "non-fatal" in content.lower(), "push.js should indicate errors are non-fatal"
        
        print("✓ push.js has proper try/catch around permission and register calls")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
