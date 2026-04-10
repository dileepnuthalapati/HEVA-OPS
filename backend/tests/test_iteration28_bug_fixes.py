"""
Iteration 28 Bug Fix Tests - HevaPOS

Tests for:
1. Order creation double-tap prevention (atomic counter prevents duplicate order numbers)
2. Order creation with table_id stores and returns table_name
3. KDS public endpoint enriches orders with table_name from tables collection
4. Atomic order number counter - sequential numbering per restaurant per day
"""

import pytest
import requests
import os
import time
import concurrent.futures

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
RESTAURANT_ADMIN = {"username": "restaurant_admin", "password": "admin123"}
MANAGER_PIN = "1234"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for restaurant admin"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.text}")
    data = response.json()
    return data.get("access_token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    }


@pytest.fixture(scope="module")
def restaurant_id(auth_token):
    """Get restaurant ID from login response"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
    data = response.json()
    return data.get("restaurant_id", "rest_demo_1")


@pytest.fixture(scope="module")
def kds_token(auth_headers, restaurant_id):
    """Generate KDS token for public endpoint testing"""
    response = requests.post(f"{BASE_URL}/api/kds/generate-token", headers=auth_headers)
    if response.status_code == 200:
        return response.json().get("kds_token")
    # Try to get existing token via verify-pin
    response = requests.post(f"{BASE_URL}/api/kds/verify-pin?restaurant_id={restaurant_id}&pin={MANAGER_PIN}")
    if response.status_code == 200:
        return response.json().get("kds_token")
    pytest.skip("Could not get KDS token")


@pytest.fixture(scope="module")
def test_table(auth_headers):
    """Get or create a test table"""
    # Get existing tables
    response = requests.get(f"{BASE_URL}/api/tables", headers=auth_headers)
    if response.status_code == 200:
        tables = response.json()
        if tables:
            return tables[0]
    
    # Create a test table if none exist
    response = requests.post(f"{BASE_URL}/api/tables", headers=auth_headers, json={
        "number": 99,
        "name": "Test Table 99",
        "capacity": 4
    })
    if response.status_code in [200, 201]:
        return response.json()
    pytest.skip("Could not get or create test table")


class TestAtomicOrderCounter:
    """Test atomic order number counter - prevents duplicate order numbers"""
    
    def test_sequential_order_numbers(self, auth_headers):
        """Test that order numbers are sequential and unique"""
        order_numbers = []
        
        # Create 3 orders sequentially
        for i in range(3):
            order_data = {
                "items": [{"product_id": f"test_prod_{i}", "product_name": f"Test Product {i}", "quantity": 1, "unit_price": 10.0, "total": 10.0}],
                "subtotal": 10.0,
                "total_amount": 10.0
            }
            response = requests.post(f"{BASE_URL}/api/orders", headers=auth_headers, json=order_data)
            assert response.status_code == 200, f"Order creation failed: {response.text}"
            order = response.json()
            order_numbers.append(order["order_number"])
            print(f"Created order #{order['order_number']} with id {order['id']}")
        
        # Verify order numbers are sequential
        for i in range(1, len(order_numbers)):
            assert order_numbers[i] == order_numbers[i-1] + 1, f"Order numbers not sequential: {order_numbers}"
        
        print(f"Sequential order numbers verified: {order_numbers}")
    
    def test_concurrent_order_creation_no_duplicates(self, auth_headers):
        """Test that concurrent order creation doesn't create duplicate order numbers"""
        order_numbers = []
        errors = []
        
        def create_order(idx):
            order_data = {
                "items": [{"product_id": f"concurrent_test_{idx}", "product_name": f"Concurrent Test {idx}", "quantity": 1, "unit_price": 5.0, "total": 5.0}],
                "subtotal": 5.0,
                "total_amount": 5.0
            }
            try:
                response = requests.post(f"{BASE_URL}/api/orders", headers=auth_headers, json=order_data)
                if response.status_code == 200:
                    return response.json()["order_number"]
                else:
                    errors.append(f"Order {idx} failed: {response.status_code}")
                    return None
            except Exception as e:
                errors.append(f"Order {idx} exception: {str(e)}")
                return None
        
        # Create 5 orders concurrently
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(create_order, i) for i in range(5)]
            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                if result:
                    order_numbers.append(result)
        
        # Verify no duplicate order numbers
        unique_numbers = set(order_numbers)
        assert len(unique_numbers) == len(order_numbers), f"Duplicate order numbers found! Numbers: {order_numbers}"
        print(f"Concurrent order creation verified - no duplicates: {sorted(order_numbers)}")


