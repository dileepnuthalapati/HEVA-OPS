"""
HevaPOS Backend API Tests - Tables, Printers, and Reservations
Tests for Table Management, ESC/POS Printer support, and Reservations APIs
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from seed data
RESTAURANT_ADMIN_CREDS = {"username": "restaurant_admin", "password": "admin123"}
STAFF_CREDS = {"username": "user", "password": "user123"}


class TestTablesAPI:
    """Tables API tests - CRUD operations and table management"""
    
    @pytest.fixture
    def admin_token(self):
        """Get Restaurant Admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Restaurant Admin login failed")
    
    @pytest.fixture
    def staff_token(self):
        """Get Staff user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Staff login failed")
    
    def test_get_tables_returns_tables(self, staff_token):
        """GET /api/tables should return list of tables"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Tables API returned {len(data)} tables")
        
        # Verify table structure if tables exist
        if len(data) > 0:
            table = data[0]
            assert "id" in table
            assert "number" in table
            assert "name" in table
            assert "capacity" in table
            assert "status" in table
            print(f"Sample table: Table {table['number']} - {table['name']} (capacity: {table['capacity']}, status: {table['status']})")
    
    def test_create_table(self, admin_token):
        """POST /api/tables should create a new table"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Use a unique table number to avoid conflicts
        table_number = 99
        
        # First, try to delete if exists (cleanup from previous tests)
        existing_response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        if existing_response.status_code == 200:
            existing_tables = existing_response.json()
            for t in existing_tables:
                if t["number"] == table_number:
                    requests.delete(f"{BASE_URL}/api/tables/{t['id']}", headers=headers)
        
        # Create new table
        new_table = {
            "number": table_number,
            "capacity": 6
        }
        response = requests.post(f"{BASE_URL}/api/tables", json=new_table, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["number"] == table_number
        assert data["capacity"] == 6
        assert data["status"] == "available"
        assert "id" in data
        print(f"Created table: {data['name']} (ID: {data['id']})")
        
        # Cleanup - delete the test table
        delete_response = requests.delete(f"{BASE_URL}/api/tables/{data['id']}", headers=headers)
        assert delete_response.status_code == 200
        print("Test table cleaned up successfully")
    
    def test_merge_tables(self, admin_token):
        """POST /api/tables/merge should merge multiple tables"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get existing tables
        response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        assert response.status_code == 200
        tables = response.json()
        
        if len(tables) < 2:
            pytest.skip("Need at least 2 tables to test merge")
        
        # Get two available tables
        available_tables = [t for t in tables if t["status"] == "available"]
        if len(available_tables) < 2:
            pytest.skip("Need at least 2 available tables to test merge")
        
        table_ids = [available_tables[0]["id"], available_tables[1]["id"]]
        
        # Merge tables
        merge_response = requests.post(
            f"{BASE_URL}/api/tables/merge",
            json={"table_ids": table_ids},
            headers=headers
        )
        assert merge_response.status_code == 200, f"Expected 200, got {merge_response.status_code}: {merge_response.text}"
        
        data = merge_response.json()
        assert "message" in data
        assert "primary_table_id" in data
        print(f"Merge result: {data['message']}")
        
        # Unmerge to restore state
        unmerge_response = requests.post(
            f"{BASE_URL}/api/tables/{data['primary_table_id']}/unmerge",
            headers=headers
        )
        assert unmerge_response.status_code == 200
        print("Tables unmerged successfully")
    
    def test_clear_table(self, staff_token):
        """POST /api/tables/{id}/clear should clear a table"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        
        # Get existing tables
        response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        assert response.status_code == 200
        tables = response.json()
        
        if len(tables) == 0:
            pytest.skip("No tables available to test clear")
        
        # Use first table
        table_id = tables[0]["id"]
        
        # Clear the table
        clear_response = requests.post(
            f"{BASE_URL}/api/tables/{table_id}/clear",
            headers=headers
        )
        assert clear_response.status_code == 200, f"Expected 200, got {clear_response.status_code}: {clear_response.text}"
        
        data = clear_response.json()
        assert "message" in data
        print(f"Clear table result: {data['message']}")
        
        # Verify table is now available
        verify_response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        tables_after = verify_response.json()
        cleared_table = next((t for t in tables_after if t["id"] == table_id), None)
        assert cleared_table is not None
        assert cleared_table["status"] == "available"
        print(f"Table {cleared_table['number']} is now available")


class TestPrintersAPI:
    """Printers API tests - CRUD operations and ESC/POS commands"""
    
    @pytest.fixture
    def admin_token(self):
        """Get Restaurant Admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Restaurant Admin login failed")
    
    def test_get_printers_returns_printers(self, admin_token):
        """GET /api/printers should return list of printers"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/printers", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Printers API returned {len(data)} printers")
        
        # Verify printer structure if printers exist
        if len(data) > 0:
            printer = data[0]
            assert "id" in printer
            assert "name" in printer
            assert "type" in printer
            assert "address" in printer
            assert "paper_width" in printer
            print(f"Sample printer: {printer['name']} ({printer['type']}) - {printer['address']}")
    
    def test_create_printer(self, admin_token):
        """POST /api/printers should create a new printer"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        new_printer = {
            "name": "TEST_Kitchen Printer",
            "type": "wifi",
            "address": "192.168.1.200:9100",
            "is_default": False,
            "paper_width": 80
        }
        response = requests.post(f"{BASE_URL}/api/printers", json=new_printer, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["name"] == "TEST_Kitchen Printer"
        assert data["type"] == "wifi"
        assert data["address"] == "192.168.1.200:9100"
        assert data["paper_width"] == 80
        assert "id" in data
        print(f"Created printer: {data['name']} (ID: {data['id']})")
        
        # Cleanup - delete the test printer
        delete_response = requests.delete(f"{BASE_URL}/api/printers/{data['id']}", headers=headers)
        assert delete_response.status_code == 200
        print("Test printer cleaned up successfully")
    
    def test_printer_test_generates_escpos_commands(self, admin_token):
        """POST /api/printers/{id}/test should generate ESC/POS test commands"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get existing printers
        response = requests.get(f"{BASE_URL}/api/printers", headers=headers)
        assert response.status_code == 200
        printers = response.json()
        
        if len(printers) == 0:
            # Create a test printer first
            new_printer = {
                "name": "TEST_Temp Printer",
                "type": "wifi",
                "address": "192.168.1.201:9100",
                "is_default": False,
                "paper_width": 80
            }
            create_response = requests.post(f"{BASE_URL}/api/printers", json=new_printer, headers=headers)
            assert create_response.status_code == 200
            printer_id = create_response.json()["id"]
            cleanup_needed = True
        else:
            printer_id = printers[0]["id"]
            cleanup_needed = False
        
        # Test the printer
        test_response = requests.post(
            f"{BASE_URL}/api/printers/{printer_id}/test",
            headers=headers
        )
        assert test_response.status_code == 200, f"Expected 200, got {test_response.status_code}: {test_response.text}"
        
        data = test_response.json()
        assert "message" in data
        assert "commands" in data
        assert "printer" in data
        assert "type" in data
        assert "address" in data
        
        # Verify commands is Base64 encoded
        import base64
        try:
            decoded = base64.b64decode(data["commands"])
            assert len(decoded) > 0
            print(f"Test receipt generated: {len(decoded)} bytes of ESC/POS commands")
        except Exception as e:
            pytest.fail(f"Commands not valid Base64: {e}")
        
        print(f"Printer test result: {data['message']}")
        
        # Cleanup if we created a test printer
        if cleanup_needed:
            requests.delete(f"{BASE_URL}/api/printers/{printer_id}", headers=headers)


class TestReservationsAPI:
    """Reservations API tests - CRUD operations"""
    
    @pytest.fixture
    def admin_token(self):
        """Get Restaurant Admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Restaurant Admin login failed")
    
    def test_get_reservations(self, admin_token):
        """GET /api/reservations should return list of reservations"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/reservations", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Reservations API returned {len(data)} reservations")
        
        # Verify reservation structure if reservations exist
        if len(data) > 0:
            res = data[0]
            assert "id" in res
            assert "table_id" in res
            assert "customer_name" in res
            assert "party_size" in res
            assert "reservation_time" in res
            assert "status" in res
            print(f"Sample reservation: {res['customer_name']} - {res['party_size']} guests at {res['reservation_time']}")
    
    def test_create_reservation(self, admin_token):
        """POST /api/reservations should create a new reservation"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get a table to reserve
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        assert tables_response.status_code == 200
        tables = tables_response.json()
        
        if len(tables) == 0:
            pytest.skip("No tables available to create reservation")
        
        # Find an available table
        available_table = next((t for t in tables if t["status"] == "available"), None)
        if not available_table:
            pytest.skip("No available tables for reservation")
        
        # Create reservation for 3 days from now at a unique time to avoid conflicts
        import random
        future_date = (datetime.now() + timedelta(days=3)).replace(hour=11, minute=0, second=0, microsecond=0)
        # Add random minutes to avoid conflicts
        future_date = future_date + timedelta(minutes=random.randint(0, 59))
        
        new_reservation = {
            "table_id": available_table["id"],
            "customer_name": "TEST_John Doe",
            "customer_phone": "555-1234",
            "party_size": 4,
            "reservation_time": future_date.isoformat(),
            "duration_minutes": 60,  # Shorter duration to reduce conflicts
            "notes": "Birthday celebration"
        }
        
        response = requests.post(f"{BASE_URL}/api/reservations", json=new_reservation, headers=headers)
        
        # If conflict, try a different time
        if response.status_code == 400 and "already reserved" in response.text:
            future_date = future_date + timedelta(hours=3)
            new_reservation["reservation_time"] = future_date.isoformat()
            response = requests.post(f"{BASE_URL}/api/reservations", json=new_reservation, headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["customer_name"] == "TEST_John Doe"
        assert data["party_size"] == 4
        assert data["status"] == "confirmed"
        assert "id" in data
        print(f"Created reservation: {data['customer_name']} for {data['party_size']} guests (ID: {data['id']})")
        
        # Cleanup - cancel the test reservation
        cancel_response = requests.delete(f"{BASE_URL}/api/reservations/{data['id']}", headers=headers)
        assert cancel_response.status_code == 200
        print("Test reservation cleaned up successfully")


class TestPrintAPI:
    """Print API tests - ESC/POS receipt generation"""
    
    @pytest.fixture
    def admin_token(self):
        """Get Restaurant Admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Restaurant Admin login failed")
    
    @pytest.fixture
    def staff_token(self):
        """Get Staff user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Staff login failed")
    
    def test_print_kitchen_receipt_escpos(self, staff_token):
        """POST /api/print/kitchen/{order_id} should generate ESC/POS kitchen receipt"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        
        # First, create an order to print
        order_data = {
            "items": [
                {
                    "product_id": "test_prod_1",
                    "product_name": "Test Pizza",
                    "quantity": 2,
                    "unit_price": 12.99,
                    "total": 25.98
                }
            ],
            "total_amount": 25.98
        }
        
        create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=headers)
        assert create_response.status_code == 200, f"Failed to create order: {create_response.text}"
        order_id = create_response.json()["id"]
        
        # Generate kitchen receipt
        print_response = requests.post(
            f"{BASE_URL}/api/print/kitchen/{order_id}",
            headers=headers
        )
        assert print_response.status_code == 200, f"Expected 200, got {print_response.status_code}: {print_response.text}"
        
        data = print_response.json()
        assert "order_id" in data
        assert "commands" in data
        assert data["order_id"] == order_id
        
        # Verify commands is Base64 encoded
        import base64
        try:
            decoded = base64.b64decode(data["commands"])
            assert len(decoded) > 0
            print(f"Kitchen receipt generated: {len(decoded)} bytes of ESC/POS commands")
        except Exception as e:
            pytest.fail(f"Commands not valid Base64: {e}")
        
        print(f"Kitchen receipt for order {data.get('order_number', 'N/A')} generated successfully")


class TestTableStats:
    """Test table statistics and counts"""
    
    @pytest.fixture
    def staff_token(self):
        """Get Staff user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Staff login failed")
    
    def test_tables_count_at_least_3(self, staff_token):
        """Verify at least 3 tables exist (as per requirement)"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        assert response.status_code == 200
        
        tables = response.json()
        assert len(tables) >= 3, f"Expected at least 3 tables, got {len(tables)}"
        print(f"Tables count verification: {len(tables)} tables (requirement: >= 3)")
    
    def test_printers_count_at_least_2(self):
        """Verify at least 2 printers exist (as per requirement)"""
        # Login as admin for printers
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN_CREDS)
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/printers", headers=headers)
        assert response.status_code == 200
        
        printers = response.json()
        assert len(printers) >= 2, f"Expected at least 2 printers, got {len(printers)}"
        print(f"Printers count verification: {len(printers)} printers (requirement: >= 2)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
