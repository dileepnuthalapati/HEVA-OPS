"""
Iteration 55: POS Improvements Tests
- Order types (takeaway, eat_in, dine_in)
- Delta printing (printed_to_kitchen field)
- Print settings toggles
- Resend email endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USERNAME = "SKAdmin"
ADMIN_PASSWORD = "saswata@123"


@pytest.fixture(scope="module")
def auth_token():
    """Get admin auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Auth failed: {response.status_code} - {response.text}")
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Auth headers for requests"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestOrderTypes:
    """Test order_type field in orders"""
    
    def test_create_order_with_takeaway_type(self, auth_headers):
        """POST /api/orders with order_type='takeaway' creates order with correct type"""
        response = requests.post(f"{BASE_URL}/api/orders", headers=auth_headers, json={
            "items": [{"product_id": "test_prod_1", "product_name": "TEST_Takeaway Item", "quantity": 1, "unit_price": 5.00, "total": 5.00}],
            "subtotal": 5.00,
            "total_amount": 5.00,
            "order_type": "takeaway"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data.get("order_type") == "takeaway", f"Expected order_type='takeaway', got {data.get('order_type')}"
        print(f"✓ Order created with order_type='takeaway': #{data.get('order_number')}")
        return data.get("id")
    
    def test_create_order_with_eat_in_type(self, auth_headers):
        """POST /api/orders with order_type='eat_in' creates order with correct type"""
        response = requests.post(f"{BASE_URL}/api/orders", headers=auth_headers, json={
            "items": [{"product_id": "test_prod_2", "product_name": "TEST_Eat In Item", "quantity": 1, "unit_price": 7.50, "total": 7.50}],
            "subtotal": 7.50,
            "total_amount": 7.50,
            "order_type": "eat_in"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data.get("order_type") == "eat_in", f"Expected order_type='eat_in', got {data.get('order_type')}"
        print(f"✓ Order created with order_type='eat_in': #{data.get('order_number')}")
    
    def test_create_order_with_table_sets_dine_in(self, auth_headers):
        """POST /api/orders with table_id auto-sets order_type='dine_in'"""
        # First get a table
        tables_resp = requests.get(f"{BASE_URL}/api/tables", headers=auth_headers)
        if tables_resp.status_code != 200 or not tables_resp.json():
            pytest.skip("No tables available for test")
        
        table = tables_resp.json()[0]
        table_id = table.get("id")
        
        response = requests.post(f"{BASE_URL}/api/orders", headers=auth_headers, json={
            "items": [{"product_id": "test_prod_3", "product_name": "TEST_Dine In Item", "quantity": 1, "unit_price": 10.00, "total": 10.00}],
            "subtotal": 10.00,
            "total_amount": 10.00,
            "table_id": table_id
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        # When table_id is provided, order_type should be 'dine_in'
        assert data.get("order_type") == "dine_in", f"Expected order_type='dine_in' when table_id provided, got {data.get('order_type')}"
        assert data.get("table_id") == table_id, "Table ID not set correctly"
        print(f"✓ Order with table_id auto-set to order_type='dine_in': #{data.get('order_number')}")


class TestDeltaPrinting:
    """Test printed_to_kitchen field and mark-printed endpoint"""
    
    def test_order_items_have_printed_to_kitchen_field(self, auth_headers):
        """OrderItem model has printed_to_kitchen field (default false)"""
        response = requests.post(f"{BASE_URL}/api/orders", headers=auth_headers, json={
            "items": [
                {"product_id": "test_delta_1", "product_name": "TEST_Delta Item 1", "quantity": 1, "unit_price": 5.00, "total": 5.00},
                {"product_id": "test_delta_2", "product_name": "TEST_Delta Item 2", "quantity": 2, "unit_price": 3.00, "total": 6.00}
            ],
            "subtotal": 11.00,
            "total_amount": 11.00,
            "order_type": "takeaway"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Check items have printed_to_kitchen field
        items = data.get("items", [])
        assert len(items) == 2, "Expected 2 items"
        for item in items:
            # Default should be False or falsy
            assert item.get("printed_to_kitchen") in [False, None, 0], f"Expected printed_to_kitchen=False by default, got {item.get('printed_to_kitchen')}"
        
        print(f"✓ Order items have printed_to_kitchen=False by default: #{data.get('order_number')}")
        return data.get("id")
    
    def test_mark_printed_endpoint(self, auth_headers):
        """PUT /api/orders/{id}/mark-printed marks all items as printed_to_kitchen=true"""
        # Create an order first
        create_resp = requests.post(f"{BASE_URL}/api/orders", headers=auth_headers, json={
            "items": [
                {"product_id": "test_mark_1", "product_name": "TEST_Mark Item 1", "quantity": 1, "unit_price": 4.00, "total": 4.00},
                {"product_id": "test_mark_2", "product_name": "TEST_Mark Item 2", "quantity": 1, "unit_price": 6.00, "total": 6.00}
            ],
            "subtotal": 10.00,
            "total_amount": 10.00,
            "order_type": "takeaway"
        })
        assert create_resp.status_code == 200, f"Create failed: {create_resp.text}"
        order_id = create_resp.json().get("id")
        
        # Mark items as printed
        mark_resp = requests.put(f"{BASE_URL}/api/orders/{order_id}/mark-printed", headers=auth_headers)
        assert mark_resp.status_code == 200, f"Mark-printed failed: {mark_resp.text}"
        mark_data = mark_resp.json()
        assert "message" in mark_data, "Expected message in response"
        assert mark_data.get("count") == 2, f"Expected count=2, got {mark_data.get('count')}"
        
        # Verify by fetching pending orders and finding this one
        pending_resp = requests.get(f"{BASE_URL}/api/orders/pending", headers=auth_headers)
        if pending_resp.status_code == 200:
            orders = pending_resp.json()
            order = next((o for o in orders if o.get("id") == order_id), None)
            if order:
                for item in order.get("items", []):
                    assert item.get("printed_to_kitchen") == True, f"Item not marked as printed: {item}"
                print(f"✓ All items marked as printed_to_kitchen=True for order #{order.get('order_number')}")
            else:
                print(f"✓ Mark-printed endpoint returned success (order may have been completed)")
        else:
            print(f"✓ Mark-printed endpoint returned success")


class TestPrintSettings:
    """Test print settings in security settings"""
    
    def test_get_security_settings_returns_print_fields(self, auth_headers):
        """GET /api/restaurants/my/security returns print_kitchen_slip, print_customer_receipt, use_kds_skip_print fields"""
        response = requests.get(f"{BASE_URL}/api/restaurants/my/security", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Check print settings fields exist
        assert "print_kitchen_slip" in data, "Missing print_kitchen_slip field"
        assert "print_customer_receipt" in data, "Missing print_customer_receipt field"
        assert "use_kds_skip_print" in data, "Missing use_kds_skip_print field"
        
        # Check they are boolean
        assert isinstance(data.get("print_kitchen_slip"), bool), "print_kitchen_slip should be boolean"
        assert isinstance(data.get("print_customer_receipt"), bool), "print_customer_receipt should be boolean"
        assert isinstance(data.get("use_kds_skip_print"), bool), "use_kds_skip_print should be boolean"
        
        print(f"✓ Security settings contain print fields: kitchen={data.get('print_kitchen_slip')}, customer={data.get('print_customer_receipt')}, kds={data.get('use_kds_skip_print')}")
    
    def test_update_print_settings(self, auth_headers):
        """PUT /api/restaurants/my/security updates print settings"""
        # Get current settings
        get_resp = requests.get(f"{BASE_URL}/api/restaurants/my/security", headers=auth_headers)
        assert get_resp.status_code == 200
        original = get_resp.json()
        
        # Toggle print_kitchen_slip
        new_value = not original.get("print_kitchen_slip", True)
        
        update_resp = requests.put(f"{BASE_URL}/api/restaurants/my/security", headers=auth_headers, json={
            "biometric_required": original.get("biometric_required", False),
            "photo_audit_enabled": original.get("photo_audit_enabled", True),
            "photo_retention_days": original.get("photo_retention_days", 90),
            "device_binding_enabled": original.get("device_binding_enabled", False),
            "print_kitchen_slip": new_value,
            "print_customer_receipt": original.get("print_customer_receipt", True),
            "use_kds_skip_print": original.get("use_kds_skip_print", False)
        })
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        
        # Verify change
        verify_resp = requests.get(f"{BASE_URL}/api/restaurants/my/security", headers=auth_headers)
        assert verify_resp.status_code == 200
        updated = verify_resp.json()
        assert updated.get("print_kitchen_slip") == new_value, f"print_kitchen_slip not updated: expected {new_value}, got {updated.get('print_kitchen_slip')}"
        
        # Restore original
        requests.put(f"{BASE_URL}/api/restaurants/my/security", headers=auth_headers, json={
            "biometric_required": original.get("biometric_required", False),
            "photo_audit_enabled": original.get("photo_audit_enabled", True),
            "photo_retention_days": original.get("photo_retention_days", 90),
            "device_binding_enabled": original.get("device_binding_enabled", False),
            "print_kitchen_slip": original.get("print_kitchen_slip", True),
            "print_customer_receipt": original.get("print_customer_receipt", True),
            "use_kds_skip_print": original.get("use_kds_skip_print", False)
        })
        
        print(f"✓ Print settings can be updated and persisted")


class TestResendEmail:
    """Test resend welcome email endpoint"""
    
    def test_resend_email_endpoint_exists(self, auth_headers):
        """POST /api/restaurant/staff/{id}/resend-email endpoint exists"""
        # Get staff list
        staff_resp = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=auth_headers)
        assert staff_resp.status_code == 200, f"Failed to get staff: {staff_resp.text}"
        staff_list = staff_resp.json()
        
        # Find a staff member with email who hasn't completed onboarding
        target_staff = None
        for staff in staff_list:
            if staff.get("email") and not staff.get("onboarding_completed"):
                target_staff = staff
                break
        
        if not target_staff:
            # Create a test staff member
            create_resp = requests.post(f"{BASE_URL}/api/restaurant/staff", headers=auth_headers, json={
                "username": f"TEST_resend_{int(__import__('time').time())}",
                "email": f"test_resend_{int(__import__('time').time())}@test-invalid.local",
                "password": "testpass123",
                "role": "user"
            })
            if create_resp.status_code == 200:
                target_staff = {"id": create_resp.json().get("id"), "email": f"test_resend@test-invalid.local"}
            else:
                pytest.skip("Could not create test staff for resend email test")
        
        # Test resend endpoint
        resend_resp = requests.post(f"{BASE_URL}/api/restaurant/staff/{target_staff['id']}/resend-email", headers=auth_headers)
        
        # Should return 200 (success) or 400 (already completed) or 500 (email failed but endpoint exists)
        assert resend_resp.status_code in [200, 400, 500], f"Unexpected status: {resend_resp.status_code} - {resend_resp.text}"
        
        if resend_resp.status_code == 200:
            data = resend_resp.json()
            assert "message" in data or "email_status" in data, "Expected message or email_status in response"
            print(f"✓ Resend email endpoint works: {data}")
        elif resend_resp.status_code == 400:
            print(f"✓ Resend email endpoint exists (staff already completed onboarding)")
        else:
            print(f"✓ Resend email endpoint exists (email service may have failed)")
    
    def test_resend_email_requires_email(self, auth_headers):
        """Resend email fails for staff without email"""
        # Get staff list
        staff_resp = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=auth_headers)
        if staff_resp.status_code != 200:
            pytest.skip("Could not get staff list")
        
        staff_list = staff_resp.json()
        
        # Find staff without email (unlikely but test the validation)
        no_email_staff = next((s for s in staff_list if not s.get("email")), None)
        
        if no_email_staff:
            resend_resp = requests.post(f"{BASE_URL}/api/restaurant/staff/{no_email_staff['id']}/resend-email", headers=auth_headers)
            assert resend_resp.status_code == 400, f"Expected 400 for staff without email, got {resend_resp.status_code}"
            print(f"✓ Resend email correctly rejects staff without email")
        else:
            print(f"✓ All staff have emails (validation test skipped)")


class TestOrderUpdate:
    """Test order update preserves order_type"""
    
    def test_update_order_preserves_order_type(self, auth_headers):
        """PUT /api/orders/{id} preserves order_type"""
        # Create order with eat_in type
        create_resp = requests.post(f"{BASE_URL}/api/orders", headers=auth_headers, json={
            "items": [{"product_id": "test_update_1", "product_name": "TEST_Update Item", "quantity": 1, "unit_price": 8.00, "total": 8.00}],
            "subtotal": 8.00,
            "total_amount": 8.00,
            "order_type": "eat_in"
        })
        assert create_resp.status_code == 200
        order = create_resp.json()
        order_id = order.get("id")
        
        # Update order with new item
        update_resp = requests.put(f"{BASE_URL}/api/orders/{order_id}", headers=auth_headers, json={
            "items": [
                {"product_id": "test_update_1", "product_name": "TEST_Update Item", "quantity": 1, "unit_price": 8.00, "total": 8.00},
                {"product_id": "test_update_2", "product_name": "TEST_New Item", "quantity": 1, "unit_price": 5.00, "total": 5.00}
            ],
            "subtotal": 13.00,
            "total_amount": 13.00,
            "order_type": "eat_in"
        })
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        updated = update_resp.json()
        
        # Verify order_type preserved
        assert updated.get("order_type") == "eat_in", f"order_type not preserved: expected 'eat_in', got {updated.get('order_type')}"
        assert len(updated.get("items", [])) == 2, "Items not updated correctly"
        
        print(f"✓ Order update preserves order_type='eat_in': #{updated.get('order_number')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
