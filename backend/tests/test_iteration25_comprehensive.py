"""
HevaPOS Iteration 25 - Comprehensive Backend API Tests
Testing all critical endpoints for multi-tenant SaaS POS system
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://heva-one-preview.preview.emergentagent.com')

class TestAuthentication:
    """Test authentication for all user types"""
    
    def test_login_restaurant_admin(self):
        """Test restaurant admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "admin"
        assert data["restaurant_id"] == "rest_demo_1"
    
    def test_login_platform_owner(self):
        """Test platform owner login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "admin123"
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "platform_owner"
    
    def test_login_staff_user(self):
        """Test staff user login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "user",
            "password": "user123"
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "user"
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "invalid_user",
            "password": "wrong_password"
        })
        assert response.status_code == 401


class TestCategoriesAPI:
    """Test categories API with multi-tenancy"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        return response.json()["access_token"]
    
    def test_get_categories_requires_auth(self):
        """Categories endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code in [401, 403]  # Either is acceptable
    
    def test_get_categories_for_restaurant(self, admin_token):
        """Get categories for restaurant admin"""
        response = requests.get(
            f"{BASE_URL}/api/categories",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 4  # Pizzas, Drinks, Sides, Desserts
        # Verify category structure
        for cat in data:
            assert "name" in cat
            assert "id" in cat


class TestProductsAPI:
    """Test products API with multi-tenancy"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        return response.json()["access_token"]
    
    def test_get_products_requires_auth(self):
        """Products endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/products")
        assert response.status_code in [401, 403]  # Either is acceptable
    
    def test_get_products_for_restaurant(self, admin_token):
        """Get products for restaurant admin"""
        response = requests.get(
            f"{BASE_URL}/api/products",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 10  # Should have multiple products
        # Verify product structure
        for product in data:
            assert "name" in product
            assert "price" in product
            assert "category_id" in product


class TestReportsAPI:
    """Test reports API"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        return response.json()["access_token"]
    
    def test_get_reports_stats(self, admin_token):
        """Get reports stats for 30 days"""
        response = requests.get(
            f"{BASE_URL}/api/reports/stats?start_date=2026-03-06&end_date=2026-04-05",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_sales" in data
        assert "total_orders" in data
    
    def test_get_today_stats(self, admin_token):
        """Get today's stats"""
        response = requests.get(
            f"{BASE_URL}/api/reports/today",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_sales" in data or "sales" in data
    
    def test_pdf_report_generation(self, admin_token):
        """Test PDF report generation via POST"""
        response = requests.post(
            f"{BASE_URL}/api/reports/generate",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"start_date": "2026-03-06T00:00:00Z", "end_date": "2026-04-05T23:59:59Z"}
        )
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        assert len(response.content) > 0  # PDF has content


class TestOrdersAPI:
    """Test orders API"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        return response.json()["access_token"]
    
    def test_get_pending_orders(self, admin_token):
        """Get pending orders"""
        response = requests.get(
            f"{BASE_URL}/api/orders/pending",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_orders_with_date_range(self, admin_token):
        """Get orders with date range"""
        response = requests.get(
            f"{BASE_URL}/api/orders?from_date=2026-03-01&to_date=2026-04-05",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestTablesAPI:
    """Test tables API"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        return response.json()["access_token"]
    
    def test_get_tables(self, admin_token):
        """Get tables for restaurant"""
        response = requests.get(
            f"{BASE_URL}/api/tables",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2  # At least 2 tables


class TestQRMenuPublicAccess:
    """Test QR Menu public access (no auth required)"""
    
    def test_qr_menu_valid_hash(self):
        """QR menu with valid table hash - endpoint is /api/qr/{restaurant_id}/{table_hash}"""
        response = requests.get(f"{BASE_URL}/api/qr/rest_demo_1/KrGTedTy")
        assert response.status_code == 200
        data = response.json()
        assert "restaurant" in data
        assert "table" in data
        assert "categories" in data
        assert "products" in data
    
    def test_qr_menu_invalid_hash(self):
        """QR menu with invalid table hash returns 404"""
        response = requests.get(f"{BASE_URL}/api/qr/rest_demo_1/invalid_hash")
        assert response.status_code == 404


class TestKDSAPI:
    """Test Kitchen Display System API"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        return response.json()["access_token"]
    
    def test_get_kds_orders(self, admin_token):
        """Get KDS orders"""
        response = requests.get(
            f"{BASE_URL}/api/kds/orders",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_kds_stats(self, admin_token):
        """Get KDS stats"""
        response = requests.get(
            f"{BASE_URL}/api/kds/stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200


class TestCashDrawerAccess:
    """Test cash drawer access for different user roles"""
    
    @pytest.fixture
    def staff_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "user",
            "password": "user123"
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        return response.json()["access_token"]
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        return response.json()["access_token"]
    
    def test_cash_drawer_accessible_by_staff(self, staff_token):
        """Staff user can access cash drawer"""
        response = requests.get(
            f"{BASE_URL}/api/cash-drawer/history",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        # Should be 200 or empty list, not 403
        assert response.status_code in [200, 404]
    
    def test_cash_drawer_accessible_by_admin(self, admin_token):
        """Admin can access cash drawer"""
        response = requests.get(
            f"{BASE_URL}/api/cash-drawer/history",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code in [200, 404]


class TestAuditLogAPI:
    """Test audit log API"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        return response.json()["access_token"]
    
    def test_get_audit_logs(self, admin_token):
        """Get audit logs"""
        response = requests.get(
            f"{BASE_URL}/api/audit",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestPlatformOwnerAPIs:
    """Test platform owner specific APIs"""
    
    @pytest.fixture
    def platform_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "admin123"
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        return response.json()["access_token"]
    
    def test_get_restaurants(self, platform_token):
        """Platform owner can get all restaurants"""
        response = requests.get(
            f"{BASE_URL}/api/restaurants",
            headers={"Authorization": f"Bearer {platform_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1  # At least one restaurant


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
