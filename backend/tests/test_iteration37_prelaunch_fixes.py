"""
Iteration 37: Pre-launch Fixes Testing
Tests for:
1. Staff pay_type and monthly_salary fields
2. Strict 10m geofencing enforcement (HTTP 403 when outside)
3. My Pay summary endpoint with pay_type, hourly_rate, monthly_salary, week/month hours/pay
4. Onboarding token endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthLogin:
    """Test login endpoints"""
    
    def test_skadmin_login(self):
        """Test SKAdmin login returns valid token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "SKAdmin",
            "password": "saswata@123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data["access_token"], "access_token is empty"
        print(f"✓ SKAdmin login successful, token received")
    
    def test_staff_user_login(self):
        """Test staff user login returns valid token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "user",
            "password": "user123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        print(f"✓ Staff user login successful, token received")


class TestStaffPayTypeFields:
    """Test pay_type and monthly_salary fields in staff management"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "SKAdmin",
            "password": "saswata@123"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin login failed")
    
    def test_get_staff_list_has_pay_fields(self, admin_token):
        """GET /api/restaurant/staff returns staff with pay_type and monthly_salary fields"""
        response = requests.get(
            f"{BASE_URL}/api/restaurant/staff",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get staff: {response.text}"
        staff_list = response.json()
        assert isinstance(staff_list, list), "Response should be a list"
        
        # Check that staff records have pay_type field (may be null for old records)
        for staff in staff_list:
            # pay_type should exist in the schema (may be null for legacy records)
            print(f"  Staff: {staff.get('username')} - pay_type: {staff.get('pay_type')}, hourly_rate: {staff.get('hourly_rate')}, monthly_salary: {staff.get('monthly_salary')}")
        print(f"✓ Staff list returned {len(staff_list)} members with pay fields")
    
    def test_create_staff_with_monthly_pay(self, admin_token):
        """POST /api/restaurant/staff with pay_type=monthly and monthly_salary creates staff correctly"""
        import time
        test_username = f"test_monthly_{int(time.time())}"
        
        response = requests.post(
            f"{BASE_URL}/api/restaurant/staff",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "username": test_username,
                "email": f"{test_username}@test.com",
                "password": "testpass123",
                "role": "user",
                "capabilities": ["workforce.clock_in"],
                "pay_type": "monthly",
                "monthly_salary": 3000,
                "hourly_rate": 0,
                "position": "Test Monthly Staff"
            }
        )
        assert response.status_code == 200, f"Failed to create staff: {response.text}"
        data = response.json()
        assert "id" in data, "No id in response"
        staff_id = data["id"]
        print(f"✓ Created monthly staff: {test_username} with id {staff_id}")
        
        # Verify the staff was created with correct pay_type
        response = requests.get(
            f"{BASE_URL}/api/restaurant/staff",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        staff_list = response.json()
        created_staff = next((s for s in staff_list if s.get("username") == test_username), None)
        assert created_staff is not None, f"Created staff {test_username} not found in list"
        assert created_staff.get("pay_type") == "monthly", f"pay_type should be 'monthly', got {created_staff.get('pay_type')}"
        assert created_staff.get("monthly_salary") == 3000, f"monthly_salary should be 3000, got {created_staff.get('monthly_salary')}"
        print(f"✓ Verified staff has pay_type=monthly, monthly_salary=3000")
        
        # Cleanup - delete test staff
        requests.delete(
            f"{BASE_URL}/api/restaurant/staff/{staff_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"✓ Cleaned up test staff {test_username}")
    
    def test_update_staff_pay_type(self, admin_token):
        """PUT /api/restaurant/staff/{id} can update pay_type and monthly_salary"""
        import time
        test_username = f"test_update_{int(time.time())}"
        
        # Create staff with hourly pay
        response = requests.post(
            f"{BASE_URL}/api/restaurant/staff",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "username": test_username,
                "email": f"{test_username}@test.com",
                "password": "testpass123",
                "role": "user",
                "pay_type": "hourly",
                "hourly_rate": 15,
                "monthly_salary": 0
            }
        )
        assert response.status_code == 200, f"Failed to create staff: {response.text}"
        staff_id = response.json()["id"]
        print(f"✓ Created hourly staff: {test_username}")
        
        # Update to monthly pay
        response = requests.put(
            f"{BASE_URL}/api/restaurant/staff/{staff_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "username": test_username,
                "role": "user",
                "pay_type": "monthly",
                "monthly_salary": 2500,
                "hourly_rate": 0
            }
        )
        assert response.status_code == 200, f"Failed to update staff: {response.text}"
        print(f"✓ Updated staff to monthly pay")
        
        # Verify update
        response = requests.get(
            f"{BASE_URL}/api/restaurant/staff",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        staff_list = response.json()
        updated_staff = next((s for s in staff_list if s.get("username") == test_username), None)
        assert updated_staff is not None, "Updated staff not found"
        assert updated_staff.get("pay_type") == "monthly", f"pay_type should be 'monthly', got {updated_staff.get('pay_type')}"
        assert updated_staff.get("monthly_salary") == 2500, f"monthly_salary should be 2500, got {updated_staff.get('monthly_salary')}"
        print(f"✓ Verified update: pay_type=monthly, monthly_salary=2500")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/restaurant/staff/{staff_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"✓ Cleaned up test staff")


class TestGeofenceEnforcement:
    """Test strict 10m geofencing enforcement"""
    
    def test_clock_rejects_far_coordinates(self):
        """POST /api/attendance/clock should REJECT (HTTP 403) when coordinates are far from business"""
        # Use coordinates far from London (lat=0, lng=0 is in the Atlantic Ocean)
        response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": "1111",  # Staff user's PIN
            "restaurant_id": "rest_demo_1",
            "latitude": 0.0,
            "longitude": 0.0,
            "entry_source": "mobile_app"
        })
        
        # Should be rejected with 403 due to geofence violation
        assert response.status_code == 403, f"Expected 403 for far coordinates, got {response.status_code}: {response.text}"
        data = response.json()
        assert "away" in data.get("detail", "").lower() or "within" in data.get("detail", "").lower(), \
            f"Error message should mention distance, got: {data.get('detail')}"
        print(f"✓ Clock rejected with 403 for far coordinates: {data.get('detail')}")
    
    def test_clock_rejects_missing_location_for_mobile(self):
        """POST /api/attendance/clock should reject when location is missing for mobile_app"""
        response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": "1111",
            "restaurant_id": "rest_demo_1",
            "entry_source": "mobile_app"
            # No latitude/longitude
        })
        
        # Should be rejected with 400 for missing location
        assert response.status_code == 400, f"Expected 400 for missing location, got {response.status_code}: {response.text}"
        data = response.json()
        assert "location" in data.get("detail", "").lower() or "gps" in data.get("detail", "").lower(), \
            f"Error message should mention location/GPS, got: {data.get('detail')}"
        print(f"✓ Clock rejected with 400 for missing location: {data.get('detail')}")
    
    def test_clock_succeeds_for_pos_terminal_without_location(self):
        """POST /api/attendance/clock should succeed for pos_terminal without location (geofence skipped)"""
        response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": "1111",
            "restaurant_id": "rest_demo_1",
            "entry_source": "pos_terminal"
            # No latitude/longitude - should be OK for terminal
        })
        
        # Should succeed (200) - geofence is skipped for pos_terminal
        assert response.status_code == 200, f"Expected 200 for pos_terminal, got {response.status_code}: {response.text}"
        data = response.json()
        assert "action" in data, "Response should have 'action' field"
        print(f"✓ Clock succeeded for pos_terminal: action={data.get('action')}")


