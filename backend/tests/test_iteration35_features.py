"""
Iteration 35 Tests: 5 Changes Verification
1. Remove redundant Staff page from sidebar (staff management in Settings)
2. Hide Audit Log when only Workforce module is enabled
3. Fix blank page when workforce-only staff logs in (smart-routing to /heva-ops)
4. Add adaptive Workforce Dashboard widgets alongside POS widgets
5. Only show floating clock-in button on relevant pages
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthAndRouting:
    """Test authentication and smart routing based on features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_skadmin_login_returns_features(self):
        """SKAdmin login should return user with features object"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "SKAdmin",
            "password": "saswata@123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        # API returns data at root level, not nested under "user"
        assert data["role"] == "admin"
        # Verify features are returned
        assert "features" in data
        features = data["features"]
        assert features.get("pos") == True
        assert features.get("workforce") == True
        print(f"SKAdmin features: {features}")
    
    def test_staff_pin_login_returns_features(self):
        """Staff PIN login should return user with features for smart routing"""
        response = self.session.post(f"{BASE_URL}/api/auth/pin-login", json={
            "pin": "1111",
            "restaurant_id": "rest_demo_1"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        # API returns data at root level
        assert data["role"] == "user"
        # Features should be present for smart routing
        features = data.get("features", {})
        print(f"Staff user features: {features}")
        # rest_demo_1 has POS enabled, so staff should have pos feature
        assert features.get("pos") == True or features.get("workforce") == True


class TestWorkforceDashboardStats:
    """Test the new /api/attendance/dashboard-stats endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as SKAdmin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "SKAdmin",
            "password": "saswata@123"
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_dashboard_stats_endpoint_exists(self):
        """GET /api/attendance/dashboard-stats should return workforce stats"""
        response = self.session.get(f"{BASE_URL}/api/attendance/dashboard-stats")
        assert response.status_code == 200
        data = response.json()
        
        # Verify expected fields
        assert "scheduled_shifts" in data
        assert "clocked_in_count" in data
        assert "clocked_in_staff" in data
        assert "completed_sessions" in data
        assert "total_hours_today" in data
        assert "total_staff" in data
        assert "shifts" in data
        
        print(f"Dashboard stats: {data}")
    
    def test_dashboard_stats_returns_correct_types(self):
        """Dashboard stats should return correct data types"""
        response = self.session.get(f"{BASE_URL}/api/attendance/dashboard-stats")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data["scheduled_shifts"], int)
        assert isinstance(data["clocked_in_count"], int)
        assert isinstance(data["clocked_in_staff"], list)
        assert isinstance(data["completed_sessions"], int)
        assert isinstance(data["total_hours_today"], (int, float))
        assert isinstance(data["total_staff"], int)
        assert isinstance(data["shifts"], list)
    
    def test_dashboard_stats_clocked_in_staff_format(self):
        """Clocked in staff should have name and since fields"""
        response = self.session.get(f"{BASE_URL}/api/attendance/dashboard-stats")
        assert response.status_code == 200
        data = response.json()
        
        # If there are clocked in staff, verify format
        for staff in data["clocked_in_staff"]:
            assert "name" in staff
            assert "since" in staff


class TestSidebarConditionalItems:
    """Test that sidebar items are conditional based on features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_restaurant_features_include_pos_kds_qr_workforce(self):
        """rest_demo_1 should have all modules enabled"""
        # Login as SKAdmin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "SKAdmin",
            "password": "saswata@123"
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get restaurant info
        response = self.session.get(f"{BASE_URL}/api/restaurants/my")
        assert response.status_code == 200
        data = response.json()
        
        features = data.get("features", {})
        print(f"Restaurant features: {features}")
        
        # rest_demo_1 should have all modules
        assert features.get("pos") == True
        assert features.get("kds") == True
        assert features.get("qr_ordering") == True
        assert features.get("workforce") == True


class TestSettingsEndpoints:
    """Test Settings page related endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as SKAdmin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "SKAdmin",
            "password": "saswata@123"
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_staff_list_endpoint(self):
        """GET /api/restaurant/staff should return staff list"""
        response = self.session.get(f"{BASE_URL}/api/restaurant/staff")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Staff count: {len(data)}")
        
        # Verify staff have expected fields
        if len(data) > 0:
            staff = data[0]
            assert "id" in staff
            assert "username" in staff
            assert "role" in staff


class TestPOSStatsEndpoints:
    """Test POS dashboard stats endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as SKAdmin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "SKAdmin",
            "password": "saswata@123"
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_today_stats_endpoint(self):
        """GET /api/reports/today should return POS stats"""
        response = self.session.get(f"{BASE_URL}/api/reports/today")
        assert response.status_code == 200
        data = response.json()
        
        # Verify expected POS stats fields
        assert "total_sales" in data
        assert "total_orders" in data
        print(f"Today's sales: {data.get('total_sales')}, orders: {data.get('total_orders')}")
    
    def test_weekly_trend_endpoint(self):
        """GET /api/reports/weekly-trend should return weekly data"""
        response = self.session.get(f"{BASE_URL}/api/reports/weekly-trend")
        assert response.status_code == 200
        data = response.json()
        
        assert "days" in data
        assert isinstance(data["days"], list)
        print(f"Weekly trend days: {len(data['days'])}")


class TestFloatingClockButtonLogic:
    """Test attendance endpoints used by floating clock button"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as SKAdmin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "SKAdmin",
            "password": "saswata@123"
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_my_status_endpoint(self):
        """GET /api/attendance/my-status should return clock status"""
        response = self.session.get(f"{BASE_URL}/api/attendance/my-status")
        assert response.status_code == 200
        data = response.json()
        
        assert "clocked_in" in data
        assert isinstance(data["clocked_in"], bool)
        print(f"Clock status: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