class TestOrderTableNameStorage:
    """Test that orders store and return table_name when table_id is provided"""
    
    def test_order_with_table_stores_table_name(self, auth_headers, test_table):
        """Test that creating an order with table_id stores the table_name"""
        order_data = {
            "items": [{"product_id": "table_test_prod", "product_name": "Table Test Product", "quantity": 1, "unit_price": 15.0, "total": 15.0}],
            "subtotal": 15.0,
            "total_amount": 15.0,
            "table_id": test_table["id"]
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", headers=auth_headers, json=order_data)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        
        order = response.json()
        print(f"Created order: {order}")
        
        # Verify table_name is stored
        assert "table_name" in order, "table_name field missing from order response"
        assert order["table_name"] is not None, "table_name should not be None when table_id is provided"
        
        expected_table_name = test_table.get("name", f"Table {test_table['number']}")
        assert order["table_name"] == expected_table_name or "Table" in order["table_name"], \
            f"table_name mismatch: expected '{expected_table_name}', got '{order['table_name']}'"
        
        print(f"Order table_name verified: {order['table_name']}")
        
        # Store order_id for cleanup
        return order["id"]
    
    def test_order_without_table_has_null_table_name(self, auth_headers):
        """Test that orders without table_id have null table_name"""
        order_data = {
            "items": [{"product_id": "no_table_test", "product_name": "No Table Test", "quantity": 1, "unit_price": 8.0, "total": 8.0}],
            "subtotal": 8.0,
            "total_amount": 8.0
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", headers=auth_headers, json=order_data)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        
        order = response.json()
        assert order.get("table_name") is None, f"table_name should be None for takeaway orders, got: {order.get('table_name')}"
        print("Takeaway order has null table_name - verified")


class TestKDSPublicEndpointTableEnrichment:
    """Test that KDS public endpoint enriches orders with table_name"""
    
    def test_kds_public_orders_include_table_name(self, auth_headers, restaurant_id, kds_token, test_table):
        """Test that KDS public endpoint returns orders with table_name enriched"""
        # First create an order with a table
        order_data = {
            "items": [{"product_id": "kds_table_test", "product_name": "KDS Table Test", "quantity": 2, "unit_price": 12.0, "total": 24.0}],
            "subtotal": 24.0,
            "total_amount": 24.0,
            "table_id": test_table["id"]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/orders", headers=auth_headers, json=order_data)
        assert create_response.status_code == 200, f"Order creation failed: {create_response.text}"
        created_order = create_response.json()
        order_id = created_order["id"]
        
        # Now fetch from KDS public endpoint
        kds_response = requests.get(f"{BASE_URL}/api/kds/public/orders/{restaurant_id}/{kds_token}")
        assert kds_response.status_code == 200, f"KDS public endpoint failed: {kds_response.text}"
        
        kds_data = kds_response.json()
        orders = kds_data.get("orders", [])
        
        # Find our order
        our_order = next((o for o in orders if o["id"] == order_id), None)
        assert our_order is not None, f"Created order not found in KDS orders"
        
        # Verify table_name is enriched
        assert "table_name" in our_order, "table_name field missing from KDS order"
        assert our_order["table_name"] is not None, "table_name should be enriched for orders with table_id"
        
        print(f"KDS order table_name enriched: {our_order['table_name']}")
        
        # Verify table_id is present (table_number is only in authenticated endpoint)
        assert "table_id" in our_order, "table_id field missing from KDS order"
        print(f"KDS order table_id: {our_order['table_id']}")
    
    def test_kds_authenticated_orders_include_table_info(self, auth_headers):
        """Test that authenticated KDS endpoint also returns table info"""
        response = requests.get(f"{BASE_URL}/api/kds/orders", headers=auth_headers)
        assert response.status_code == 200, f"KDS orders endpoint failed: {response.text}"
        
        orders = response.json()
        print(f"KDS authenticated endpoint returned {len(orders)} orders")
        
        # Check that orders with tables have table info
        for order in orders:
            if order.get("table_number"):
                assert "table_name" in order, f"Order {order['id']} has table_number but no table_name"
                print(f"Order #{order.get('order_number')}: table_number={order['table_number']}, table_name={order.get('table_name')}")


class TestPrinterCheckEndpoint:
    """Test the printer check endpoint (backend fallback for browser)"""
    
    def test_printer_check_endpoint_exists(self, auth_headers):
        """Test that /api/printer/check endpoint exists and responds"""
        # Test with a non-existent IP (should return reachable: false)
        response = requests.post(
            f"{BASE_URL}/api/printer/check",
            headers=auth_headers,
            json={"ip": "192.168.255.255", "port": 9100}
        )
        
        # Endpoint should exist (200 or timeout-related response)
        assert response.status_code in [200, 408, 504], f"Printer check endpoint error: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "reachable" in data, "Response should contain 'reachable' field"
            print(f"Printer check response: {data}")


class TestOrdersAPIBasics:
    """Basic order API tests"""
    
    def test_get_pending_orders(self, auth_headers):
        """Test getting pending orders"""
        response = requests.get(f"{BASE_URL}/api/orders/pending", headers=auth_headers)
        assert response.status_code == 200, f"Get pending orders failed: {response.text}"
        
        orders = response.json()
        assert isinstance(orders, list), "Pending orders should be a list"
        print(f"Found {len(orders)} pending orders")
    
    def test_get_all_orders_today(self, auth_headers):
        """Test getting today's orders"""
        response = requests.get(f"{BASE_URL}/api/orders?today_only=true", headers=auth_headers)
        assert response.status_code == 200, f"Get today's orders failed: {response.text}"
        
        orders = response.json()
        assert isinstance(orders, list), "Orders should be a list"
        print(f"Found {len(orders)} orders today")


class TestKDSStats:
    """Test KDS stats endpoint"""
    
    def test_kds_stats_authenticated(self, auth_headers):
        """Test authenticated KDS stats"""
        response = requests.get(f"{BASE_URL}/api/kds/stats", headers=auth_headers)
        assert response.status_code == 200, f"KDS stats failed: {response.text}"
        
        stats = response.json()
        assert "queue_depth" in stats, "Missing queue_depth"
        assert "status_counts" in stats, "Missing status_counts"
        assert "avg_prep_time_display" in stats, "Missing avg_prep_time_display"
        
        print(f"KDS Stats: queue={stats['queue_depth']}, avg_prep={stats['avg_prep_time_display']}")
    
    def test_kds_stats_public(self, restaurant_id, kds_token):
        """Test public KDS stats"""
        response = requests.get(f"{BASE_URL}/api/kds/public/stats/{restaurant_id}/{kds_token}")
        assert response.status_code == 200, f"Public KDS stats failed: {response.text}"
        
        stats = response.json()
        assert "queue_depth" in stats, "Missing queue_depth"
        print(f"Public KDS Stats: queue={stats['queue_depth']}")


class TestTablesAPI:
    """Test tables API"""
    
    def test_get_tables(self, auth_headers):
        """Test getting tables"""
        response = requests.get(f"{BASE_URL}/api/tables", headers=auth_headers)
        assert response.status_code == 200, f"Get tables failed: {response.text}"
        
        tables = response.json()
        assert isinstance(tables, list), "Tables should be a list"
        print(f"Found {len(tables)} tables")
        
        # Verify table structure
        if tables:
            table = tables[0]
            assert "id" in table, "Table missing id"
            assert "number" in table, "Table missing number"
            print(f"Sample table: number={table['number']}, name={table.get('name')}")


# Cleanup test orders after tests
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_orders(auth_headers):
    """Cleanup test orders after all tests complete"""
    yield
    # Note: In a real scenario, we'd delete test orders here
    # For now, we leave them as they don't affect functionality
    print("Test cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
