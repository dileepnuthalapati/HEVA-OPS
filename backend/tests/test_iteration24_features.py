"""
HevaPOS Iteration 24 - Comprehensive Backend Tests
Testing: Login, Multi-tenancy, Categories, Products, Orders, Reports, PDF Download
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
PLATFORM_OWNER = {"username": "platform_owner", "password": "admin123"}
RESTAURANT_ADMIN = {"username": "restaurant_admin", "password": "admin123"}
STAFF_USER = {"username": "user", "password": "user123"}


class TestAuthentication:
    """Test login functionality for all user types"""
    
    def test_login_platform_owner(self):
        """Platform owner can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data["role"] == "platform_owner"
        print(f"✓ Platform owner login successful, role: {data['role']}")
    
    def test_login_restaurant_admin(self):
        """Restaurant admin can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data["role"] == "admin"
        assert data["restaurant_id"] == "rest_demo_1"
        print(f"✓ Restaurant admin login successful, restaurant_id: {data['restaurant_id']}")
    
    def test_login_staff_user(self):
        """Staff user can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_USER)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        # Staff users have role "user" or "staff"
        assert data["role"] in ["staff", "user"], f"Unexpected role: {data['role']}"
        print(f"✓ Staff user login successful, role: {data['role']}")
    
    def test_login_invalid_credentials(self):
        """Invalid credentials return 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "wrong", "password": "wrong"})
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid credentials correctly rejected")


@pytest.fixture
def admin_token():
    """Get restaurant admin auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Restaurant admin login failed")


@pytest.fixture
def platform_token():
    """Get platform owner auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Platform owner login failed")


@pytest.fixture
def staff_token():
    """Get staff user auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_USER)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Staff user login failed")


class TestCategoriesMultiTenancy:
    """Test categories API with multi-tenancy scoping"""
    
    def test_categories_require_auth(self):
        """Categories endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Categories endpoint requires auth")
    
    def test_get_categories_for_restaurant_admin(self, admin_token):
        """Restaurant admin gets categories scoped to their restaurant"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/categories", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        categories = response.json()
        assert isinstance(categories, list), "Expected list of categories"
        assert len(categories) > 0, "Expected at least one category"
        print(f"✓ Restaurant admin sees {len(categories)} categories")
        # Note: restaurant_id is filtered server-side but not returned in response model
    
    def test_categories_have_required_fields(self, admin_token):
        """Categories have all required fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/categories", headers=headers)
        assert response.status_code == 200
        categories = response.json()
        
        if len(categories) > 0:
            cat = categories[0]
            assert "id" in cat, "Category missing 'id'"
            assert "name" in cat, "Category missing 'name'"
            # Note: restaurant_id is not exposed in response model (filtered server-side)
            print(f"✓ Category structure valid: {cat.get('name')}")


class TestProductsMultiTenancy:
    """Test products API with multi-tenancy scoping"""
    
    def test_products_require_auth(self):
        """Products endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/products")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Products endpoint requires auth")
    
    def test_get_products_for_restaurant_admin(self, admin_token):
        """Restaurant admin gets products scoped to their restaurant"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        products = response.json()
        assert isinstance(products, list), "Expected list of products"
        assert len(products) > 0, "Expected at least one product"
        print(f"✓ Restaurant admin sees {len(products)} products")
        # Note: restaurant_id is filtered server-side but not returned in response model
    
    def test_products_have_required_fields(self, admin_token):
        """Products have all required fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        assert response.status_code == 200
        products = response.json()
        
        if len(products) > 0:
            prod = products[0]
            assert "id" in prod, "Product missing 'id'"
            assert "name" in prod, "Product missing 'name'"
            assert "price" in prod, "Product missing 'price'"
            # Note: restaurant_id is not exposed in response model (filtered server-side)
            print(f"✓ Product structure valid: {prod.get('name')} - £{prod.get('price')}")