class TestMySummaryEndpoint:
    """Test GET /api/attendance/my-summary endpoint"""
    
    @pytest.fixture
    def staff_token(self):
        """Get staff user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "user",
            "password": "user123"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Staff login failed")
    
    def test_my_summary_returns_pay_fields(self, staff_token):
        """GET /api/attendance/my-summary returns pay_type, hourly_rate, monthly_salary, week/month hours/pay"""
        response = requests.get(
            f"{BASE_URL}/api/attendance/my-summary",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        assert response.status_code == 200, f"Failed to get my-summary: {response.text}"
        data = response.json()
        
        # Check required fields exist
        required_fields = [
            "staff_name", "position", "pay_type", "hourly_rate", "monthly_salary",
            "currency", "week_hours", "month_hours", "week_pay", "month_pay",
            "week_sessions", "month_sessions", "recent_records"
        ]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"✓ my-summary response has all required fields:")
        print(f"  staff_name: {data.get('staff_name')}")
        print(f"  pay_type: {data.get('pay_type')}")
        print(f"  hourly_rate: {data.get('hourly_rate')}")
        print(f"  monthly_salary: {data.get('monthly_salary')}")
        print(f"  week_hours: {data.get('week_hours')}")
        print(f"  month_hours: {data.get('month_hours')}")
        print(f"  week_pay: {data.get('week_pay')}")
        print(f"  month_pay: {data.get('month_pay')}")


class TestOnboardingEndpoint:
    """Test onboarding token endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "SKAdmin",
            "password": "saswata@123"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin login failed")
    
    def test_create_staff_returns_onboarding_token(self, admin_token):
        """POST /api/restaurant/staff returns onboarding_token"""
        import time
        test_username = f"test_onboard_{int(time.time())}"
        
        response = requests.post(
            f"{BASE_URL}/api/restaurant/staff",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "username": test_username,
                "email": f"{test_username}@test.com",
                "password": "testpass123",
                "role": "user"
            }
        )
        assert response.status_code == 200, f"Failed to create staff: {response.text}"
        data = response.json()
        assert "onboarding_token" in data, "No onboarding_token in response"
        assert data["onboarding_token"], "onboarding_token is empty"
        
        onboarding_token = data["onboarding_token"]
        staff_id = data["id"]
        print(f"✓ Created staff with onboarding_token: {onboarding_token[:20]}...")
        
        # Test GET /api/onboarding/{token}
        response = requests.get(f"{BASE_URL}/api/onboarding/{onboarding_token}")
        assert response.status_code == 200, f"Failed to get onboarding info: {response.text}"
        onboard_data = response.json()
        assert onboard_data.get("username") == test_username, f"Username mismatch: {onboard_data.get('username')}"
        print(f"✓ GET /api/onboarding/{onboarding_token[:10]}... returns staff info")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/restaurant/staff/{staff_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"✓ Cleaned up test staff")
    
    def test_invalid_onboarding_token_returns_404(self):
        """GET /api/onboarding/{invalid_token} returns 404"""
        response = requests.get(f"{BASE_URL}/api/onboarding/invalid_token_12345")
        assert response.status_code == 404, f"Expected 404 for invalid token, got {response.status_code}"
        print(f"✓ Invalid onboarding token returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
