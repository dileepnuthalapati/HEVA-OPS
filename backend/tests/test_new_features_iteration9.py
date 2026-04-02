"""
Test suite for HevaPOS new features - Iteration 9
Tests: Staff Management, Change Password, Stripe Billing, Printer Discovery, Back buttons
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://stripe-billing-ui-1.preview.emergentagent.com')

class TestAuthentication:
    """Test login for all 3 user types"""
    
    def test_platform_owner_login(self):
        """Platform owner should login and get platform_owner role"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "platform_owner"
        print(f"PASSED: Platform owner login - role: {data['user']['role']}")
    
    def test_restaurant_admin_login(self):
        """Restaurant admin should login and get admin role"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"PASSED: Restaurant admin login - role: {data['user']['role']}")
    
    def test_staff_user_login(self):
        """Staff user should login and get user role"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "user",
            "password": "user123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "user"
        print(f"PASSED: Staff user login - role: {data['user']['role']}")


class TestStaffManagement:
    """Test Staff CRUD operations"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_staff_list(self, admin_token):
        """Admin should be able to get staff list"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=headers)
        assert response.status_code == 200, f"Failed to get staff: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"PASSED: Get staff list - found {len(data)} staff members")
    
    def test_create_staff(self, admin_token):
        """Admin should be able to create new staff"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        import time
        test_username = f"TEST_staff_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/restaurant/staff", headers=headers, json={
            "username": test_username,
            "password": "testpass123",
            "role": "user"
        })
        assert response.status_code in [200, 201], f"Failed to create staff: {response.text}"
        data = response.json()
        assert data["username"] == test_username
        assert data["role"] == "user"
        print(f"PASSED: Create staff - created {test_username}")
        return data["id"]
    
    def test_update_staff(self, admin_token):
        """Admin should be able to update staff"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        # First create a staff member
        import time
        test_username = f"TEST_update_{int(time.time())}"
        create_response = requests.post(f"{BASE_URL}/api/restaurant/staff", headers=headers, json={
            "username": test_username,
            "password": "testpass123",
            "role": "user"
        })
        staff_id = create_response.json()["id"]
        
        # Update the staff
        update_response = requests.put(f"{BASE_URL}/api/restaurant/staff/{staff_id}", headers=headers, json={
            "username": test_username,
            "role": "admin"
        })
        assert update_response.status_code == 200, f"Failed to update staff: {update_response.text}"
        data = update_response.json()
        assert data["role"] == "admin"
        print(f"PASSED: Update staff - role changed to admin")
    
    def test_reset_staff_password(self, admin_token):
        """Admin should be able to reset staff password"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        # First create a staff member
        import time
        test_username = f"TEST_reset_{int(time.time())}"
        create_response = requests.post(f"{BASE_URL}/api/restaurant/staff", headers=headers, json={
            "username": test_username,
            "password": "oldpass123",
            "role": "user"
        })
        staff_id = create_response.json()["id"]
        
        # Reset password
        reset_response = requests.put(f"{BASE_URL}/api/restaurant/staff/{staff_id}/reset-password", headers=headers, json={
            "new_password": "newpass456"
        })
        assert reset_response.status_code == 200, f"Failed to reset password: {reset_response.text}"
        print(f"PASSED: Reset staff password")
    
    def test_delete_staff(self, admin_token):
        """Admin should be able to delete staff"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        # First create a staff member
        import time
        test_username = f"TEST_delete_{int(time.time())}"
        create_response = requests.post(f"{BASE_URL}/api/restaurant/staff", headers=headers, json={
            "username": test_username,
            "password": "testpass123",
            "role": "user"
        })
        staff_id = create_response.json()["id"]
        
        # Delete the staff
        delete_response = requests.delete(f"{BASE_URL}/api/restaurant/staff/{staff_id}", headers=headers)
        assert delete_response.status_code == 200, f"Failed to delete staff: {delete_response.text}"
        print(f"PASSED: Delete staff")