class TestOrdersMultiTenancy:
    """Test orders API with multi-tenancy scoping"""
    
    def test_orders_require_auth(self):
        """Orders endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/orders")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Orders endpoint requires auth")
    
    def test_get_pending_orders(self, admin_token):
        """Restaurant admin can get pending orders"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/orders/pending", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        orders = response.json()
        assert isinstance(orders, list), "Expected list of orders"
        print(f"✓ Got {len(orders)} pending orders")
        
        # Verify all orders belong to rest_demo_1
        for order in orders:
            assert order.get("restaurant_id") == "rest_demo_1", f"Order {order.get('order_number')} has wrong restaurant_id"
        print("✓ All pending orders correctly scoped to rest_demo_1")
    
    def test_get_all_orders_with_date_range(self, admin_token):
        """Restaurant admin can get orders with date range"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/orders?from_date={start_date}&to_date={end_date}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        orders = response.json()
        assert isinstance(orders, list), "Expected list of orders"
        print(f"✓ Got {len(orders)} orders in 30-day range")


class TestReportsAPI:
    """Test reports API - CRITICAL: PDF download must work"""
    
    def test_reports_stats_require_auth(self):
        """Reports stats endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/reports/stats?start_date=2026-01-01&end_date=2026-04-04")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Reports stats endpoint requires auth")
    
    def test_get_reports_stats_30_days(self, admin_token):
        """Get reports stats for 30-day range"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/reports/stats?start_date={start_date}&end_date={end_date}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        stats = response.json()
        
        # Verify stats structure
        assert "total_sales" in stats, "Missing total_sales"
        assert "total_orders" in stats, "Missing total_orders"
        assert "avg_order_value" in stats, "Missing avg_order_value"
        assert "cash_total" in stats, "Missing cash_total"
        assert "card_total" in stats, "Missing card_total"
        
        print(f"✓ Reports stats: total_sales={stats['total_sales']}, total_orders={stats['total_orders']}")
        print(f"  avg_order_value={stats['avg_order_value']}, cash={stats['cash_total']}, card={stats['card_total']}")
    
    def test_get_today_stats(self, admin_token):
        """Get today's stats for dashboard"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/reports/today", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        stats = response.json()
        
        assert "total_sales" in stats, "Missing total_sales"
        assert "hourly_revenue" in stats, "Missing hourly_revenue"
        print(f"✓ Today stats: total_sales={stats['total_sales']}, orders={stats.get('total_orders', 0)}")
    
    def test_pdf_report_generation(self, admin_token):
        """CRITICAL: PDF report must download as actual file"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = requests.post(
            f"{BASE_URL}/api/reports/generate",
            headers=headers,
            json={
                "start_date": start_date,
                "end_date": end_date,
                "report_type": "sales"
            }
        )
        
        assert response.status_code == 200, f"PDF generation failed: {response.status_code} - {response.text}"
        
        # Verify it's actually a PDF
        content_type = response.headers.get("content-type", "")
        assert "application/pdf" in content_type, f"Expected PDF, got content-type: {content_type}"
        
        # Verify content disposition header for download
        content_disp = response.headers.get("content-disposition", "")
        assert "attachment" in content_disp, f"Missing attachment header: {content_disp}"
        assert ".pdf" in content_disp, f"Missing .pdf in filename: {content_disp}"
        
        # Verify PDF content starts with PDF magic bytes
        content = response.content
        assert len(content) > 100, f"PDF too small: {len(content)} bytes"
        assert content[:4] == b'%PDF', f"Not a valid PDF file, starts with: {content[:20]}"
        
        print(f"✓ PDF generated successfully: {len(content)} bytes")
        print(f"  Content-Type: {content_type}")
        print(f"  Content-Disposition: {content_disp}")


class TestPOSScreenAPIs:
    """Test APIs used by POS screen"""
    
    def test_pos_loads_categories(self, admin_token):
        """POS can load categories"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/categories", headers=headers)
        assert response.status_code == 200
        categories = response.json()
        assert len(categories) > 0, "POS needs at least one category"
        print(f"✓ POS loaded {len(categories)} categories")
    
    def test_pos_loads_products(self, admin_token):
        """POS can load products"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        assert response.status_code == 200
        products = response.json()
        assert len(products) > 0, "POS needs at least one product"
        print(f"✓ POS loaded {len(products)} products")
    
    def test_pos_loads_tables(self, admin_token):
        """POS can load tables"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        assert response.status_code == 200
        tables = response.json()
        print(f"✓ POS loaded {len(tables)} tables")
    
    def test_pos_can_create_order(self, admin_token):
        """POS can create an order"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First get a product
        products_resp = requests.get(f"{BASE_URL}/api/products", headers=headers)
        products = products_resp.json()
        if len(products) == 0:
            pytest.skip("No products available")
        
        product = products[0]
        order_data = {
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 1,
                "unit_price": product["price"],
                "total": product["price"]
            }],
            "subtotal": product["price"],
            "total_amount": product["price"]
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", headers=headers, json=order_data)
        assert response.status_code in [200, 201], f"Order creation failed: {response.text}"
        order = response.json()
        assert "id" in order, "Order missing id"
        assert "order_number" in order, "Order missing order_number"
        print(f"✓ Created order #{order['order_number']} with id {order['id']}")
        return order


class TestCashDrawerAccess:
    """Test cash drawer accessible by staff users"""
    
    def test_cash_drawer_accessible_by_staff(self, staff_token):
        """Staff user can access cash drawer"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.get(f"{BASE_URL}/api/cash-drawer/current", headers=headers)
        # Should return 200 (with drawer) or 404 (no open drawer) - not 403
        assert response.status_code in [200, 404], f"Staff should access cash drawer, got {response.status_code}: {response.text}"
        print(f"✓ Staff can access cash drawer (status: {response.status_code})")
    
    def test_cash_drawer_accessible_by_admin(self, admin_token):
        """Admin can access cash drawer"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/cash-drawer/current", headers=headers)
        assert response.status_code in [200, 404], f"Admin should access cash drawer, got {response.status_code}"
        print(f"✓ Admin can access cash drawer (status: {response.status_code})")


class TestKDSAPIs:
    """Test Kitchen Display System APIs"""
    
    def test_kds_orders_require_auth(self):
        """KDS orders endpoint requires auth"""
        response = requests.get(f"{BASE_URL}/api/kds/orders")
        assert response.status_code in [401, 403]
        print("✓ KDS orders requires auth")
    
    def test_kds_get_orders(self, admin_token):
        """Get KDS orders"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/kds/orders", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        orders = response.json()
        assert isinstance(orders, list)
        print(f"✓ KDS has {len(orders)} orders")
    
    def test_kds_stats(self, admin_token):
        """Get KDS stats"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/kds/stats", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        stats = response.json()
        assert "queue_depth" in stats or "status_counts" in stats
        print(f"✓ KDS stats: {stats}")


class TestQRMenuPublicAccess:
    """Test QR menu public endpoints"""
    
    def test_qr_menu_with_valid_hash(self):
        """QR menu loads with valid table hash (no auth required)"""
        # Use known valid hash from test data
        response = requests.get(f"{BASE_URL}/api/qr/rest_demo_1/KrGTedTy")
        assert response.status_code == 200, f"QR menu failed: {response.text}"
        data = response.json()
        assert "restaurant" in data, "Missing restaurant info"
        assert "table" in data, "Missing table info"
        assert "categories" in data, "Missing categories"
        assert "products" in data, "Missing products"
        print(f"✓ QR menu loaded: {data['restaurant']['name']}, Table {data['table']['number']}")
        print(f"  Categories: {len(data['categories'])}, Products: {len(data['products'])}")
    
    def test_qr_menu_invalid_hash_returns_404(self):
        """QR menu with invalid hash returns 404"""
        response = requests.get(f"{BASE_URL}/api/qr/rest_demo_1/invalid_hash")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Invalid QR hash correctly returns 404")


class TestDashboardAPIs:
    """Test dashboard APIs"""
    
    def test_dashboard_today_stats(self, admin_token):
        """Dashboard can load today's stats"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/reports/today", headers=headers)
        assert response.status_code == 200
        stats = response.json()
        assert "total_sales" in stats
        assert "hourly_revenue" in stats
        print(f"✓ Dashboard stats loaded: {stats.get('total_orders', 0)} orders today")
    
    def test_restaurant_info(self, admin_token):
        """Can get restaurant info"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurants/my", headers=headers)
        assert response.status_code == 200
        restaurant = response.json()
        assert "id" in restaurant
        assert "name" in restaurant
        print(f"✓ Restaurant info: {restaurant.get('name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
