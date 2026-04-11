"""
Iteration 30 Tests: Daily Revenue Widget & SKAdmin Account
Tests:
1. SKAdmin login with production credentials
2. Weekly trend API returns 7 days of data
3. Today stats API returns revenue breakdown
4. All sidebar navigation endpoints accessible
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSKAdminLogin:
    """Test SKAdmin production account login"""
    
    def test_skadmin_login_success(self):
        """SKAdmin should login successfully with saswata@123"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "SKAdmin",
            "password": "saswata@123"
        })
        print(f"SKAdmin login response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Missing access_token in response"
        assert data.get("role") == "admin", f"Expected admin role, got {data.get('role')}"
        assert data.get("restaurant_id") == "rest_demo_1", f"Expected rest_demo_1, got {data.get('restaurant_id')}"
        print(f"SKAdmin login successful: role={data.get('role')}, restaurant_id={data.get('restaurant_id')}")
        return data["access_token"]


class TestWeeklyTrendAPI:
    """Test the weekly trend endpoint for revenue widget"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "SKAdmin",
            "password": "saswata@123"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("SKAdmin login failed")
    
    def test_weekly_trend_returns_7_days(self, admin_token):
        """Weekly trend should return exactly 7 days of data"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/reports/weekly-trend", headers=headers)
        
        print(f"Weekly trend response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "days" in data, "Missing 'days' key in response"
        assert len(data["days"]) == 7, f"Expected 7 days, got {len(data['days'])}"
        
        # Verify each day has required fields
        for day in data["days"]:
            assert "date" in day, "Missing 'date' in day data"
            assert "label" in day, "Missing 'label' in day data"
            assert "total" in day, "Missing 'total' in day data"
            assert "cash" in day, "Missing 'cash' in day data"
            assert "card" in day, "Missing 'card' in day data"
            assert "orders" in day, "Missing 'orders' in day data"
        
        print(f"Weekly trend data: {data['days']}")
        return data
    
    def test_weekly_trend_requires_auth(self):
        """Weekly trend should require authentication"""
        response = requests.get(f"{BASE_URL}/api/reports/weekly-trend")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestTodayStatsAPI:
    """Test today's stats endpoint for dashboard"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "SKAdmin",
            "password": "saswata@123"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("SKAdmin login failed")
    
    def test_today_stats_returns_revenue_breakdown(self, admin_token):
        """Today stats should return cash/card breakdown"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/reports/today", headers=headers)
        
        print(f"Today stats response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify required fields for revenue widget
        assert "total_sales" in data, "Missing 'total_sales'"
        assert "cash_total" in data, "Missing 'cash_total'"
        assert "card_total" in data, "Missing 'card_total'"
        assert "total_orders" in data, "Missing 'total_orders'"
        assert "avg_order_value" in data, "Missing 'avg_order_value'"
        assert "pos_orders" in data, "Missing 'pos_orders'"
        assert "qr_orders" in data, "Missing 'qr_orders'"
        assert "open_tables" in data, "Missing 'open_tables'"
        assert "total_tables" in data, "Missing 'total_tables'"
        assert "hourly_revenue" in data, "Missing 'hourly_revenue'"
        
        print(f"Today stats: total_sales={data['total_sales']}, cash={data['cash_total']}, card={data['card_total']}")
        return data


class TestSidebarNavigationEndpoints:
    """Test all sidebar navigation endpoints are accessible"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "SKAdmin",
            "password": "saswata@123"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("SKAdmin login failed")
    
    def test_products_endpoint(self, admin_token):
        """Products endpoint for POS Terminal"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        print(f"Products: {response.status_code}")
        assert response.status_code == 200, f"Products failed: {response.text}"
    
    def test_categories_endpoint(self, admin_token):
        """Categories endpoint for Menu Management"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/categories", headers=headers)
        print(f"Categories: {response.status_code}")
        assert response.status_code == 200, f"Categories failed: {response.text}"
    
    def test_orders_endpoint(self, admin_token):
        """Orders endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/orders", headers=headers)
        print(f"Orders: {response.status_code}")
        assert response.status_code == 200, f"Orders failed: {response.text}"
    
    def test_tables_endpoint(self, admin_token):
        """Tables endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        print(f"Tables: {response.status_code}")
        assert response.status_code == 200, f"Tables failed: {response.text}"
    
    def test_kds_stats_endpoint(self, admin_token):
        """KDS stats endpoint for Kitchen"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/kds/stats", headers=headers)
        print(f"KDS stats: {response.status_code}")
        assert response.status_code == 200, f"KDS stats failed: {response.text}"
    
    def test_cash_drawer_current(self, admin_token):
        """Cash drawer current endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/cash-drawer/current", headers=headers)
        print(f"Cash drawer: {response.status_code}")
        # May return 404 if no drawer open, which is acceptable
        assert response.status_code in [200, 404], f"Cash drawer failed: {response.text}"
    
    def test_printers_endpoint(self, admin_token):
        """Printers endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/printers", headers=headers)
        print(f"Printers: {response.status_code}")
        assert response.status_code == 200, f"Printers failed: {response.text}"
    
    def test_staff_endpoint(self, admin_token):
        """Staff endpoint for Settings > User Management"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=headers)
        print(f"Staff: {response.status_code}")
        assert response.status_code == 200, f"Staff failed: {response.text}"
        
        # Verify staff list includes has_pos_pin flag
        data = response.json()
        if len(data) > 0:
            assert "has_pos_pin" in data[0], "Staff should have has_pos_pin flag"
    
    def test_restaurant_my_endpoint(self, admin_token):
        """Restaurant settings endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurants/my", headers=headers)
        print(f"Restaurant my: {response.status_code}")
        assert response.status_code == 200, f"Restaurant my failed: {response.text}"
    
    def test_subscription_my_endpoint(self, admin_token):
        """Subscription endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/subscriptions/my", headers=headers)
        print(f"Subscription my: {response.status_code}")
        # May return 404 if no subscription, which is acceptable
        assert response.status_code in [200, 404], f"Subscription failed: {response.text}"


class TestOtherCredentials:
    """Test other login credentials from test_credentials.md"""
    
    def test_platform_owner_login(self):
        """Platform owner should login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "admin123"
        })
        print(f"Platform owner login: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("role") == "platform_owner"
    
    def test_restaurant_admin_login(self):
        """Restaurant admin should login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        print(f"Restaurant admin login: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("role") == "admin"
    
    def test_staff_user_login(self):
        """Staff user should login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "user",
            "password": "user123"
        })
        print(f"Staff user login: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("role") == "user"
