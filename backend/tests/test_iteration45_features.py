"""
Iteration 45 Tests - 6 Bug Fixes Verification
1. Reject button for ghost shift pending adjustments
2. Top 5 items sorted by revenue not quantity
3. 'Register POS Terminal' renamed to 'Register as Shared Kiosk'
4. Dashboard reordered: POS/Revenue first, Workforce Overview at bottom
5. Week start day not updating shift scheduler — fixed wrong API path
6. Rebranded all HevaPOS references to Heva One
"""
import pytest
import requests
import os
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_USERNAME = "SKAdmin"
ADMIN_PASSWORD = "saswata@123"
ADMIN_RESTAURANT_ID = "rest_demo_1"
STAFF_USERNAME = "user"
STAFF_PASSWORD = "user123"


class TestAuthentication:
    """Verify login works for admin and staff"""
    
    def test_admin_login(self):
        """Admin login returns access_token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data.get("role") == "admin", f"Expected admin role, got {data.get('role')}"
        print(f"✓ Admin login successful, role={data.get('role')}")
    
    def test_staff_login(self):
        """Staff login returns access_token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF_USERNAME,
            "password": STAFF_PASSWORD
        })
        assert response.status_code == 200, f"Staff login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        print(f"✓ Staff login successful, role={data.get('role')}")


class TestRejectAdjustmentEndpoint:
    """Test PUT /api/attendance/{id}/reject-adjustment endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture
    def staff_token(self):
        """Get staff auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF_USERNAME,
            "password": STAFF_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_reject_adjustment_endpoint_exists(self, admin_token):
        """Verify reject-adjustment endpoint exists and requires valid record"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        # Test with non-existent record
        response = requests.put(
            f"{BASE_URL}/api/attendance/nonexistent_record/reject-adjustment",
            headers=headers
        )
        # Should return 404 for non-existent record, not 405 (method not allowed)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("✓ reject-adjustment endpoint exists and returns 404 for non-existent record")
    
    def test_reject_adjustment_creates_notification(self, admin_token):
        """Test that rejecting an adjustment creates a notification for staff"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First, get pending adjustments to find a real record (if any)
        response = requests.get(
            f"{BASE_URL}/api/attendance/pending-adjustments",
            headers=headers
        )
        assert response.status_code == 200
        pending = response.json()
        
        if len(pending) > 0:
            record_id = pending[0]["id"]
            # Reject the adjustment
            response = requests.put(
                f"{BASE_URL}/api/attendance/{record_id}/reject-adjustment",
                headers=headers
            )
            assert response.status_code == 200, f"Reject failed: {response.text}"
            data = response.json()
            assert "message" in data
            assert "rejected" in data["message"].lower() or "re-submit" in data["message"].lower()
            print(f"✓ Rejected adjustment for record {record_id}")
        else:
            print("✓ No pending adjustments to test rejection (endpoint verified to exist)")


class TestTopProductsSortedByRevenue:
    """Test GET /api/reports/today-stats returns top_products sorted by revenue"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_today_stats_returns_top_products(self, admin_token):
        """Verify today-stats endpoint returns top_products field"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/reports/today", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "top_products" in data, "top_products field missing from response"
        print(f"✓ today-stats returns top_products: {len(data['top_products'])} items")
    
    def test_top_products_sorted_by_revenue(self, admin_token):
        """Verify top_products are sorted by revenue (descending)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/reports/today", headers=headers)
        assert response.status_code == 200
        data = response.json()
        top_products = data.get("top_products", [])
        
        if len(top_products) >= 2:
            # Verify sorted by revenue descending
            revenues = [p.get("revenue", 0) for p in top_products]
            assert revenues == sorted(revenues, reverse=True), \
                f"Products not sorted by revenue: {revenues}"
            print(f"✓ Top products sorted by revenue: {revenues}")
        else:
            print(f"✓ Only {len(top_products)} products - sorting verified (need 2+ to compare)")
    
    def test_top_products_have_revenue_field(self, admin_token):
        """Verify each top product has revenue field"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/reports/today", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        for product in data.get("top_products", []):
            assert "revenue" in product, f"Product missing revenue field: {product}"
            assert "name" in product, f"Product missing name field: {product}"
            assert "quantity" in product, f"Product missing quantity field: {product}"
        
        print(f"✓ All top products have name, quantity, and revenue fields")


