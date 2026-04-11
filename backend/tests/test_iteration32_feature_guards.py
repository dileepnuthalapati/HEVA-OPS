"""
Iteration 32: Feature Guards, Heva Ops Staff Companion, Module Pricing Tests

Tests:
1. Feature guards on POS/KDS/QR routers
2. Module Pricing API (GET/PUT)
3. Heva Ops Staff Companion pages (frontend tested via Playwright)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
PLATFORM_OWNER = {"username": "platform_owner", "password": "admin123"}
SKADMIN = {"username": "SKAdmin", "password": "saswata@123"}  # rest_demo_1, all features enabled
STAFF_USER = {"username": "user", "password": "user123"}


class TestAuth:
    """Authentication helper tests"""
    
    @pytest.fixture(scope="class")
    def platform_owner_token(self):
        """Get platform owner token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER)
        assert response.status_code == 200, f"Platform owner login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def skadmin_token(self):
        """Get SKAdmin token (restaurant admin with all features enabled)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SKADMIN)
        assert response.status_code == 200, f"SKAdmin login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def staff_token(self):
        """Get staff user token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_USER)
        assert response.status_code == 200, f"Staff login failed: {response.text}"
        return response.json()["access_token"]


class TestModulePricing(TestAuth):
    """Module Pricing API tests - Platform Owner only"""
    
    def test_get_module_pricing_as_platform_owner(self, platform_owner_token):
        """GET /api/platform/module-pricing returns default prices for platform_owner"""
        response = requests.get(
            f"{BASE_URL}/api/platform/module-pricing",
            headers={"Authorization": f"Bearer {platform_owner_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify default pricing structure
        assert "pos" in data, "Missing 'pos' price"
        assert "kds" in data, "Missing 'kds' price"
        assert "qr_ordering" in data, "Missing 'qr_ordering' price"
        assert "workforce" in data, "Missing 'workforce' price"
        
        # Verify prices are numbers
        assert isinstance(data["pos"], (int, float)), "POS price should be a number"
        assert isinstance(data["kds"], (int, float)), "KDS price should be a number"
        print(f"Module pricing retrieved: {data}")
    
    def test_update_module_pricing_as_platform_owner(self, platform_owner_token):
        """PUT /api/platform/module-pricing updates prices successfully"""
        new_pricing = {
            "pos": 25.99,
            "kds": 12.99,
            "qr_ordering": 18.99,
            "workforce": 29.99,
            "currency": "GBP"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/platform/module-pricing",
            headers={"Authorization": f"Bearer {platform_owner_token}"},
            json=new_pricing
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "message" in data, "Missing success message"
        print(f"Module pricing updated: {data}")
        
        # Verify the update persisted
        get_response = requests.get(
            f"{BASE_URL}/api/platform/module-pricing",
            headers={"Authorization": f"Bearer {platform_owner_token}"}
        )
        assert get_response.status_code == 200
        updated_data = get_response.json()
        assert updated_data["pos"] == 25.99, "POS price not updated"
        assert updated_data["kds"] == 12.99, "KDS price not updated"
        print(f"Verified updated pricing: {updated_data}")
    
    def test_module_pricing_requires_platform_owner(self, skadmin_token):
        """Module pricing should be restricted to platform_owner only"""
        response = requests.get(
            f"{BASE_URL}/api/platform/module-pricing",
            headers={"Authorization": f"Bearer {skadmin_token}"}
        )
        # Should return 403 for non-platform-owner
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("Module pricing correctly restricted to platform_owner")


class TestPOSFeatureGuards(TestAuth):
    """Test feature guards on POS endpoints - SKAdmin has pos=true"""
    
    def test_orders_endpoint_with_pos_enabled(self, skadmin_token):
        """GET /api/orders should work for SKAdmin (pos=true)"""
        response = requests.get(
            f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {skadmin_token}"}
        )
        assert response.status_code == 200, f"Orders endpoint failed: {response.text}"
        print(f"Orders endpoint accessible with pos feature enabled")
    
    def test_pending_orders_with_pos_enabled(self, skadmin_token):
        """GET /api/orders/pending should work for SKAdmin (pos=true)"""
        response = requests.get(
            f"{BASE_URL}/api/orders/pending",
            headers={"Authorization": f"Bearer {skadmin_token}"}
        )
        assert response.status_code == 200, f"Pending orders failed: {response.text}"
        print("Pending orders endpoint accessible")
    
    def test_cash_drawer_current_with_pos_enabled(self, skadmin_token):
        """GET /api/cash-drawer/current should work for SKAdmin (pos=true)"""
        response = requests.get(
            f"{BASE_URL}/api/cash-drawer/current",
            headers={"Authorization": f"Bearer {skadmin_token}"}
        )
        # 404 is acceptable if no drawer is open, but not 403
        assert response.status_code in [200, 404], f"Cash drawer failed: {response.status_code} - {response.text}"
        print(f"Cash drawer endpoint accessible (status: {response.status_code})")
    
    def test_cash_drawer_history_with_pos_enabled(self, skadmin_token):
        """GET /api/cash-drawer/history should work for SKAdmin (pos=true)"""
        response = requests.get(
            f"{BASE_URL}/api/cash-drawer/history",
            headers={"Authorization": f"Bearer {skadmin_token}"}
        )
        assert response.status_code == 200, f"Cash drawer history failed: {response.text}"
        print("Cash drawer history accessible")
    
    def test_menu_categories_with_pos_enabled(self, skadmin_token):
        """GET /api/categories should work for SKAdmin (pos=true)"""
        response = requests.get(
            f"{BASE_URL}/api/categories",
            headers={"Authorization": f"Bearer {skadmin_token}"}
        )
        assert response.status_code == 200, f"Categories failed: {response.text}"
        print("Categories endpoint accessible")
    
    def test_menu_products_with_pos_enabled(self, skadmin_token):
        """GET /api/products should work for SKAdmin (pos=true)"""
        response = requests.get(
            f"{BASE_URL}/api/products",
            headers={"Authorization": f"Bearer {skadmin_token}"}
        )
        assert response.status_code == 200, f"Products failed: {response.text}"
        print("Products endpoint accessible")
    
    def test_printers_with_pos_enabled(self, skadmin_token):
        """GET /api/printers should work for SKAdmin (pos=true)"""
        response = requests.get(
            f"{BASE_URL}/api/printers",
            headers={"Authorization": f"Bearer {skadmin_token}"}
        )
        assert response.status_code == 200, f"Printers failed: {response.text}"
        print("Printers endpoint accessible")
    
    def test_tables_with_pos_enabled(self, skadmin_token):
        """GET /api/tables should work for SKAdmin (pos=true)"""
        response = requests.get(
            f"{BASE_URL}/api/tables",
            headers={"Authorization": f"Bearer {skadmin_token}"}
        )
        assert response.status_code == 200, f"Tables failed: {response.text}"
        print("Tables endpoint accessible")


class TestKDSFeatureGuards(TestAuth):
    """Test feature guards on KDS endpoints - SKAdmin has kds=true"""
    
    def test_kds_orders_with_kds_enabled(self, skadmin_token):
        """GET /api/kds/orders should work for SKAdmin (kds=true)"""
        response = requests.get(
            f"{BASE_URL}/api/kds/orders",
            headers={"Authorization": f"Bearer {skadmin_token}"}
        )
        assert response.status_code == 200, f"KDS orders failed: {response.text}"
        print("KDS orders endpoint accessible")
    
    def test_kds_stats_with_kds_enabled(self, skadmin_token):
        """GET /api/kds/stats should work for SKAdmin (kds=true)"""
        response = requests.get(
            f"{BASE_URL}/api/kds/stats",
            headers={"Authorization": f"Bearer {skadmin_token}"}
        )
        assert response.status_code == 200, f"KDS stats failed: {response.text}"
        data = response.json()
        assert "queue_depth" in data, "Missing queue_depth in KDS stats"
        print(f"KDS stats accessible: {data}")


class TestQRFeatureGuards(TestAuth):
    """Test feature guards on QR endpoints"""
    
    def test_qr_table_hashes_with_qr_enabled(self, skadmin_token):
        """GET /api/qr/tables/hashes should work for SKAdmin (qr_ordering=true)"""
        response = requests.get(
            f"{BASE_URL}/api/qr/tables/hashes",
            headers={"Authorization": f"Bearer {skadmin_token}"}
        )
        assert response.status_code == 200, f"QR table hashes failed: {response.text}"
        print("QR table hashes endpoint accessible")


class TestWorkforceFeatureGuards(TestAuth):
    """Test workforce endpoints - SKAdmin has workforce=true"""
    
    def test_shifts_with_workforce_enabled(self, skadmin_token):
        """GET /api/shifts should work for SKAdmin (workforce=true)"""
        from datetime import datetime, timedelta
        today = datetime.now().strftime("%Y-%m-%d")
        next_week = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/shifts?start_date={today}&end_date={next_week}",
            headers={"Authorization": f"Bearer {skadmin_token}"}
        )
        assert response.status_code == 200, f"Shifts failed: {response.text}"
        print("Shifts endpoint accessible")
    
    def test_attendance_live_with_workforce_enabled(self, skadmin_token):
        """GET /api/attendance/live should work for SKAdmin (workforce=true)"""
        response = requests.get(
            f"{BASE_URL}/api/attendance/live",
            headers={"Authorization": f"Bearer {skadmin_token}"}
        )
        assert response.status_code == 200, f"Attendance live failed: {response.text}"
        print("Attendance live endpoint accessible")
    
    def test_swap_requests_with_workforce_enabled(self, skadmin_token):
        """GET /api/swap-requests should work for SKAdmin (workforce=true)"""
        response = requests.get(
            f"{BASE_URL}/api/swap-requests",
            headers={"Authorization": f"Bearer {skadmin_token}"}
        )
        assert response.status_code == 200, f"Swap requests failed: {response.text}"
        print("Swap requests endpoint accessible")


class TestPlatformOwnerBypassesFeatureGuards(TestAuth):
    """Platform owner should bypass all feature guards"""
    
    def test_platform_owner_can_access_kds(self, platform_owner_token):
        """Platform owner should access KDS even without restaurant"""
        response = requests.get(
            f"{BASE_URL}/api/kds/orders",
            headers={"Authorization": f"Bearer {platform_owner_token}"}
        )
        # Platform owner bypasses feature check but may get empty results
        assert response.status_code == 200, f"Platform owner KDS access failed: {response.text}"
        print("Platform owner can access KDS endpoints")
    
    def test_platform_owner_can_access_orders(self, platform_owner_token):
        """Platform owner should access orders"""
        response = requests.get(
            f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {platform_owner_token}"}
        )
        assert response.status_code == 200, f"Platform owner orders access failed: {response.text}"
        print("Platform owner can access orders endpoints")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
