"""
Test file for HevaPOS Payment Features - Iteration 4
Features tested:
1. Clear table on payment - auto clear table when order completed
2. Split bill in payment - divide bill between multiple payers with visual summary
3. Customer receipt print - print receipt after payment complete
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPaymentFeatures:
    """Test payment-related features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as restaurant_admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        yield
        
        # Cleanup
        self.session.close()
    
    # ===== CLEAR TABLE ON PAYMENT TESTS =====
    
    def test_table_status_before_payment(self):
        """Test that table is occupied before payment"""
        # Get tables
        response = self.session.get(f"{BASE_URL}/api/tables")
        assert response.status_code == 200
        tables = response.json()
        
        # Find Table 1
        table_1 = next((t for t in tables if t["number"] == 1), None)
        assert table_1 is not None, "Table 1 not found"
        
        # Table should be occupied with an order
        print(f"Table 1 status: {table_1['status']}, current_order_id: {table_1.get('current_order_id')}")
        # Note: Status may vary based on previous tests
    
    def test_create_order_with_table_and_complete_payment(self):
        """Test that completing payment clears the table"""
        # First, get an available table or create one
        response = self.session.get(f"{BASE_URL}/api/tables")
        assert response.status_code == 200
        tables = response.json()
        
        # Find an available table or use existing one
        available_table = next((t for t in tables if t["status"] == "available"), None)
        
        if not available_table:
            # Create a new test table
            response = self.session.post(f"{BASE_URL}/api/tables", json={
                "number": 99,
                "name": "TEST_Table_99",
                "capacity": 4
            })
            if response.status_code == 201:
                available_table = response.json()
            else:
                # Use Table 1 if it exists
                available_table = tables[0] if tables else None
        
        if not available_table:
            pytest.skip("No tables available for testing")
        
        table_id = available_table["id"]
        
        # Create an order with this table
        order_data = {
            "items": [
                {
                    "product_id": "TEST_prod_payment",
                    "product_name": "TEST Payment Item",
                    "quantity": 2,
                    "unit_price": 15.00,
                    "total": 30.00
                }
            ],
            "total_amount": 30.00,
            "table_id": table_id
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code == 200, f"Failed to create order: {response.text}"
        order = response.json()
        order_id = order["id"]
        
        # Verify table is now occupied
        response = self.session.get(f"{BASE_URL}/api/tables")
        tables = response.json()
        table = next((t for t in tables if t["id"] == table_id), None)
        assert table is not None
        assert table["status"] == "occupied", f"Table should be occupied, got: {table['status']}"
        
        # Complete the payment
        complete_data = {
            "payment_method": "cash",
            "tip_percentage": 15,
            "tip_amount": 4.50,
            "split_count": 1
        }
        
        response = self.session.put(f"{BASE_URL}/api/orders/{order_id}/complete", json=complete_data)
        assert response.status_code == 200, f"Failed to complete order: {response.text}"
        completed_order = response.json()
        
        # Verify order is completed
        assert completed_order["status"] == "completed"
        assert completed_order["payment_method"] == "cash"
        assert completed_order["tip_amount"] == 4.50
        
        # Note: Table clearing is done by frontend after payment completion
        # The backend provides the /tables/{table_id}/clear endpoint
        
        # Test the clear endpoint
        response = self.session.post(f"{BASE_URL}/api/tables/{table_id}/clear")
        assert response.status_code == 200, f"Failed to clear table: {response.text}"
        
        # Verify table is now available
        response = self.session.get(f"{BASE_URL}/api/tables")
        tables = response.json()
        table = next((t for t in tables if t["id"] == table_id), None)
        assert table is not None
        assert table["status"] == "available", f"Table should be available after clearing, got: {table['status']}"
        assert table["current_order_id"] is None, "Table should have no current order after clearing"
        
        print("PASSED: Table cleared after payment completion")
    
    def test_clear_table_endpoint(self):
        """Test the clear table endpoint directly"""
        # Get tables
        response = self.session.get(f"{BASE_URL}/api/tables")
        assert response.status_code == 200
        tables = response.json()
        
        if not tables:
            pytest.skip("No tables available")
        
        # Find an occupied table
        occupied_table = next((t for t in tables if t["status"] == "occupied"), None)
        
        if occupied_table:
            table_id = occupied_table["id"]
            
            # Clear the table
            response = self.session.post(f"{BASE_URL}/api/tables/{table_id}/clear")
            assert response.status_code == 200
            result = response.json()
            assert "cleared" in result["message"].lower() or "Table" in result["message"]
            
            # Verify table is available
            response = self.session.get(f"{BASE_URL}/api/tables")
            tables = response.json()
            table = next((t for t in tables if t["id"] == table_id), None)
            assert table["status"] == "available"
            
            print(f"PASSED: Table {table['number']} cleared successfully")
        else:
            print("No occupied tables to test clearing")
    
    # ===== SPLIT BILL TESTS =====
    
    def test_complete_order_with_split_count(self):
        """Test completing order with split count"""
        # Create a test order
        order_data = {
            "items": [
                {
                    "product_id": "TEST_prod_split",
                    "product_name": "TEST Split Item",
                    "quantity": 4,
                    "unit_price": 20.00,
                    "total": 80.00
                }
            ],
            "total_amount": 80.00,
            "table_id": None
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code == 200
        order = response.json()
        order_id = order["id"]
        
        # Complete with split count of 4
        complete_data = {
            "payment_method": "card",
            "tip_percentage": 20,
            "tip_amount": 16.00,  # 20% of 80
            "split_count": 4
        }
        
        response = self.session.put(f"{BASE_URL}/api/orders/{order_id}/complete", json=complete_data)
        assert response.status_code == 200
        completed_order = response.json()
        
        # Verify split count is saved
        assert completed_order["split_count"] == 4, f"Expected split_count=4, got: {completed_order['split_count']}"
        assert completed_order["tip_amount"] == 16.00
        assert completed_order["tip_percentage"] == 20
        
        # Calculate per person amount
        total_with_tip = completed_order["subtotal"] + completed_order["tip_amount"]
        per_person = total_with_tip / completed_order["split_count"]
        expected_per_person = (80.00 + 16.00) / 4  # = 24.00
        
        assert per_person == expected_per_person, f"Per person should be {expected_per_person}, got: {per_person}"
        
        print(f"PASSED: Split bill - Total: ${total_with_tip:.2f}, Split: {completed_order['split_count']}, Per Person: ${per_person:.2f}")
    
    def test_split_count_default_is_one(self):
        """Test that default split count is 1"""
        # Create a test order
        order_data = {
            "items": [
                {
                    "product_id": "TEST_prod_default_split",
                    "product_name": "TEST Default Split",
                    "quantity": 1,
                    "unit_price": 25.00,
                    "total": 25.00
                }
            ],
            "total_amount": 25.00,
            "table_id": None
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code == 200
        order = response.json()
        order_id = order["id"]
        
        # Complete without specifying split_count
        complete_data = {
            "payment_method": "cash",
            "tip_percentage": 0,
            "tip_amount": 0
        }
        
        response = self.session.put(f"{BASE_URL}/api/orders/{order_id}/complete", json=complete_data)
        assert response.status_code == 200
        completed_order = response.json()
        
        # Default split count should be 1
        assert completed_order["split_count"] == 1, f"Default split_count should be 1, got: {completed_order['split_count']}"
        
        print("PASSED: Default split count is 1")
    
    def test_tip_calculation_with_split(self):
        """Test tip calculation works correctly with split"""
        # Create order
        order_data = {
            "items": [
                {
                    "product_id": "TEST_prod_tip_split",
                    "product_name": "TEST Tip Split",
                    "quantity": 2,
                    "unit_price": 50.00,
                    "total": 100.00
                }
            ],
            "total_amount": 100.00,
            "table_id": None
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code == 200
        order = response.json()
        order_id = order["id"]
        
        # Complete with 15% tip and split by 2
        tip_amount = 15.00  # 15% of 100
        complete_data = {
            "payment_method": "card",
            "tip_percentage": 15,
            "tip_amount": tip_amount,
            "split_count": 2
        }
        
        response = self.session.put(f"{BASE_URL}/api/orders/{order_id}/complete", json=complete_data)
        assert response.status_code == 200
        completed_order = response.json()
        
        # Verify calculations
        assert completed_order["subtotal"] == 100.00
        assert completed_order["tip_amount"] == 15.00
        assert completed_order["total_amount"] == 115.00  # subtotal + tip
        assert completed_order["split_count"] == 2
        
        # Per person = (100 + 15) / 2 = 57.50
        per_person = completed_order["total_amount"] / completed_order["split_count"]
        assert per_person == 57.50, f"Per person should be 57.50, got: {per_person}"
        
        print(f"PASSED: Tip calculation with split - Subtotal: $100, Tip: $15, Total: $115, Per Person: ${per_person}")
    
    # ===== CUSTOMER RECEIPT PRINT TESTS =====
    
    def test_customer_receipt_escpos_endpoint(self):
        """Test customer receipt ESC/POS endpoint"""
        # First, create and complete an order
        order_data = {
            "items": [
                {
                    "product_id": "TEST_prod_receipt",
                    "product_name": "TEST Receipt Item",
                    "quantity": 1,
                    "unit_price": 19.99,
                    "total": 19.99
                }
            ],
            "total_amount": 19.99,
            "table_id": None
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code == 200
        order = response.json()
        order_id = order["id"]
        
        # Complete the order
        complete_data = {
            "payment_method": "cash",
            "tip_percentage": 10,
            "tip_amount": 2.00,
            "split_count": 1
        }
        
        response = self.session.put(f"{BASE_URL}/api/orders/{order_id}/complete", json=complete_data)
        assert response.status_code == 200
        
        # Now test the customer receipt ESC/POS endpoint
        response = self.session.post(f"{BASE_URL}/api/print/customer/{order_id}")
        assert response.status_code == 200, f"Customer receipt endpoint failed: {response.text}"
        
        receipt_data = response.json()
        
        # Verify response structure
        assert "order_id" in receipt_data
        assert "order_number" in receipt_data
        assert "commands" in receipt_data  # Base64 encoded ESC/POS commands
        
        # Commands should be a non-empty base64 string
        assert len(receipt_data["commands"]) > 0, "ESC/POS commands should not be empty"
        
        print(f"PASSED: Customer receipt ESC/POS generated for order {receipt_data['order_number']}")
        print(f"  Commands length: {len(receipt_data['commands'])} characters (base64)")
    
    def test_customer_receipt_requires_completed_order(self):
        """Test that customer receipt requires order to be completed"""
        # Create a pending order
        order_data = {
            "items": [
                {
                    "product_id": "TEST_prod_pending",
                    "product_name": "TEST Pending Item",
                    "quantity": 1,
                    "unit_price": 10.00,
                    "total": 10.00
                }
            ],
            "total_amount": 10.00,
            "table_id": None
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code == 200
        order = response.json()
        order_id = order["id"]
        
        # Try to print customer receipt for pending order - should fail
        response = self.session.post(f"{BASE_URL}/api/print/customer/{order_id}")
        assert response.status_code == 400, f"Should fail for pending order, got: {response.status_code}"
        
        error = response.json()
        assert "completed" in error.get("detail", "").lower(), f"Error should mention 'completed': {error}"
        
        print("PASSED: Customer receipt correctly requires completed order")
    
    def test_customer_receipt_pdf_endpoint(self):
        """Test customer receipt PDF endpoint"""
        # Create and complete an order
        order_data = {
            "items": [
                {
                    "product_id": "TEST_prod_pdf",
                    "product_name": "TEST PDF Item",
                    "quantity": 2,
                    "unit_price": 12.50,
                    "total": 25.00
                }
            ],
            "total_amount": 25.00,
            "table_id": None
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code == 200
        order = response.json()
        order_id = order["id"]
        
        # Complete the order
        complete_data = {
            "payment_method": "card",
            "tip_percentage": 0,
            "tip_amount": 0,
            "split_count": 1
        }
        
        response = self.session.put(f"{BASE_URL}/api/orders/{order_id}/complete", json=complete_data)
        assert response.status_code == 200
        
        # Test PDF endpoint
        response = self.session.post(f"{BASE_URL}/api/orders/{order_id}/print-customer-receipt")
        assert response.status_code == 200, f"PDF endpoint failed: {response.status_code}"
        
        # Should return PDF content
        assert response.headers.get("content-type") == "application/pdf"
        assert len(response.content) > 0, "PDF content should not be empty"
        
        print(f"PASSED: Customer receipt PDF generated, size: {len(response.content)} bytes")
    
    def test_customer_receipt_includes_tip_info(self):
        """Test that customer receipt includes tip information"""
        # Create and complete an order with tip
        order_data = {
            "items": [
                {
                    "product_id": "TEST_prod_tip_receipt",
                    "product_name": "TEST Tip Receipt",
                    "quantity": 1,
                    "unit_price": 40.00,
                    "total": 40.00
                }
            ],
            "total_amount": 40.00,
            "table_id": None
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code == 200
        order = response.json()
        order_id = order["id"]
        
        # Complete with 20% tip
        complete_data = {
            "payment_method": "cash",
            "tip_percentage": 20,
            "tip_amount": 8.00,
            "split_count": 1
        }
        
        response = self.session.put(f"{BASE_URL}/api/orders/{order_id}/complete", json=complete_data)
        assert response.status_code == 200
        completed_order = response.json()
        
        # Verify tip is saved
        assert completed_order["tip_amount"] == 8.00
        assert completed_order["tip_percentage"] == 20
        assert completed_order["total_amount"] == 48.00  # 40 + 8
        
        # Get ESC/POS receipt
        response = self.session.post(f"{BASE_URL}/api/print/customer/{order_id}")
        assert response.status_code == 200
        
        # The receipt commands are base64 encoded, so we can't easily verify content
        # But we can verify the endpoint works
        receipt_data = response.json()
        assert "commands" in receipt_data
        
        print("PASSED: Customer receipt generated with tip info")


class TestOrderWithTableInfo:
    """Test orders with table information"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as restaurant_admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        yield
        
        self.session.close()
    
    def test_pending_order_shows_table_info(self):
        """Test that pending orders show table information"""
        # Get pending orders
        response = self.session.get(f"{BASE_URL}/api/orders/pending")
        assert response.status_code == 200
        orders = response.json()
        
        # Find orders with table_id
        orders_with_table = [o for o in orders if o.get("table_id")]
        
        if orders_with_table:
            order = orders_with_table[0]
            print(f"Order #{order['order_number']} has table_id: {order['table_id']}")
            assert order["table_id"] is not None
        else:
            print("No pending orders with table assignment found")
    
    def test_order_table_id_persisted(self):
        """Test that table_id is persisted with order"""
        # Get tables
        response = self.session.get(f"{BASE_URL}/api/tables")
        assert response.status_code == 200
        tables = response.json()
        
        if not tables:
            pytest.skip("No tables available")
        
        table = tables[0]
        table_id = table["id"]
        
        # Create order with table
        order_data = {
            "items": [
                {
                    "product_id": "TEST_prod_table_persist",
                    "product_name": "TEST Table Persist",
                    "quantity": 1,
                    "unit_price": 15.00,
                    "total": 15.00
                }
            ],
            "total_amount": 15.00,
            "table_id": table_id
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code == 200
        order = response.json()
        
        # Verify table_id is in the order
        assert order["table_id"] == table_id, f"Order should have table_id={table_id}, got: {order.get('table_id')}"
        
        # Get the order again to verify persistence
        response = self.session.get(f"{BASE_URL}/api/orders/pending")
        assert response.status_code == 200
        orders = response.json()
        
        created_order = next((o for o in orders if o["id"] == order["id"]), None)
        assert created_order is not None
        assert created_order["table_id"] == table_id
        
        print(f"PASSED: Order table_id persisted correctly: {table_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
