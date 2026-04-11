"""
Iteration 31: Modular SaaS Architecture & Workforce Module Tests
Tests feature flags, require_feature() guards, and workforce UI endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
PLATFORM_OWNER = {"username": "platform_owner", "password": "admin123"}
SKADMIN = {"username": "SKAdmin", "password": "saswata@123"}
STAFF_USER = {"username": "user", "password": "user123"}

class TestAuthWithFeatures:
    """Test that login returns features in response"""
    
    def test_platform_owner_login_returns_features(self):
        """Platform owner login should return all features enabled"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "features" in data, "Features not in login response"
        assert data["role"] == "platform_owner"
        # Platform owner should have all features
        features = data.get("features", {})
        print(f"Platform owner features: {features}")
    
    def test_skadmin_login_returns_features(self):
        """SKAdmin login should return restaurant features"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SKADMIN)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "features" in data, "Features not in login response"
        assert data["role"] == "admin"
        assert data["restaurant_id"] == "rest_demo_1"
        features = data.get("features", {})
        print(f"SKAdmin features: {features}")
        # rest_demo_1 should have workforce enabled
        assert features.get("workforce") == True, "Workforce should be enabled for rest_demo_1"
        assert features.get("pos") == True, "POS should be enabled"
    
    def test_auth_features_endpoint(self):
        """GET /api/auth/features should return current user's features"""
        # Login first
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json=SKADMIN)
        token = login_resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/auth/features", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "features" in data
        print(f"Auth features endpoint: {data}")


class TestRestaurantFeatureManagement:
    """Test platform owner can toggle features on restaurants"""
    
    @pytest.fixture
    def platform_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER)
        return response.json().get("access_token")
    
    def test_get_restaurants_shows_features(self, platform_token):
        """GET /api/restaurants should include features for each restaurant"""
        headers = {"Authorization": f"Bearer {platform_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurants", headers=headers)
        assert response.status_code == 200
        restaurants = response.json()
        assert len(restaurants) > 0, "No restaurants found"
        
        # Find rest_demo_1
        demo_rest = next((r for r in restaurants if r["id"] == "rest_demo_1"), None)
        assert demo_rest is not None, "rest_demo_1 not found"
        assert "features" in demo_rest, "Features not in restaurant data"
        print(f"rest_demo_1 features: {demo_rest.get('features')}")
    
    def test_update_restaurant_features(self, platform_token):
        """PUT /api/restaurants/{id}/features should update features"""
        headers = {"Authorization": f"Bearer {platform_token}"}
        
        # First get current features
        response = requests.get(f"{BASE_URL}/api/restaurants", headers=headers)
        restaurants = response.json()
        demo_rest = next((r for r in restaurants if r["id"] == "rest_demo_1"), None)
        original_features = demo_rest.get("features", {})
        print(f"Original features: {original_features}")
        
        # Update features - ensure workforce is enabled
        new_features = {"pos": True, "kds": True, "qr_ordering": True, "workforce": True}
        response = requests.put(
            f"{BASE_URL}/api/restaurants/rest_demo_1/features",
            json=new_features,
            headers=headers
        )
        assert response.status_code == 200, f"Failed to update features: {response.text}"
        data = response.json()
        assert data.get("features") == new_features
        print(f"Updated features: {data.get('features')}")


