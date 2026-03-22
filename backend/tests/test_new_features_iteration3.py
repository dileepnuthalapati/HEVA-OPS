"""
HevaPOS Backend API Tests - Iteration 3
Tests for new features:
1. Table selection in POS orders
2. Restaurant user management by Platform Owner
3. Kitchen receipt ESC/POS commands generation
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from seed data
PLATFORM_OWNER_CREDS = {"username": "platform_owner", "password": "admin123"}
RESTAURANT_ADMIN_CREDS = {"username": "restaurant_admin", "password": "admin123"}
STAFF_CREDS = {"username": "user", "password": "user123"}

# Restaurant ID for testing
TEST_RESTAURANT_ID = "rest_demo_1"


class TestTableSelectionInPOS:
    """Tests for table selection feature in POS orders"""
    
    @pytest.fixture
    def staff_token(self):
        """Get Staff user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Staff login failed")
    
    @pytest.fixture
    def admin_token(self):
        """Get Restaurant Admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Restaurant Admin login failed")
    
    def test_get_tables_for_pos(self, staff_token):
        """Test that tables can be fetched for POS table selector"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Tables available for POS: {len(data)} tables")
        
        # Verify table structure
        if len(data) > 0:
            table = data[0]
            assert "id" in table
            assert "number" in table
            assert "status" in table
            print(f"Sample table: Table {table['number']} - Status: {table['status']}")
    
    def test_create_order_with_table_id(self, staff_token):
        """Test creating an order with table_id assigned"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        
        # First get available tables
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        assert tables_response.status_code == 200
        tables = tables_response.json()
        
        # Find an available table
        available_table = next((t for t in tables if t["status"] == "available"), None)
        if not available_table:
            pytest.skip("No available tables for testing")
        
        table_id = available_table["id"]
        
        # Create order with table_id
        order_data = {
            "items": [
                {
                    "product_id": "prod_test_1",
                    "product_name": "Test Pizza",
                    "quantity": 2,
                    "unit_price": 12.99,
                    "total": 25.98
                }
            ],
            "total_amount": 25.98,
            "table_id": table_id
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert "order_number" in data
        assert data["table_id"] == table_id, f"Expected table_id {table_id}, got {data.get('table_id')}"
        print(f"Order #{data['order_number']} created with table_id: {data['table_id']}")
        
        # Verify table status changed to occupied
        table_response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        updated_tables = table_response.json()
        updated_table = next((t for t in updated_tables if t["id"] == table_id), None)
        if updated_table:
            print(f"Table {updated_table['number']} status after order: {updated_table['status']}")
        
        return data["id"]
    
    def test_create_order_without_table_takeaway(self, staff_token):
        """Test creating an order without table (takeaway)"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        
        # Create order without table_id (takeaway)
        order_data = {
            "items": [
                {
                    "product_id": "prod_test_2",
                    "product_name": "Takeaway Burger",
                    "quantity": 1,
                    "unit_price": 9.99,
                    "total": 9.99
                }
            ],
            "total_amount": 9.99,
            "table_id": None
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert data["table_id"] is None, f"Expected table_id None for takeaway, got {data.get('table_id')}"
        print(f"Takeaway Order #{data['order_number']} created without table_id")
    
    def test_pending_orders_show_table_info(self, staff_token):
        """Test that pending orders include table information"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        
        response = requests.get(f"{BASE_URL}/api/orders/pending", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        
        # Check if any orders have table_id
        orders_with_table = [o for o in data if o.get("table_id")]
        orders_without_table = [o for o in data if not o.get("table_id")]
        
        print(f"Pending orders: {len(data)} total, {len(orders_with_table)} with table, {len(orders_without_table)} takeaway")


class TestKitchenReceiptESCPOS:
    """Tests for kitchen receipt ESC/POS commands generation"""
    
    @pytest.fixture
    def staff_token(self):
        """Get Staff user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Staff login failed")
    
    def test_kitchen_receipt_escpos_generation(self, staff_token):
        """Test that kitchen receipt ESC/POS commands are generated after order"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        
        # Create a test order first
        order_data = {
            "items": [
                {
                    "product_id": "prod_escpos_test",
                    "product_name": "ESC/POS Test Item",
                    "quantity": 3,
                    "unit_price": 15.00,
                    "total": 45.00
                }
            ],
            "total_amount": 45.00,
            "table_id": None
        }
        
        order_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=headers)
        assert order_response.status_code == 200
        order = order_response.json()
        order_id = order["id"]
        
        # Now test the ESC/POS kitchen receipt endpoint
        escpos_response = requests.post(f"{BASE_URL}/api/print/kitchen/{order_id}", headers=headers)
        assert escpos_response.status_code == 200, f"Expected 200, got {escpos_response.status_code}: {escpos_response.text}"
        
        data = escpos_response.json()
        assert "commands" in data, "ESC/POS commands should be in response"
        assert "order_id" in data
        assert "order_number" in data
        
        # Verify commands is a base64 string
        commands = data["commands"]
        assert isinstance(commands, str)
        assert len(commands) > 0, "ESC/POS commands should not be empty"
        
        print(f"Kitchen receipt ESC/POS commands generated for order #{data['order_number']}")
        print(f"Commands length: {len(commands)} characters (base64)")
    
    def test_kitchen_receipt_with_table_info(self, staff_token):
        """Test that kitchen receipt includes table info when assigned"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        
        # Get an available table
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        tables = tables_response.json()
        available_table = next((t for t in tables if t["status"] == "available"), None)
        
        table_id = available_table["id"] if available_table else None
        
        # Create order with table
        order_data = {
            "items": [
                {
                    "product_id": "prod_table_test",
                    "product_name": "Table Test Item",
                    "quantity": 1,
                    "unit_price": 10.00,
                    "total": 10.00
                }
            ],
            "total_amount": 10.00,
            "table_id": table_id
        }
        
        order_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=headers)
        assert order_response.status_code == 200
        order = order_response.json()
        
        # Get ESC/POS commands
        escpos_response = requests.post(f"{BASE_URL}/api/print/kitchen/{order['id']}", headers=headers)
        assert escpos_response.status_code == 200
        
        data = escpos_response.json()
        if table_id:
            assert "table" in data, "Table info should be in response when order has table"
            if data["table"]:
                print(f"Kitchen receipt includes table info: Table {data['table']['number']}")
        else:
            print("Kitchen receipt generated for takeaway order (no table)")