class TestChangePassword:
    """Test change password functionality"""
    
    def test_change_password_success(self):
        """User should be able to change their own password"""
        # Login as restaurant_admin
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Change password
        change_response = requests.put(f"{BASE_URL}/api/auth/change-password", headers=headers, json={
            "current_password": "admin123",
            "new_password": "newadmin123"
        })
        assert change_response.status_code == 200, f"Failed to change password: {change_response.text}"
        
        # Verify new password works
        new_login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "newadmin123"
        })
        assert new_login.status_code == 200, "New password login failed"
        
        # Revert password back
        new_token = new_login.json()["access_token"]
        revert_response = requests.put(f"{BASE_URL}/api/auth/change-password", 
            headers={"Authorization": f"Bearer {new_token}"}, json={
            "current_password": "newadmin123",
            "new_password": "admin123"
        })
        assert revert_response.status_code == 200, "Failed to revert password"
        print("PASSED: Change password - changed and reverted successfully")
    
    def test_change_password_wrong_current(self):
        """Should fail with wrong current password"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        change_response = requests.put(f"{BASE_URL}/api/auth/change-password", headers=headers, json={
            "current_password": "wrongpassword",
            "new_password": "newpass123"
        })
        assert change_response.status_code == 400, "Should fail with wrong current password"
        print("PASSED: Change password - correctly rejects wrong current password")


class TestStripeCheckout:
    """Test Stripe checkout endpoint"""
    
    def test_stripe_checkout_endpoint_exists(self):
        """Stripe checkout endpoint should exist"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "admin123"
        })
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Try to create checkout - may fail if Stripe not configured, but endpoint should exist
        response = requests.post(f"{BASE_URL}/api/stripe/create-checkout", headers=headers)
        # Accept 200 (success) or 400/500 (Stripe not configured) - just not 404
        assert response.status_code != 404, "Stripe checkout endpoint not found"
        print(f"PASSED: Stripe checkout endpoint exists - status: {response.status_code}")


class TestPrinterAPI:
    """Test Printer API endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_printers(self, admin_token):
        """Should get list of printers"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/printers", headers=headers)
        assert response.status_code == 200, f"Failed to get printers: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"PASSED: Get printers - found {len(data)} printers")
    
    def test_create_printer(self, admin_token):
        """Should create a new printer"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        import time
        response = requests.post(f"{BASE_URL}/api/printers", headers=headers, json={
            "name": f"TEST_Printer_{int(time.time())}",
            "type": "wifi",
            "address": "192.168.1.200:9100",
            "is_default": False,
            "paper_width": 80
        })
        assert response.status_code in [200, 201], f"Failed to create printer: {response.text}"
        data = response.json()
        assert "id" in data
        print(f"PASSED: Create printer - id: {data['id']}")
        return data["id"]
    
    def test_test_printer(self, admin_token):
        """Should test a printer"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        # Get existing printers
        printers = requests.get(f"{BASE_URL}/api/printers", headers=headers).json()
        if len(printers) > 0:
            printer_id = printers[0]["id"]
            response = requests.post(f"{BASE_URL}/api/printers/{printer_id}/test", headers=headers)
            assert response.status_code == 200, f"Failed to test printer: {response.text}"
            data = response.json()
            assert "commands" in data
            print(f"PASSED: Test printer - generated ESC/POS commands")
        else:
            print("SKIPPED: No printers to test")


class TestRestaurantSettings:
    """Test Restaurant Settings API"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_my_restaurant(self, admin_token):
        """Should get current user's restaurant"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurants/my", headers=headers)
        assert response.status_code == 200, f"Failed to get restaurant: {response.text}"
        data = response.json()
        assert "business_info" in data
        assert "currency" in data
        print(f"PASSED: Get my restaurant - currency: {data['currency']}")
    
    def test_update_restaurant_settings(self, admin_token):
        """Should update restaurant business info"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.put(f"{BASE_URL}/api/restaurants/my/settings", headers=headers, json={
            "name": "Pizza Palace Updated",
            "phone": "020 1234 5678"
        })
        assert response.status_code == 200, f"Failed to update settings: {response.text}"
        data = response.json()
        assert "business_info" in data
        print(f"PASSED: Update restaurant settings")


class TestReportsAPI:
    """Test Reports API"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_report_stats(self, admin_token):
        """Should get report stats"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/reports/stats?start_date=2026-01-01&end_date=2026-12-31", headers=headers)
        assert response.status_code == 200, f"Failed to get stats: {response.text}"
        data = response.json()
        assert "total_sales" in data
        assert "total_orders" in data
        print(f"PASSED: Get report stats - total_sales: {data['total_sales']}, total_orders: {data['total_orders']}")
    
    def test_generate_pdf_report(self, admin_token):
        """Should generate PDF report"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(f"{BASE_URL}/api/reports/generate", headers=headers, json={
            "start_date": "2026-01-01",
            "end_date": "2026-12-31"
        })
        assert response.status_code == 200, f"Failed to generate PDF: {response.text}"
        assert response.headers.get("content-type") == "application/pdf"
        print(f"PASSED: Generate PDF report - size: {len(response.content)} bytes")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