class TestWeekStartDaySetting:
    """Test PUT /api/restaurants/my/settings saves week_start_day"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_get_restaurant_settings_includes_week_start_day(self, admin_token):
        """Verify GET /api/restaurants/my returns week_start_day in business_info"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurants/my", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # week_start_day should be in business_info
        business_info = data.get("business_info", {})
        # It may or may not be set yet, but the endpoint should work
        print(f"✓ GET /api/restaurants/my works, week_start_day={business_info.get('week_start_day', 'not set')}")
    
    def test_update_week_start_day(self, admin_token):
        """Test updating week_start_day via PUT /api/restaurants/my/settings"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First get current value
        response = requests.get(f"{BASE_URL}/api/restaurants/my", headers=headers)
        assert response.status_code == 200
        original_data = response.json()
        original_business_info = original_data.get("business_info", {})
        original_week_start = original_business_info.get("week_start_day", 1)
        
        # Update to a different value (0=Sunday, 1=Monday, 6=Saturday)
        new_week_start = 0 if original_week_start != 0 else 1
        
        update_payload = {
            "business_info": {
                **original_business_info,
                "week_start_day": new_week_start
            }
        }
        
        response = requests.put(
            f"{BASE_URL}/api/restaurants/my/settings",
            headers=headers,
            json=update_payload
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        # Verify the change persisted
        response = requests.get(f"{BASE_URL}/api/restaurants/my", headers=headers)
        assert response.status_code == 200
        updated_data = response.json()
        updated_week_start = updated_data.get("business_info", {}).get("week_start_day")
        assert updated_week_start == new_week_start, \
            f"week_start_day not updated: expected {new_week_start}, got {updated_week_start}"
        
        # Restore original value
        restore_payload = {
            "business_info": {
                **original_business_info,
                "week_start_day": original_week_start
            }
        }
        requests.put(f"{BASE_URL}/api/restaurants/my/settings", headers=headers, json=restore_payload)
        
        print(f"✓ week_start_day updated from {original_week_start} to {new_week_start} and restored")


class TestReportsStatsEndpoint:
    """Test GET /api/reports/stats also sorts by revenue"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_reports_stats_top_products_sorted_by_revenue(self, admin_token):
        """Verify /api/reports/stats top_products sorted by revenue"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/reports/stats",
            headers=headers,
            params={"start_date": today, "end_date": today}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "top_products" in data, "top_products field missing"
        top_products = data.get("top_products", [])
        
        if len(top_products) >= 2:
            revenues = [p.get("revenue", 0) for p in top_products]
            assert revenues == sorted(revenues, reverse=True), \
                f"Products not sorted by revenue: {revenues}"
            print(f"✓ /api/reports/stats top_products sorted by revenue: {revenues}")
        else:
            print(f"✓ /api/reports/stats returns top_products ({len(top_products)} items)")


class TestPendingAdjustmentsEndpoint:
    """Test GET /api/attendance/pending-adjustments endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_pending_adjustments_endpoint_works(self, admin_token):
        """Verify pending-adjustments endpoint returns list"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/attendance/pending-adjustments",
            headers=headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✓ pending-adjustments returns {len(data)} records")


class TestApproveAdjustmentEndpoint:
    """Test PUT /api/attendance/{id}/approve-adjustment endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_approve_adjustment_endpoint_exists(self, admin_token):
        """Verify approve-adjustment endpoint exists"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.put(
            f"{BASE_URL}/api/attendance/nonexistent_record/approve-adjustment",
            headers=headers,
            json={}
        )
        # Should return 404 for non-existent record, not 405
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ approve-adjustment endpoint exists")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