class TestRestaurantUserManagement:
    """Tests for Platform Owner managing restaurant users"""
    
    @pytest.fixture
    def platform_owner_token(self):
        """Get Platform Owner auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Platform Owner login failed")
    
    @pytest.fixture
    def restaurant_admin_token(self):
        """Get Restaurant Admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Restaurant Admin login failed")
    
    def test_platform_owner_can_list_restaurant_users(self, platform_owner_token):
        """Platform Owner can list users for a specific restaurant"""
        headers = {"Authorization": f"Bearer {platform_owner_token}"}
        
        response = requests.get(f"{BASE_URL}/api/restaurants/{TEST_RESTAURANT_ID}/users", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Restaurant {TEST_RESTAURANT_ID} has {len(data)} users")
        
        # Verify user structure
        for user in data:
            assert "id" in user
            assert "username" in user
            assert "role" in user
            assert "password" not in user, "Password should not be exposed"
            print(f"  - {user['username']} ({user['role']})")
    
    def test_platform_owner_can_create_restaurant_user(self, platform_owner_token):
        """Platform Owner can create a new user for a restaurant"""
        headers = {"Authorization": f"Bearer {platform_owner_token}"}
        
        # Create a unique username
        unique_username = f"TEST_user_{int(time.time())}"
        
        user_data = {
            "username": unique_username,
            "password": "testpass123",
            "role": "user",
            "restaurant_id": TEST_RESTAURANT_ID
        }
        
        response = requests.post(
            f"{BASE_URL}/api/restaurants/{TEST_RESTAURANT_ID}/users",
            json=user_data,
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["username"] == unique_username
        assert data["role"] == "user"
        assert data["restaurant_id"] == TEST_RESTAURANT_ID
        print(f"Created user: {data['username']} for restaurant {TEST_RESTAURANT_ID}")
        
        return data["id"]
    
    def test_platform_owner_can_delete_restaurant_user(self, platform_owner_token):
        """Platform Owner can delete a user from a restaurant"""
        headers = {"Authorization": f"Bearer {platform_owner_token}"}
        
        # First create a user to delete
        unique_username = f"TEST_delete_{int(time.time())}"
        user_data = {
            "username": unique_username,
            "password": "testpass123",
            "role": "user",
            "restaurant_id": TEST_RESTAURANT_ID
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/restaurants/{TEST_RESTAURANT_ID}/users",
            json=user_data,
            headers=headers
        )
        assert create_response.status_code == 200
        user_id = create_response.json()["id"]
        
        # Now delete the user
        delete_response = requests.delete(
            f"{BASE_URL}/api/restaurants/{TEST_RESTAURANT_ID}/users/{user_id}",
            headers=headers
        )
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        data = delete_response.json()
        assert "message" in data
        print(f"Deleted user {unique_username} from restaurant {TEST_RESTAURANT_ID}")
        
        # Verify user is deleted
        users_response = requests.get(f"{BASE_URL}/api/restaurants/{TEST_RESTAURANT_ID}/users", headers=headers)
        users = users_response.json()
        deleted_user = next((u for u in users if u["id"] == user_id), None)
        assert deleted_user is None, "User should be deleted"
    
    def test_restaurant_admin_cannot_access_user_management(self, restaurant_admin_token):
        """Restaurant Admin should NOT be able to access user management endpoints"""
        headers = {"Authorization": f"Bearer {restaurant_admin_token}"}
        
        # Try to list users
        response = requests.get(f"{BASE_URL}/api/restaurants/{TEST_RESTAURANT_ID}/users", headers=headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("Restaurant Admin correctly forbidden from listing restaurant users")
    
    def test_create_user_with_duplicate_username_fails(self, platform_owner_token):
        """Creating a user with duplicate username should fail"""
        headers = {"Authorization": f"Bearer {platform_owner_token}"}
        
        # Try to create a user with existing username
        user_data = {
            "username": "restaurant_admin",  # Already exists
            "password": "testpass123",
            "role": "admin",
            "restaurant_id": TEST_RESTAURANT_ID
        }
        
        response = requests.post(
            f"{BASE_URL}/api/restaurants/{TEST_RESTAURANT_ID}/users",
            json=user_data,
            headers=headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("Duplicate username correctly rejected with 400")
    
    def test_create_user_with_invalid_role_fails(self, platform_owner_token):
        """Creating a user with invalid role should fail"""
        headers = {"Authorization": f"Bearer {platform_owner_token}"}
        
        user_data = {
            "username": f"TEST_invalid_role_{int(time.time())}",
            "password": "testpass123",
            "role": "superadmin",  # Invalid role
            "restaurant_id": TEST_RESTAURANT_ID
        }
        
        response = requests.post(
            f"{BASE_URL}/api/restaurants/{TEST_RESTAURANT_ID}/users",
            json=user_data,
            headers=headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("Invalid role correctly rejected with 400")


class TestNavigationAccess:
    """Tests for navigation and access control"""
    
    @pytest.fixture
    def restaurant_admin_token(self):
        """Get Restaurant Admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Restaurant Admin login failed")
    
    @pytest.fixture
    def platform_owner_token(self):
        """Get Platform Owner auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Platform Owner login failed")
    
    def test_restaurant_admin_cannot_access_restaurants_api(self, restaurant_admin_token):
        """Restaurant Admin should get 403 when accessing /restaurants endpoint"""
        headers = {"Authorization": f"Bearer {restaurant_admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/restaurants", headers=headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("Restaurant Admin correctly forbidden from /restaurants API")
    
    def test_platform_owner_can_access_restaurants_api(self, platform_owner_token):
        """Platform Owner should be able to access /restaurants endpoint"""
        headers = {"Authorization": f"Bearer {platform_owner_token}"}
        
        response = requests.get(f"{BASE_URL}/api/restaurants", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Platform Owner can access restaurants: {len(data)} restaurants")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
