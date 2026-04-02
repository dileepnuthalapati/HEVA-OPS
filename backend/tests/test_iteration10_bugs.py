"""
Test file for Iteration 10 - Testing 6 user-reported bugs:
1) Cash/Card totals showing 00 in reports
2) User Management tab not showing existing users + can't add new users
3) $ symbol still on POS screen (should use Banknote icon)
4) Offline warning not showing on login page
5) Order history not resetting with daily stats (2AM business day)
6) Reports missing Today/7d/30d/90d quick range buttons + PDF not saving to device
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthentication:
    """Test login for all user types"""
    
    def test_platform_owner_login(self):
        """Platform owner login should work and redirect to /platform/dashboard"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "platform_owner"
        print("PASSED: Platform owner login works")
        return data["access_token"]
    
    def test_restaurant_admin_login(self):
        """Restaurant admin login should work and redirect to /dashboard"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print("PASSED: Restaurant admin login works")
        return data["access_token"]


class TestStaffManagement:
    """Test User Management (renamed from Staff Management) - Bug #2"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_staff_list(self, admin_token):
        """GET /api/restaurant/staff should return list of users"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=headers)
        assert response.status_code == 200, f"Failed to get staff: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASSED: Staff list returned {len(data)} users")
        return data
    
    def test_staff_response_excludes_password(self, admin_token):
        """Staff endpoint should NOT return password or password_hash fields (security fix)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=headers)
        assert response.status_code == 200
        data = response.json()
        for staff in data:
            assert "password" not in staff, f"Password field exposed for user {staff.get('username')}"
            assert "password_hash" not in staff, f"Password_hash field exposed for user {staff.get('username')}"
        print("PASSED: Staff endpoint excludes password fields")
    
    def test_create_staff_user(self, admin_token):
        """POST /api/restaurant/staff should create a new user"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        test_username = f"TEST_user_{datetime.now().timestamp()}"
        response = requests.post(f"{BASE_URL}/api/restaurant/staff", headers=headers, json={
            "username": test_username,
            "password": "testpass123",
            "role": "user"
        })
        assert response.status_code in [200, 201], f"Failed to create staff: {response.text}"
        data = response.json()
        # Verify user was created
        assert "id" in data or "username" in data, f"Response missing id/username: {data}"
        print(f"PASSED: Created staff user {test_username}")
        
        # Cleanup - delete the test user
        if "id" in data:
            requests.delete(f"{BASE_URL}/api/restaurant/staff/{data['id']}", headers=headers)


class TestOrdersDateFiltering:
    """Test Order History date filtering - Bug #5 (2AM business day reset)"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_orders_today_only_param(self, admin_token):
        """GET /api/orders?today_only=true should filter to today's business day"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/orders?today_only=true", headers=headers)
        assert response.status_code == 200, f"Failed to get orders: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASSED: Orders with today_only=true returned {len(data)} orders")
    
    def test_orders_date_range_params(self, admin_token):
        """GET /api/orders with from_date and to_date should filter correctly"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        today = datetime.now().strftime("%Y-%m-%d")
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/orders?from_date={week_ago}&to_date={today}", 
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get orders: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASSED: Orders with date range returned {len(data)} orders")


class TestReportsStats:
    """Test Reports page stats - Bug #1 (Cash/Card totals showing 00)"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_report_stats_has_cash_card_totals(self, admin_token):
        """GET /api/reports/stats should return cash_total and card_total"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        today = datetime.now().strftime("%Y-%m-%d")
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/reports/stats?start_date={week_ago}&end_date={today}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get stats: {response.text}"
        data = response.json()
        
        # Verify cash_total and card_total fields exist
        assert "cash_total" in data, f"Missing cash_total in response: {data}"
        assert "card_total" in data, f"Missing card_total in response: {data}"
        assert "total_sales" in data, f"Missing total_sales in response: {data}"
        assert "total_orders" in data, f"Missing total_orders in response: {data}"
        
        # Verify they are numbers (not strings or None)
        assert isinstance(data["cash_total"], (int, float)), f"cash_total should be number: {data['cash_total']}"
        assert isinstance(data["card_total"], (int, float)), f"card_total should be number: {data['card_total']}"
        
        print(f"PASSED: Report stats - cash_total={data['cash_total']}, card_total={data['card_total']}")
    
    def test_today_stats_has_cash_card_totals(self, admin_token):
        """GET /api/reports/today should return cash_total and card_total"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/reports/today", headers=headers)
        assert response.status_code == 200, f"Failed to get today stats: {response.text}"
        data = response.json()
        
        assert "cash_total" in data, f"Missing cash_total in response: {data}"
        assert "card_total" in data, f"Missing card_total in response: {data}"
        
        print(f"PASSED: Today stats - cash_total={data['cash_total']}, card_total={data['card_total']}")


class TestQuickRangeReports:
    """Test Reports quick range buttons - Bug #6"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_today_range(self, admin_token):
        """Test Today range (0 days)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        today = datetime.now().strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/reports/stats?start_date={today}&end_date={today}",
            headers=headers
        )
        assert response.status_code == 200, f"Today range failed: {response.text}"
        print("PASSED: Today range works")
    
    def test_7_days_range(self, admin_token):
        """Test 7 Days range"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        today = datetime.now().strftime("%Y-%m-%d")
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/reports/stats?start_date={week_ago}&end_date={today}",
            headers=headers
        )
        assert response.status_code == 200, f"7 Days range failed: {response.text}"
        print("PASSED: 7 Days range works")
    
    def test_30_days_range(self, admin_token):
        """Test 30 Days range"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        today = datetime.now().strftime("%Y-%m-%d")
        month_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/reports/stats?start_date={month_ago}&end_date={today}",
            headers=headers
        )
        assert response.status_code == 200, f"30 Days range failed: {response.text}"
        print("PASSED: 30 Days range works")
    
    def test_90_days_range(self, admin_token):
        """Test 90 Days range"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        today = datetime.now().strftime("%Y-%m-%d")
        quarter_ago = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/reports/stats?start_date={quarter_ago}&end_date={today}",
            headers=headers
        )
        assert response.status_code == 200, f"90 Days range failed: {response.text}"
        print("PASSED: 90 Days range works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