class TestFeatureGuards:
    """Test require_feature() guards on workforce endpoints"""
    
    @pytest.fixture
    def skadmin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SKADMIN)
        return response.json().get("access_token")
    
    @pytest.fixture
    def platform_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER)
        return response.json().get("access_token")
    
    def test_shifts_accessible_when_workforce_enabled(self, skadmin_token):
        """GET /api/shifts should work when workforce is enabled"""
        headers = {"Authorization": f"Bearer {skadmin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/shifts?start_date=2026-04-06&end_date=2026-04-12",
            headers=headers
        )
        assert response.status_code == 200, f"Shifts API failed: {response.text}"
        print(f"Shifts response: {response.json()}")
    
    def test_attendance_accessible_when_workforce_enabled(self, skadmin_token):
        """GET /api/attendance should work when workforce is enabled"""
        headers = {"Authorization": f"Bearer {skadmin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/attendance?start_date=2026-04-01&end_date=2026-04-11",
            headers=headers
        )
        assert response.status_code == 200, f"Attendance API failed: {response.text}"
        print(f"Attendance response: {response.json()}")
    
    def test_attendance_live_accessible(self, skadmin_token):
        """GET /api/attendance/live should work for admin"""
        headers = {"Authorization": f"Bearer {skadmin_token}"}
        response = requests.get(f"{BASE_URL}/api/attendance/live", headers=headers)
        assert response.status_code == 200, f"Live attendance failed: {response.text}"
        print(f"Live attendance: {response.json()}")
    
    def test_timesheets_accessible_when_workforce_enabled(self, skadmin_token):
        """GET /api/timesheets/summary should work when workforce is enabled"""
        headers = {"Authorization": f"Bearer {skadmin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/timesheets/summary?start_date=2026-04-06&end_date=2026-04-12",
            headers=headers
        )
        assert response.status_code == 200, f"Timesheets API failed: {response.text}"
        print(f"Timesheets response: {response.json()}")
    
    def test_payroll_accessible_when_workforce_enabled(self, skadmin_token):
        """GET /api/payroll/report should work when workforce is enabled"""
        headers = {"Authorization": f"Bearer {skadmin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/payroll/report?start_date=2026-04-06&end_date=2026-04-12",
            headers=headers
        )
        assert response.status_code == 200, f"Payroll API failed: {response.text}"
        print(f"Payroll response: {response.json()}")
    
    def test_efficiency_accessible_when_workforce_enabled(self, skadmin_token):
        """GET /api/analytics/efficiency should work when workforce is enabled"""
        headers = {"Authorization": f"Bearer {skadmin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/analytics/efficiency?start_date=2026-04-06&end_date=2026-04-12",
            headers=headers
        )
        assert response.status_code == 200, f"Efficiency API failed: {response.text}"
        print(f"Efficiency response: {response.json()}")


class TestShiftCRUD:
    """Test shift CRUD operations"""
    
    @pytest.fixture
    def skadmin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SKADMIN)
        return response.json().get("access_token")
    
    def test_create_shift(self, skadmin_token):
        """POST /api/shifts should create a new shift"""
        headers = {"Authorization": f"Bearer {skadmin_token}"}
        
        # First get staff list
        staff_resp = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=headers)
        staff_list = staff_resp.json()
        if not staff_list:
            pytest.skip("No staff members to create shift for")
        
        staff_id = staff_list[0]["id"]
        shift_data = {
            "staff_id": staff_id,
            "date": "2026-04-15",
            "start_time": "09:00",
            "end_time": "17:00",
            "position": "Server",
            "note": "Test shift from iteration 31"
        }
        
        response = requests.post(f"{BASE_URL}/api/shifts", json=shift_data, headers=headers)
        assert response.status_code == 200, f"Create shift failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["staff_id"] == staff_id
        assert data["date"] == "2026-04-15"
        print(f"Created shift: {data}")
        
        # Store shift ID for cleanup
        self.__class__.created_shift_id = data["id"]
    
    def test_get_shifts_for_week(self, skadmin_token):
        """GET /api/shifts should return shifts for date range"""
        headers = {"Authorization": f"Bearer {skadmin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/shifts?start_date=2026-04-13&end_date=2026-04-19",
            headers=headers
        )
        assert response.status_code == 200
        shifts = response.json()
        print(f"Shifts for week: {len(shifts)} shifts found")
    
    def test_delete_shift(self, skadmin_token):
        """DELETE /api/shifts/{id} should delete a shift"""
        headers = {"Authorization": f"Bearer {skadmin_token}"}
        
        shift_id = getattr(self.__class__, 'created_shift_id', None)
        if not shift_id:
            pytest.skip("No shift to delete")
        
        response = requests.delete(f"{BASE_URL}/api/shifts/{shift_id}", headers=headers)
        assert response.status_code == 200, f"Delete shift failed: {response.text}"
        print(f"Deleted shift: {shift_id}")


