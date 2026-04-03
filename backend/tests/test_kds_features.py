"""
HevaPOS Kitchen Display System (KDS) API Tests - Iteration 22

Tests for KDS endpoints:
- GET /api/kds/orders - Get active kitchen orders
- PUT /api/kds/orders/{id}/acknowledge - Acknowledge order
- PUT /api/kds/orders/{id}/preparing - Start preparing order
- PUT /api/kds/orders/{id}/ready - Mark order ready
- PUT /api/kds/orders/{id}/recall - Recall ready order back to preparing
- GET /api/kds/stats - Get KDS performance stats
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestKDSAuthentication:
    """Test that KDS endpoints require authentication"""
    
    def test_kds_orders_requires_auth(self):
        """GET /api/kds/orders should require authentication"""
        response = requests.get(f"{BASE_URL}/api/kds/orders")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASSED: KDS orders endpoint requires authentication")
    
    def test_kds_stats_requires_auth(self):
        """GET /api/kds/stats should require authentication"""
        response = requests.get(f"{BASE_URL}/api/kds/stats")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASSED: KDS stats endpoint requires authentication")


class TestKDSOrdersEndpoint:
    """Test GET /api/kds/orders endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
        print("Setup: Logged in as restaurant_admin")
    
    def test_get_kds_orders_success(self):
        """GET /api/kds/orders should return list of active orders"""
        response = requests.get(f"{BASE_URL}/api/kds/orders", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASSED: GET /api/kds/orders returned {len(data)} orders")
        
        # If there are orders, verify structure
        if len(data) > 0:
            order = data[0]
            required_fields = ['id', 'order_number', 'items', 'kds_status', 'created_at']
            for field in required_fields:
                assert field in order, f"Order missing required field: {field}"
            print(f"PASSED: Order structure verified - has all required fields")
            
            # Verify kds_status is valid
            valid_statuses = ['new', 'acknowledged', 'preparing', 'ready']
            assert order['kds_status'] in valid_statuses, f"Invalid kds_status: {order['kds_status']}"
            print(f"PASSED: Order kds_status is valid: {order['kds_status']}")
    
    def test_kds_orders_have_source_field(self):
        """Orders should have source field (qr or pos)"""
        response = requests.get(f"{BASE_URL}/api/kds/orders", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        if len(data) > 0:
            order = data[0]
            assert 'source' in order, "Order should have 'source' field"
            assert order['source'] in ['qr', 'pos', None], f"Invalid source: {order['source']}"
            print(f"PASSED: Order has source field: {order['source']}")
        else:
            print("SKIPPED: No orders to verify source field")


class TestKDSBumpWorkflow:
    """Test KDS bump workflow: new → acknowledged → preparing → ready → recall"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def _get_order_by_status(self, status):
        """Helper to find an order with specific kds_status"""
        response = requests.get(f"{BASE_URL}/api/kds/orders", headers=self.headers)
        if response.status_code != 200:
            return None
        orders = response.json()
        for order in orders:
            if order.get('kds_status') == status:
                return order
        return None
    
    def test_acknowledge_order(self):
        """PUT /api/kds/orders/{id}/acknowledge should set status to 'acknowledged'"""
        # Find a 'new' order
        order = self._get_order_by_status('new')
        if not order:
            pytest.skip("No 'new' orders available to test acknowledge")
        
        order_id = order['id']
        response = requests.put(f"{BASE_URL}/api/kds/orders/{order_id}/acknowledge", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['kds_status'] == 'acknowledged', f"Expected 'acknowledged', got {data['kds_status']}"
        print(f"PASSED: Order {order_id} acknowledged successfully")
    
    def test_start_preparing_order(self):
        """PUT /api/kds/orders/{id}/preparing should set status to 'preparing'"""
        # Find an 'acknowledged' order
        order = self._get_order_by_status('acknowledged')
        if not order:
            pytest.skip("No 'acknowledged' orders available to test preparing")
        
        order_id = order['id']
        response = requests.put(f"{BASE_URL}/api/kds/orders/{order_id}/preparing", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['kds_status'] == 'preparing', f"Expected 'preparing', got {data['kds_status']}"
        print(f"PASSED: Order {order_id} moved to preparing")
    
    def test_mark_order_ready(self):
        """PUT /api/kds/orders/{id}/ready should set status to 'ready'"""
        # Find a 'preparing' order
        order = self._get_order_by_status('preparing')
        if not order:
            pytest.skip("No 'preparing' orders available to test ready")
        
        order_id = order['id']
        response = requests.put(f"{BASE_URL}/api/kds/orders/{order_id}/ready", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['kds_status'] == 'ready', f"Expected 'ready', got {data['kds_status']}"
        print(f"PASSED: Order {order_id} marked as ready")
    
    def test_recall_order(self):
        """PUT /api/kds/orders/{id}/recall should set status back to 'preparing'"""
        # Find a 'ready' order
        order = self._get_order_by_status('ready')
        if not order:
            pytest.skip("No 'ready' orders available to test recall")
        
        order_id = order['id']
        response = requests.put(f"{BASE_URL}/api/kds/orders/{order_id}/recall", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['kds_status'] == 'preparing', f"Expected 'preparing', got {data['kds_status']}"
        print(f"PASSED: Order {order_id} recalled to preparing")


class TestKDSStatsEndpoint:
    """Test GET /api/kds/stats endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_kds_stats_success(self):
        """GET /api/kds/stats should return queue depth and avg prep time"""
        response = requests.get(f"{BASE_URL}/api/kds/stats", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        required_fields = ['queue_depth', 'avg_prep_time_display']
        for field in required_fields:
            assert field in data, f"Stats missing required field: {field}"
        
        print(f"PASSED: KDS stats returned - queue_depth: {data['queue_depth']}, avg_prep_time: {data['avg_prep_time_display']}")
    
    def test_kds_stats_has_status_counts(self):
        """Stats should include status_counts breakdown"""
        response = requests.get(f"{BASE_URL}/api/kds/stats", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert 'status_counts' in data, "Stats should have 'status_counts' field"
        assert isinstance(data['status_counts'], dict), "status_counts should be a dict"
        print(f"PASSED: KDS stats has status_counts: {data['status_counts']}")


class TestKDSErrorHandling:
    """Test KDS error handling"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_acknowledge_nonexistent_order(self):
        """Acknowledging non-existent order should return 404"""
        response = requests.put(f"{BASE_URL}/api/kds/orders/nonexistent_order_id/acknowledge", headers=self.headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASSED: Acknowledging non-existent order returns 404")
    
    def test_preparing_nonexistent_order(self):
        """Starting prep on non-existent order should return 404"""
        response = requests.put(f"{BASE_URL}/api/kds/orders/nonexistent_order_id/preparing", headers=self.headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASSED: Preparing non-existent order returns 404")
    
    def test_ready_nonexistent_order(self):
        """Marking non-existent order ready should return 404"""
        response = requests.put(f"{BASE_URL}/api/kds/orders/nonexistent_order_id/ready", headers=self.headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASSED: Ready non-existent order returns 404")
    
    def test_recall_nonexistent_order(self):
        """Recalling non-existent order should return 404"""
        response = requests.put(f"{BASE_URL}/api/kds/orders/nonexistent_order_id/recall", headers=self.headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASSED: Recalling non-existent order returns 404")


class TestRegressionPOSAndQR:
    """Regression tests for POS and QR Guest Menu"""
    
    def test_login_restaurant_admin(self):
        """Login with restaurant_admin/admin123 should work"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.status_code} - {response.text}"
        data = response.json()
        assert 'access_token' in data, "Response should contain access_token"
        print("PASSED: Login with restaurant_admin/admin123 works")
    
    def test_qr_menu_loads(self):
        """QR Guest Menu should load without auth"""
        response = requests.get(f"{BASE_URL}/api/qr/rest_demo_1/KrGTedTy")
        assert response.status_code == 200, f"QR menu failed: {response.status_code} - {response.text}"
        data = response.json()
        assert 'restaurant' in data, "Response should contain restaurant info"
        assert 'products' in data, "Response should contain products"
        print(f"PASSED: QR menu loads - {data['restaurant'].get('name', 'Unknown')}, {len(data['products'])} products")
    
    def test_pos_orders_pending(self):
        """GET /api/orders/pending should work for authenticated user"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        token = login_response.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/orders/pending", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASSED: GET /api/orders/pending returned {len(data)} pending orders")
    
    def test_dashboard_reports_today(self):
        """GET /api/reports/today should work for authenticated user"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        token = login_response.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/reports/today", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert 'total_sales' in data, "Response should contain total_sales"
        print(f"PASSED: GET /api/reports/today works - total_sales: {data.get('total_sales', 0)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
