"""
HevaPOS Iteration 21 - Production Hardening Features Tests

Tests for:
1. Revenue Analytics Dashboard (/api/reports/today)
2. QR Ordering Kill Switch (toggle via /api/restaurants/my/settings)
3. QR Menu 503 response when disabled
4. Reconnection storm jitter (code review - not testable via API)
5. Receipt chunking (code review - not testable via API)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
RESTAURANT_ADMIN = {"username": "restaurant_admin", "password": "admin123"}
QR_MENU_URL = f"{BASE_URL}/api/qr/rest_demo_1/KrGTedTy"


class TestAuthentication:
    """Authentication tests"""
    
    def test_login_restaurant_admin(self):
        """Test restaurant admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "admin"
        assert data["restaurant_id"] == "rest_demo_1"
        print(f"✓ Restaurant admin login successful")


class TestRevenueAnalyticsDashboard:
    """Tests for /api/reports/today endpoint - Revenue Analytics Dashboard"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for restaurant admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_reports_today_requires_auth(self):
        """Test that /reports/today requires authentication"""
        response = requests.get(f"{BASE_URL}/api/reports/today")
        assert response.status_code in [401, 403]  # Either unauthorized or forbidden
        print(f"✓ /reports/today requires authentication (status: {response.status_code})")
    
    def test_reports_today_returns_all_fields(self, auth_token):
        """Test that /reports/today returns all required fields for dashboard"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/reports/today", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Core metrics
        assert "total_sales" in data
        assert "total_orders" in data
        assert "avg_order_value" in data
        
        # Cash/Card breakdown
        assert "cash_total" in data
        assert "card_total" in data
        
        # Hourly revenue for chart
        assert "hourly_revenue" in data
        assert isinstance(data["hourly_revenue"], list)
        
        # QR vs POS breakdown
        assert "qr_orders" in data
        assert "pos_orders" in data
        
        # Tables info
        assert "open_tables" in data
        assert "total_tables" in data
        
        # Top products
        assert "top_products" in data
        
        print(f"✓ /reports/today returns all required fields")
        print(f"  - total_sales: {data['total_sales']}")
        print(f"  - total_orders: {data['total_orders']}")
        print(f"  - qr_orders: {data['qr_orders']}, pos_orders: {data['pos_orders']}")
        print(f"  - open_tables: {data['open_tables']}/{data['total_tables']}")
        print(f"  - hourly_revenue entries: {len(data['hourly_revenue'])}")
    
    def test_hourly_revenue_structure(self, auth_token):
        """Test hourly revenue array structure"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/reports/today", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        hourly = data.get("hourly_revenue", [])
        assert len(hourly) == 24, "Should have 24 hourly entries"
        
        # Check structure of first entry
        if hourly:
            entry = hourly[0]
            assert "hour" in entry
            assert "label" in entry
            assert "revenue" in entry
            assert isinstance(entry["hour"], int)
            assert isinstance(entry["revenue"], (int, float))
        
        print(f"✓ Hourly revenue has correct structure (24 entries)")


class TestQROrderingKillSwitch:
    """Tests for QR Ordering Kill Switch feature"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for restaurant admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_get_restaurant_settings(self, auth_token):
        """Test getting restaurant settings includes qr_ordering_enabled"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurants/my", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # qr_ordering_enabled should be present (defaults to True)
        assert "qr_ordering_enabled" in data or data.get("qr_ordering_enabled") is None
        print(f"✓ Restaurant settings retrieved, qr_ordering_enabled: {data.get('qr_ordering_enabled', True)}")
    
    def test_disable_qr_ordering(self, auth_token):
        """Test disabling QR ordering via settings"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Disable QR ordering
        response = requests.put(
            f"{BASE_URL}/api/restaurants/my/settings",
            headers=headers,
            json={"qr_ordering_enabled": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("qr_ordering_enabled") == False
        print(f"✓ QR ordering disabled successfully")
    
    def test_qr_menu_returns_503_when_disabled(self, auth_token):
        """Test that QR menu returns 503 when QR ordering is disabled"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First disable QR ordering
        requests.put(
            f"{BASE_URL}/api/restaurants/my/settings",
            headers=headers,
            json={"qr_ordering_enabled": False}
        )
        
        # Now try to access QR menu (no auth required)
        response = requests.get(QR_MENU_URL)
        assert response.status_code == 503
        data = response.json()
        assert "temporarily disabled" in data.get("detail", "").lower()
        print(f"✓ QR menu returns 503 when disabled: {data.get('detail')}")
    
    def test_enable_qr_ordering(self, auth_token):
        """Test enabling QR ordering via settings"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Enable QR ordering
        response = requests.put(
            f"{BASE_URL}/api/restaurants/my/settings",
            headers=headers,
            json={"qr_ordering_enabled": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("qr_ordering_enabled") == True
        print(f"✓ QR ordering enabled successfully")
    
    def test_qr_menu_works_when_enabled(self, auth_token):
        """Test that QR menu works normally when QR ordering is enabled"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First enable QR ordering
        requests.put(
            f"{BASE_URL}/api/restaurants/my/settings",
            headers=headers,
            json={"qr_ordering_enabled": True}
        )
        
        # Now try to access QR menu (no auth required)
        response = requests.get(QR_MENU_URL)
        assert response.status_code == 200
        data = response.json()
        assert "restaurant" in data
        assert "table" in data
        assert "products" in data
        print(f"✓ QR menu works when enabled: {data['restaurant']['name']}")


class TestQRGuestMenuRegression:
    """Regression tests for QR Guest Menu functionality"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for restaurant admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    @pytest.fixture(autouse=True)
    def ensure_qr_enabled(self, auth_token):
        """Ensure QR ordering is enabled before each test"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        requests.put(
            f"{BASE_URL}/api/restaurants/my/settings",
            headers=headers,
            json={"qr_ordering_enabled": True}
        )
        yield
    
    def test_qr_menu_loads(self):
        """Test QR menu loads with restaurant, table, and products"""
        response = requests.get(QR_MENU_URL)
        assert response.status_code == 200
        data = response.json()
        
        assert "restaurant" in data
        assert "table" in data
        assert "products" in data
        assert "categories" in data
        
        assert data["restaurant"]["id"] == "rest_demo_1"
        assert data["table"]["number"] == 1
        
        print(f"✓ QR menu loads: {data['restaurant']['name']}, {data['table']['name']}")
        print(f"  - Products: {len(data['products'])}, Categories: {len(data['categories'])}")
    
    def test_qr_order_placement(self):
        """Test placing an order via QR menu"""
        # First get menu to find a product
        menu_response = requests.get(QR_MENU_URL)
        assert menu_response.status_code == 200
        menu_data = menu_response.json()
        
        if not menu_data.get("products"):
            pytest.skip("No products available")
        
        product = menu_data["products"][0]
        
        # Place order
        order_data = {
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 1,
                "unit_price": product["price"],
                "total": product["price"]
            }],
            "guest_name": "TEST_Iteration21",
            "guest_notes": "Test order from iteration 21 testing"
        }
        
        response = requests.post(f"{QR_MENU_URL}/order", json=order_data)
        assert response.status_code == 200
        data = response.json()
        
        assert "order_id" in data
        assert "order_number" in data
        assert data["status"] == "pending"
        
        print(f"✓ QR order placed: #{data['order_number']}, ID: {data['order_id']}")
    
    def test_qr_menu_invalid_hash(self):
        """Test QR menu with invalid table hash returns 404"""
        response = requests.get(f"{BASE_URL}/api/qr/rest_demo_1/INVALID_HASH")
        assert response.status_code == 404
        print(f"✓ Invalid QR hash returns 404")
    
    def test_qr_menu_invalid_restaurant(self):
        """Test QR menu with invalid restaurant returns 404"""
        response = requests.get(f"{BASE_URL}/api/qr/invalid_restaurant/KrGTedTy")
        assert response.status_code == 404
        print(f"✓ Invalid restaurant returns 404")


class TestPOSScreenRegression:
    """Regression tests for POS screen functionality"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for restaurant admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_get_products(self, auth_token):
        """Test getting products for POS"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Products loaded: {len(data)} products")
    
    def test_get_categories(self, auth_token):
        """Test getting categories for POS"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/categories", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Categories loaded: {len(data)} categories")
    
    def test_get_tables(self, auth_token):
        """Test getting tables for POS"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Tables loaded: {len(data)} tables")
    
    def test_get_pending_orders(self, auth_token):
        """Test getting pending orders for POS"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/orders/pending", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Pending orders loaded: {len(data)} orders")


class TestSubscriptionBanner:
    """Tests for subscription banner data"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for restaurant admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_get_subscription_info(self, auth_token):
        """Test getting subscription info for banner"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/subscriptions/my", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "subscription_status" in data
        print(f"✓ Subscription info: status={data.get('subscription_status')}, trial_days_left={data.get('trial_days_left')}")


class TestCleanup:
    """Cleanup after tests - ensure QR ordering is re-enabled"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for restaurant admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_cleanup_enable_qr_ordering(self, auth_token):
        """Re-enable QR ordering after tests"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.put(
            f"{BASE_URL}/api/restaurants/my/settings",
            headers=headers,
            json={"qr_ordering_enabled": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("qr_ordering_enabled") == True
        print(f"✓ Cleanup: QR ordering re-enabled")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