class TestFeatureGuardDisabled:
    """Test that workforce endpoints return 403 when feature is disabled"""
    
    @pytest.fixture
    def platform_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER)
        return response.json().get("access_token")
    
    def test_disable_workforce_and_verify_403(self, platform_token):
        """Disable workforce and verify shifts API returns 403"""
        headers = {"Authorization": f"Bearer {platform_token}"}
        
        # Disable workforce for rest_demo_1
        disabled_features = {"pos": True, "kds": True, "qr_ordering": True, "workforce": False}
        response = requests.put(
            f"{BASE_URL}/api/restaurants/rest_demo_1/features",
            json=disabled_features,
            headers=headers
        )
        assert response.status_code == 200, f"Failed to disable workforce: {response.text}"
        print("Workforce disabled for rest_demo_1")
        
        # Now login as SKAdmin and try to access shifts
        skadmin_resp = requests.post(f"{BASE_URL}/api/auth/login", json=SKADMIN)
        skadmin_token = skadmin_resp.json().get("access_token")
        skadmin_headers = {"Authorization": f"Bearer {skadmin_token}"}
        
        shifts_resp = requests.get(
            f"{BASE_URL}/api/shifts?start_date=2026-04-06&end_date=2026-04-12",
            headers=skadmin_headers
        )
        assert shifts_resp.status_code == 403, f"Expected 403, got {shifts_resp.status_code}: {shifts_resp.text}"
        print(f"Correctly got 403: {shifts_resp.json()}")
        
        # Re-enable workforce
        enabled_features = {"pos": True, "kds": True, "qr_ordering": True, "workforce": True}
        response = requests.put(
            f"{BASE_URL}/api/restaurants/rest_demo_1/features",
            json=enabled_features,
            headers=headers
        )
        assert response.status_code == 200
        print("Workforce re-enabled for rest_demo_1")


class TestPOSFunctionality:
    """Verify existing POS functionality still works"""
    
    @pytest.fixture
    def skadmin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SKADMIN)
        return response.json().get("access_token")
    
    def test_products_api(self, skadmin_token):
        """GET /api/products should work"""
        headers = {"Authorization": f"Bearer {skadmin_token}"}
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        assert response.status_code == 200
        print(f"Products: {len(response.json())} items")
    
    def test_categories_api(self, skadmin_token):
        """GET /api/categories should work"""
        headers = {"Authorization": f"Bearer {skadmin_token}"}
        response = requests.get(f"{BASE_URL}/api/categories", headers=headers)
        assert response.status_code == 200
        print(f"Categories: {len(response.json())} items")
    
    def test_orders_api(self, skadmin_token):
        """GET /api/orders should work"""
        headers = {"Authorization": f"Bearer {skadmin_token}"}
        response = requests.get(f"{BASE_URL}/api/orders?today_only=true", headers=headers)
        assert response.status_code == 200
        print(f"Today's orders: {len(response.json())} orders")
    
    def test_tables_api(self, skadmin_token):
        """GET /api/tables should work"""
        headers = {"Authorization": f"Bearer {skadmin_token}"}
        response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        assert response.status_code == 200
        print(f"Tables: {len(response.json())} tables")


class TestStaffAlwaysVisible:
    """Test that Staff nav item is always visible (Core - always on)"""
    
    @pytest.fixture
    def skadmin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SKADMIN)
        return response.json().get("access_token")
    
    def test_staff_api_always_accessible(self, skadmin_token):
        """GET /api/restaurant/staff should always work regardless of features"""
        headers = {"Authorization": f"Bearer {skadmin_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=headers)
        assert response.status_code == 200, f"Staff API failed: {response.text}"
        staff = response.json()
        print(f"Staff members: {len(staff)}")
        for s in staff:
            print(f"  - {s.get('username')} ({s.get('role')})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
