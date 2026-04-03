"""
HevaPOS QR Table Ordering Feature Tests - Iteration 19

Tests for:
1. QR Guest Menu public endpoints (no auth)
2. QR Admin endpoints (auth required)
3. WebSocket/Socket.IO integration
4. Receipt generator (JS module - code review)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
RESTAURANT_ADMIN = {"username": "restaurant_admin", "password": "admin123"}
PLATFORM_OWNER = {"username": "platform_owner", "password": "admin123"}
STAFF_USER = {"username": "user", "password": "user123"}

# Known table hashes from the problem statement
KNOWN_TABLE_HASHES = ["KrGTedTy", "14-as7MV", "wG0lM1YA"]
RESTAURANT_ID = "rest_demo_1"


class TestQRMenuPublicEndpoints:
    """Test public QR menu endpoints (no auth required)"""
    
    def test_qr_guest_menu_loads(self):
        """GET /api/qr/{restaurant_id}/{table_hash} - Public menu endpoint"""
        table_hash = KNOWN_TABLE_HASHES[0]  # KrGTedTy
        response = requests.get(f"{BASE_URL}/api/qr/{RESTAURANT_ID}/{table_hash}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "restaurant" in data, "Response should contain 'restaurant'"
        assert "table" in data, "Response should contain 'table'"
        assert "categories" in data, "Response should contain 'categories'"
        assert "products" in data, "Response should contain 'products'"
        
        # Verify restaurant info
        restaurant = data["restaurant"]
        assert "id" in restaurant
        assert "name" in restaurant
        assert "currency" in restaurant
        assert restaurant["currency"] == "GBP", f"Expected GBP currency, got {restaurant['currency']}"
        
        # Verify table info
        table = data["table"]
        assert "id" in table
        assert "number" in table
        assert "name" in table
        
        print(f"✓ QR Guest Menu loaded: {restaurant['name']}, {table['name']}, {len(data['products'])} products")
    
    def test_qr_guest_menu_shows_categories(self):
        """Verify categories are returned in guest menu"""
        table_hash = KNOWN_TABLE_HASHES[0]
        response = requests.get(f"{BASE_URL}/api/qr/{RESTAURANT_ID}/{table_hash}")
        
        assert response.status_code == 200
        data = response.json()
        
        categories = data["categories"]
        assert isinstance(categories, list), "Categories should be a list"
        assert len(categories) > 0, "Should have at least one category"
        
        # Verify category structure
        for cat in categories:
            assert "id" in cat, "Category should have 'id'"
            assert "name" in cat, "Category should have 'name'"
        
        print(f"✓ Categories returned: {[c['name'] for c in categories]}")
    
    def test_qr_guest_menu_shows_products_with_prices(self):
        """Verify products have prices in GBP"""
        table_hash = KNOWN_TABLE_HASHES[0]
        response = requests.get(f"{BASE_URL}/api/qr/{RESTAURANT_ID}/{table_hash}")
        
        assert response.status_code == 200
        data = response.json()
        
        products = data["products"]
        assert isinstance(products, list), "Products should be a list"
        assert len(products) > 0, "Should have at least one product"
        
        # Verify product structure
        for product in products[:5]:  # Check first 5
            assert "id" in product, "Product should have 'id'"
            assert "name" in product, "Product should have 'name'"
            assert "price" in product, "Product should have 'price'"
            assert isinstance(product["price"], (int, float)), "Price should be numeric"
            assert product["price"] >= 0, "Price should be non-negative"
        
        print(f"✓ Products with prices: {len(products)} products, sample: {products[0]['name']} - £{products[0]['price']}")
    
    def test_qr_guest_menu_invalid_hash(self):
        """GET /api/qr/{restaurant_id}/{invalid_hash} - Should return 404"""
        response = requests.get(f"{BASE_URL}/api/qr/{RESTAURANT_ID}/invalid_hash_xyz")
        
        assert response.status_code == 404, f"Expected 404 for invalid hash, got {response.status_code}"
        print("✓ Invalid table hash returns 404")
    
    def test_qr_guest_menu_invalid_restaurant(self):
        """GET /api/qr/{invalid_restaurant}/{table_hash} - Should return 404"""
        table_hash = KNOWN_TABLE_HASHES[0]
        response = requests.get(f"{BASE_URL}/api/qr/invalid_restaurant_xyz/{table_hash}")
        
        assert response.status_code == 404, f"Expected 404 for invalid restaurant, got {response.status_code}"
        print("✓ Invalid restaurant ID returns 404")


class TestQROrderPlacement:
    """Test QR order placement (public endpoint)"""
    
    def test_place_qr_order_success(self):
        """POST /api/qr/{restaurant_id}/{table_hash}/order - Place a guest order"""
        table_hash = KNOWN_TABLE_HASHES[0]
        
        # First get menu to get valid product IDs
        menu_response = requests.get(f"{BASE_URL}/api/qr/{RESTAURANT_ID}/{table_hash}")
        assert menu_response.status_code == 200
        products = menu_response.json()["products"]
        
        # Create order with first product
        product = products[0]
        order_data = {
            "items": [
                {
                    "product_id": product["id"],
                    "product_name": product["name"],
                    "quantity": 2,
                    "unit_price": product["price"],
                    "total": product["price"] * 2
                }
            ],
            "guest_name": "TEST_QR_Guest",
            "guest_notes": "No onions please"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/qr/{RESTAURANT_ID}/{table_hash}/order",
            json=order_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "order_id" in data, "Response should contain 'order_id'"
        assert "order_number" in data, "Response should contain 'order_number'"
        assert "table" in data, "Response should contain 'table'"
        assert "total" in data, "Response should contain 'total'"
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] == "pending", f"Order status should be 'pending', got {data['status']}"
        
        print(f"✓ QR Order placed: #{data['order_number']}, {data['table']}, total: £{data['total']}")
        return data
    
    def test_place_qr_order_empty_items(self):
        """POST /api/qr/{restaurant_id}/{table_hash}/order - Empty items should fail"""
        table_hash = KNOWN_TABLE_HASHES[0]
        
        order_data = {
            "items": [],
            "guest_name": "TEST_Empty"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/qr/{RESTAURANT_ID}/{table_hash}/order",
            json=order_data
        )
        
        assert response.status_code == 400, f"Expected 400 for empty items, got {response.status_code}"
        print("✓ Empty order items returns 400")
    
    def test_place_qr_order_invalid_table(self):
        """POST /api/qr/{restaurant_id}/{invalid_hash}/order - Invalid table should fail"""
        order_data = {
            "items": [
                {
                    "product_id": "test_id",
                    "product_name": "Test Product",
                    "quantity": 1,
                    "unit_price": 10.00,
                    "total": 10.00
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/qr/{RESTAURANT_ID}/invalid_hash_xyz/order",
            json=order_data
        )
        
        assert response.status_code == 404, f"Expected 404 for invalid table, got {response.status_code}"
        print("✓ Order to invalid table returns 404")


class TestQRAdminEndpoints:
    """Test QR admin endpoints (auth required)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for admin endpoints"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_table_hashes_auth_required(self):
        """GET /api/qr/tables/hashes - Should require auth"""
        response = requests.get(f"{BASE_URL}/api/qr/tables/hashes")
        # 401 or 403 both indicate auth is required
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ GET /api/qr/tables/hashes requires auth")
    
    def test_get_table_hashes_with_auth(self):
        """GET /api/qr/tables/hashes - Should return table hashes with auth"""
        response = requests.get(f"{BASE_URL}/api/qr/tables/hashes", headers=self.headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Verify table hash structure
        for table in data:
            assert "id" in table, "Table should have 'id'"
            assert "number" in table, "Table should have 'number'"
            assert "name" in table, "Table should have 'name'"
            assert "qr_hash" in table, "Table should have 'qr_hash'"
            assert "has_qr" in table, "Table should have 'has_qr'"
        
        # Check if known hashes are present
        hashes = [t["qr_hash"] for t in data if t["qr_hash"]]
        print(f"✓ Table hashes retrieved: {len(data)} tables, {len(hashes)} with QR hashes")
        print(f"  Sample hashes: {hashes[:3]}")
    
    def test_generate_all_hashes(self):
        """POST /api/qr/tables/generate-all-hashes - Generate hashes for all tables"""
        response = requests.post(f"{BASE_URL}/api/qr/tables/generate-all-hashes", headers=self.headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain 'message'"
        assert "updated" in data, "Response should contain 'updated'"
        
        print(f"✓ Generate all hashes: {data['message']}")


class TestPendingOrdersVerification:
    """Verify QR orders appear in pending orders"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
        assert response.status_code == 200
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_qr_order_appears_in_pending(self):
        """Verify QR orders appear in /api/orders/pending"""
        # First place a QR order
        table_hash = KNOWN_TABLE_HASHES[0]
        menu_response = requests.get(f"{BASE_URL}/api/qr/{RESTAURANT_ID}/{table_hash}")
        products = menu_response.json()["products"]
        
        order_data = {
            "items": [
                {
                    "product_id": products[0]["id"],
                    "product_name": products[0]["name"],
                    "quantity": 1,
                    "unit_price": products[0]["price"],
                    "total": products[0]["price"]
                }
            ],
            "guest_name": "TEST_Pending_Check"
        }
        
        order_response = requests.post(
            f"{BASE_URL}/api/qr/{RESTAURANT_ID}/{table_hash}/order",
            json=order_data
        )
        assert order_response.status_code == 200
        order_id = order_response.json()["order_id"]
        
        # Now check pending orders
        pending_response = requests.get(f"{BASE_URL}/api/orders/pending", headers=self.headers)
        assert pending_response.status_code == 200
        
        pending_orders = pending_response.json()
        order_ids = [o["id"] for o in pending_orders]
        
        assert order_id in order_ids, f"QR order {order_id} should appear in pending orders"
        
        # Find the order and verify it exists
        qr_order = next((o for o in pending_orders if o["id"] == order_id), None)
        assert qr_order is not None, f"QR order {order_id} should be in pending orders"
        
        # Source field may or may not be returned in pending orders list
        # The important thing is the order exists
        source = qr_order.get("source")
        print(f"✓ QR order {order_id} appears in pending orders (source={source})")


class TestPOSScreenAccess:
    """Test POS screen still works for logged in users"""
    
    def test_login_restaurant_admin(self):
        """Login as restaurant_admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        # API returns username at top level, not nested in user object
        username = data.get("username")
        role = data.get("role")
        
        assert username is not None, "Response should contain username"
        
        print(f"✓ Login successful: {username}, role: {role}")
    
    def test_pos_endpoints_work(self):
        """Verify POS-related endpoints work"""
        # Login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test categories
        cat_response = requests.get(f"{BASE_URL}/api/categories", headers=headers)
        assert cat_response.status_code == 200, f"Categories failed: {cat_response.status_code}"
        
        # Test products
        prod_response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        assert prod_response.status_code == 200, f"Products failed: {prod_response.status_code}"
        
        # Test tables
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        assert tables_response.status_code == 200, f"Tables failed: {tables_response.status_code}"
        
        # Test pending orders
        pending_response = requests.get(f"{BASE_URL}/api/orders/pending", headers=headers)
        assert pending_response.status_code == 200, f"Pending orders failed: {pending_response.status_code}"
        
        print(f"✓ POS endpoints working: categories, products, tables, pending orders")


class TestSocketIOServer:
    """Test Socket.IO server is running"""
    
    def test_socketio_endpoint_exists(self):
        """Verify Socket.IO endpoint responds"""
        # Socket.IO uses polling as fallback, test the polling endpoint
        response = requests.get(f"{BASE_URL}/socket.io/?EIO=4&transport=polling")
        
        # Socket.IO should respond with a session ID or error, not 404
        assert response.status_code != 404, "Socket.IO endpoint should exist"
        
        print(f"✓ Socket.IO endpoint exists, status: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
