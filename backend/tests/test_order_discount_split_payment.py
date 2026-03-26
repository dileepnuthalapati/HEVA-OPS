"""
Test suite for HevaPOS Advanced Order and Payment Features (Iteration 5)
- Order notes for kitchen
- Discounts/Coupons (percentage and fixed)
- Split payment methods (cash + card)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestOrderNotes:
    """Test order notes functionality for kitchen"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_token_user):
        self.token = auth_token_user
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_create_order_with_notes(self, auth_token_user):
        """Test creating an order with kitchen notes"""
        order_data = {
            "items": [
                {
                    "product_id": "test_prod_1",
                    "product_name": "TEST_Burger",
                    "quantity": 1,
                    "unit_price": 10.00,
                    "total": 10.00
                }
            ],
            "total_amount": 10.00,
            "order_notes": "No onions, extra pickles, allergy: gluten"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/orders",
            json=order_data,
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Failed to create order: {response.text}"
        data = response.json()
        
        # Verify notes are stored and returned
        assert "order_notes" in data
        assert data["order_notes"] == "No onions, extra pickles, allergy: gluten"
        assert data["status"] == "pending"
    
    def test_create_order_without_notes(self, auth_token_user):
        """Test creating an order without notes (should work)"""
        order_data = {
            "items": [
                {
                    "product_id": "test_prod_2",
                    "product_name": "TEST_Fries",
                    "quantity": 2,
                    "unit_price": 5.00,
                    "total": 10.00
                }
            ],
            "total_amount": 10.00
        }
        
        response = requests.post(
            f"{BASE_URL}/api/orders",
            json=order_data,
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("order_notes") is None


class TestPercentageDiscount:
    """Test percentage discount functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_token_user):
        self.token = auth_token_user
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_create_order_with_10_percent_discount(self, auth_token_user):
        """Test 10% discount calculation"""
        order_data = {
            "items": [
                {
                    "product_id": "test_prod_3",
                    "product_name": "TEST_Pizza",
                    "quantity": 1,
                    "unit_price": 20.00,
                    "total": 20.00
                }
            ],
            "total_amount": 20.00,
            "discount_type": "percentage",
            "discount_value": 10,
            "discount_reason": "Loyalty discount"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/orders",
            json=order_data,
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify discount calculation: 20 * 10% = 2.00
        assert data["discount_type"] == "percentage"
        assert data["discount_value"] == 10
        assert data["discount_amount"] == 2.00
        assert data["subtotal"] == 20.00
        assert data["total_amount"] == 18.00  # 20 - 2
        assert data["discount_reason"] == "Loyalty discount"
    
    def test_create_order_with_25_percent_discount(self, auth_token_user):
        """Test 25% discount calculation"""
        order_data = {
            "items": [
                {
                    "product_id": "test_prod_4",
                    "product_name": "TEST_Steak",
                    "quantity": 1,
                    "unit_price": 40.00,
                    "total": 40.00
                }
            ],
            "total_amount": 40.00,
            "discount_type": "percentage",
            "discount_value": 25,
            "discount_reason": "Birthday special"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/orders",
            json=order_data,
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify: 40 * 25% = 10.00
        assert data["discount_amount"] == 10.00
        assert data["total_amount"] == 30.00  # 40 - 10


class TestFixedDiscount:
    """Test fixed amount discount functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_token_user):
        self.token = auth_token_user
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_create_order_with_fixed_discount(self, auth_token_user):
        """Test fixed $5 discount"""
        order_data = {
            "items": [
                {
                    "product_id": "test_prod_5",
                    "product_name": "TEST_Salad",
                    "quantity": 1,
                    "unit_price": 15.00,
                    "total": 15.00
                }
            ],
            "total_amount": 15.00,
            "discount_type": "fixed",
            "discount_value": 5.00,
            "discount_reason": "Coupon code: SAVE5"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/orders",
            json=order_data,
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["discount_type"] == "fixed"
        assert data["discount_value"] == 5.00
        assert data["discount_amount"] == 5.00
        assert data["total_amount"] == 10.00  # 15 - 5
    
    def test_fixed_discount_cannot_exceed_subtotal(self, auth_token_user):
        """Test that fixed discount is capped at subtotal"""
        order_data = {
            "items": [
                {
                    "product_id": "test_prod_6",
                    "product_name": "TEST_Drink",
                    "quantity": 1,
                    "unit_price": 3.00,
                    "total": 3.00
                }
            ],
            "total_amount": 3.00,
            "discount_type": "fixed",
            "discount_value": 10.00,  # Discount > subtotal
            "discount_reason": "Big coupon"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/orders",
            json=order_data,
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Discount should be capped at subtotal (3.00), not 10.00
        assert data["discount_amount"] == 3.00
        assert data["total_amount"] == 0.00  # 3 - 3


class TestSplitPayment:
    """Test split payment functionality (cash + card)"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_token_user):
        self.token = auth_token_user
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_complete_order_with_split_payment(self, auth_token_user):
        """Test completing order with split payment (cash + card)"""
        # First create an order
        order_data = {
            "items": [
                {
                    "product_id": "test_prod_7",
                    "product_name": "TEST_Combo",
                    "quantity": 1,
                    "unit_price": 25.00,
                    "total": 25.00
                }
            ],
            "total_amount": 25.00
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/orders",
            json=order_data,
            headers=self.headers
        )
        
        assert create_response.status_code == 200
        order = create_response.json()
        order_id = order["id"]
        
        # Complete with split payment
        complete_data = {
            "payment_method": "split",
            "tip_percentage": 0,
            "tip_amount": 0,
            "split_count": 1,
            "payment_details": {
                "cash": 10.00,
                "card": 15.00
            }
        }
        
        complete_response = requests.put(
            f"{BASE_URL}/api/orders/{order_id}/complete",
            json=complete_data,
            headers=self.headers
        )
        
        assert complete_response.status_code == 200, f"Failed: {complete_response.text}"
        completed = complete_response.json()
        
        assert completed["status"] == "completed"
        assert completed["payment_method"] == "split"
        assert completed["payment_details"]["cash"] == 10.00
        assert completed["payment_details"]["card"] == 15.00
    
    def test_split_payment_validation_amounts_must_match(self, auth_token_user):
        """Test that split payment amounts must match order total"""
        # Create an order
        order_data = {
            "items": [
                {
                    "product_id": "test_prod_8",
                    "product_name": "TEST_Meal",
                    "quantity": 1,
                    "unit_price": 20.00,
                    "total": 20.00
                }
            ],
            "total_amount": 20.00
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/orders",
            json=order_data,
            headers=self.headers
        )
        
        assert create_response.status_code == 200
        order = create_response.json()
        order_id = order["id"]
        
        # Try to complete with mismatched amounts
        complete_data = {
            "payment_method": "split",
            "tip_percentage": 0,
            "tip_amount": 0,
            "split_count": 1,
            "payment_details": {
                "cash": 5.00,
                "card": 10.00  # Total: 15, but order is 20
            }
        }
        
        complete_response = requests.put(
            f"{BASE_URL}/api/orders/{order_id}/complete",
            json=complete_data,
            headers=self.headers
        )
        
        # Should fail validation
        assert complete_response.status_code == 400
        assert "don't match" in complete_response.text.lower() or "split" in complete_response.text.lower()
    
    def test_split_payment_with_tip(self, auth_token_user):
        """Test split payment with tip included"""
        # Create an order
        order_data = {
            "items": [
                {
                    "product_id": "test_prod_9",
                    "product_name": "TEST_Dinner",
                    "quantity": 1,
                    "unit_price": 30.00,
                    "total": 30.00
                }
            ],
            "total_amount": 30.00
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/orders",
            json=order_data,
            headers=self.headers
        )
        
        assert create_response.status_code == 200
        order = create_response.json()
        order_id = order["id"]
        
        # Complete with split payment + tip
        # Total with 10% tip: 30 + 3 = 33
        complete_data = {
            "payment_method": "split",
            "tip_percentage": 10,
            "tip_amount": 3.00,
            "split_count": 1,
            "payment_details": {
                "cash": 15.00,
                "card": 18.00  # Total: 33
            }
        }
        
        complete_response = requests.put(
            f"{BASE_URL}/api/orders/{order_id}/complete",
            json=complete_data,
            headers=self.headers
        )
        
        assert complete_response.status_code == 200
        completed = complete_response.json()
        
        assert completed["payment_method"] == "split"
        assert completed["tip_amount"] == 3.00
        assert completed["total_amount"] == 33.00
    
    def test_split_payment_requires_payment_details(self, auth_token_user):
        """Test that split payment requires payment_details"""
        # Create an order
        order_data = {
            "items": [
                {
                    "product_id": "test_prod_10",
                    "product_name": "TEST_Snack",
                    "quantity": 1,
                    "unit_price": 10.00,
                    "total": 10.00
                }
            ],
            "total_amount": 10.00
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/orders",
            json=order_data,
            headers=self.headers
        )
        
        assert create_response.status_code == 200
        order = create_response.json()
        order_id = order["id"]
        
        # Try to complete split without payment_details
        complete_data = {
            "payment_method": "split",
            "tip_percentage": 0,
            "tip_amount": 0,
            "split_count": 1
            # Missing payment_details
        }
        
        complete_response = requests.put(
            f"{BASE_URL}/api/orders/{order_id}/complete",
            json=complete_data,
            headers=self.headers
        )
        
        # Should fail
        assert complete_response.status_code == 400
        assert "payment details required" in complete_response.text.lower()


class TestDiscountWithSplitPayment:
    """Test discount combined with split payment"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_token_user):
        self.token = auth_token_user
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_order_with_discount_and_split_payment(self, auth_token_user):
        """Test order with discount completed via split payment"""
        # Create order with 10% discount
        order_data = {
            "items": [
                {
                    "product_id": "test_prod_11",
                    "product_name": "TEST_Special",
                    "quantity": 1,
                    "unit_price": 50.00,
                    "total": 50.00
                }
            ],
            "total_amount": 50.00,
            "discount_type": "percentage",
            "discount_value": 10,
            "discount_reason": "VIP discount"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/orders",
            json=order_data,
            headers=self.headers
        )
        
        assert create_response.status_code == 200
        order = create_response.json()
        order_id = order["id"]
        
        # Verify discount applied: 50 - 5 = 45
        assert order["discount_amount"] == 5.00
        assert order["total_amount"] == 45.00
        
        # Complete with split payment (total should be 45)
        complete_data = {
            "payment_method": "split",
            "tip_percentage": 0,
            "tip_amount": 0,
            "split_count": 1,
            "payment_details": {
                "cash": 20.00,
                "card": 25.00  # Total: 45
            }
        }
        
        complete_response = requests.put(
            f"{BASE_URL}/api/orders/{order_id}/complete",
            json=complete_data,
            headers=self.headers
        )
        
        assert complete_response.status_code == 200
        completed = complete_response.json()
        
        assert completed["status"] == "completed"
        assert completed["payment_method"] == "split"
        assert completed["discount_amount"] == 5.00


class TestOrderWithNotesAndDiscount:
    """Test order with both notes and discount"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_token_user):
        self.token = auth_token_user
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_order_with_notes_and_percentage_discount(self, auth_token_user):
        """Test order with both notes and percentage discount"""
        order_data = {
            "items": [
                {
                    "product_id": "test_prod_12",
                    "product_name": "TEST_Gourmet",
                    "quantity": 2,
                    "unit_price": 25.00,
                    "total": 50.00
                }
            ],
            "total_amount": 50.00,
            "order_notes": "Extra sauce on the side, no salt",
            "discount_type": "percentage",
            "discount_value": 20,
            "discount_reason": "Staff meal"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/orders",
            json=order_data,
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify both notes and discount
        assert data["order_notes"] == "Extra sauce on the side, no salt"
        assert data["discount_type"] == "percentage"
        assert data["discount_value"] == 20
        assert data["discount_amount"] == 10.00  # 50 * 20%
        assert data["total_amount"] == 40.00  # 50 - 10


# Fixtures
@pytest.fixture
def auth_token_user():
    """Get auth token for staff user"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "user", "password": "user123"}
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("Authentication failed")


@pytest.fixture
def auth_token_admin():
    """Get auth token for restaurant admin"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "restaurant_admin", "password": "admin123"}
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("Admin authentication failed")
