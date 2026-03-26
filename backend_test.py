import requests
import sys
from datetime import datetime, timedelta
import json

class POSAPITester:
    def __init__(self, base_url="https://menu-manager-pos.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.admin_token = None
        self.user_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.category_id = None
        self.product_id = None
        self.order_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, auth_type=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if headers:
            test_headers.update(headers)
            
        if auth_type == 'admin' and self.admin_token:
            test_headers['Authorization'] = f'Bearer {self.admin_token}'
        elif auth_type == 'user' and self.user_token:
            test_headers['Authorization'] = f'Bearer {self.user_token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_response = response.json()
                    print(f"   Error: {error_response}")
                except:
                    print(f"   Response text: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Network Error: {str(e)}")
            return False, {}

    def test_admin_login(self):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"username": "admin", "password": "admin123"}
        )
        if success and 'access_token' in response:
            self.admin_token = response['access_token']
            print(f"   Admin role: {response.get('user', {}).get('role', 'unknown')}")
            return True
        return False

    def test_user_login(self):
        """Test user login"""
        success, response = self.run_test(
            "User Login",
            "POST",
            "auth/login",
            200,
            data={"username": "user", "password": "user123"}
        )
        if success and 'access_token' in response:
            self.user_token = response['access_token']
            print(f"   User role: {response.get('user', {}).get('role', 'unknown')}")
            return True
        return False

    def test_invalid_login(self):
        """Test invalid login credentials"""
        return self.run_test(
            "Invalid Login",
            "POST",
            "auth/login",
            401,
            data={"username": "invalid", "password": "invalid"}
        )[0]

    def test_admin_auth_check(self):
        """Test admin authentication check"""
        return self.run_test(
            "Admin Auth Check",
            "GET",
            "auth/me",
            200,
            auth_type="admin"
        )[0]

    def test_user_auth_check(self):
        """Test user authentication check"""
        return self.run_test(
            "User Auth Check",
            "GET",
            "auth/me",
            200,
            auth_type="user"
        )[0]

    def test_get_categories(self):
        """Test getting all categories"""
        return self.run_test(
            "Get Categories",
            "GET",
            "categories",
            200
        )[0]

    def test_create_category(self):
        """Test creating a category (admin only)"""
        success, response = self.run_test(
            "Create Category (Admin)",
            "POST",
            "categories",
            200,
            data={
                "name": f"Test Category {datetime.now().strftime('%H%M%S')}",
                "description": "Test category description",
                "image_url": "https://example.com/test.jpg"
            },
            auth_type="admin"
        )
        if success and 'id' in response:
            self.category_id = response['id']
            return True
        return False

    def test_user_create_category_denied(self):
        """Test that regular user cannot create category"""
        return self.run_test(
            "User Create Category (Should Fail)",
            "POST",
            "categories",
            403,
            data={
                "name": "Should Fail Category",
                "description": "This should fail"
            },
            auth_type="user"
        )[0]

    def test_update_category(self):
        """Test updating a category"""
        if not self.category_id:
            print("❌ Skipping update category - no category created")
            return False
        
        return self.run_test(
            "Update Category",
            "PUT",
            f"categories/{self.category_id}",
            200,
            data={
                "name": f"Updated Category {datetime.now().strftime('%H%M%S')}",
                "description": "Updated description"
            },
            auth_type="admin"
        )[0]

    def test_get_products(self):
        """Test getting all products"""
        return self.run_test(
            "Get Products",
            "GET",
            "products",
            200
        )[0]

    def test_create_product(self):
        """Test creating a product (admin only)"""
        if not self.category_id:
            print("❌ Skipping create product - no category available")
            return False
            
        success, response = self.run_test(
            "Create Product (Admin)",
            "POST",
            "products",
            200,
            data={
                "name": f"Test Product {datetime.now().strftime('%H%M%S')}",
                "category_id": self.category_id,
                "price": 9.99,
                "image_url": "https://example.com/product.jpg",
                "in_stock": True
            },
            auth_type="admin"
        )
        if success and 'id' in response:
            self.product_id = response['id']
            return True
        return False

    def test_user_create_product_denied(self):
        """Test that regular user cannot create product"""
        if not self.category_id:
            return True  # Skip if no category to test with
            
        return self.run_test(
            "User Create Product (Should Fail)",
            "POST",
            "products",
            403,
            data={
                "name": "Should Fail Product",
                "category_id": self.category_id,
                "price": 5.99
            },
            auth_type="user"
        )[0]

    def test_create_order_admin(self):
        """Test creating an order as admin"""
        if not self.product_id:
            print("❌ Skipping create order - no product available")
            return False
            
        success, response = self.run_test(
            "Create Order (Admin)",
            "POST",
            "orders",
            200,
            data={
                "items": [
                    {
                        "product_id": self.product_id,
                        "product_name": "Test Product",
                        "quantity": 2,
                        "unit_price": 9.99,
                        "total": 19.98
                    }
                ],
                "total_amount": 19.98
            },
            auth_type="admin"
        )
        if success and 'id' in response:
            self.order_id = response['id']
            return True
        return False

    def test_create_order_user(self):
        """Test creating an order as user"""
        if not self.product_id:
            print("❌ Skipping create order user - no product available")
            return False
            
        return self.run_test(
            "Create Order (User)",
            "POST",
            "orders",
            200,
            data={
                "items": [
                    {
                        "product_id": self.product_id,
                        "product_name": "Test Product",
                        "quantity": 1,
                        "unit_price": 9.99,
                        "total": 9.99
                    }
                ],
                "total_amount": 9.99
            },
            auth_type="user"
        )[0]

    def test_get_orders_admin(self):
        """Test getting orders as admin (should see all)"""
        return self.run_test(
            "Get Orders (Admin - All Orders)",
            "GET",
            "orders",
            200,
            auth_type="admin"
        )[0]

    def test_get_orders_user(self):
        """Test getting orders as user (should see only own)"""
        return self.run_test(
            "Get Orders (User - Own Orders)",
            "GET",
            "orders",
            200,
            auth_type="user"
        )[0]

    def test_sync_offline_orders(self):
        """Test syncing offline orders"""
        return self.run_test(
            "Sync Offline Orders",
            "POST",
            "sync",
            200,
            data={
                "orders": [
                    {
                        "items": [
                            {
                                "product_id": "test_prod",
                                "product_name": "Offline Product",
                                "quantity": 1,
                                "unit_price": 5.99,
                                "total": 5.99
                            }
                        ],
                        "total_amount": 5.99
                    }
                ]
            },
            auth_type="user"
        )[0]

    def test_report_stats(self):
        """Test getting report statistics (admin only)"""
        start_date = (datetime.now() - timedelta(days=7)).isoformat()
        end_date = datetime.now().isoformat()
        
        return self.run_test(
            "Get Report Stats (Admin)",
            "GET",
            f"reports/stats?start_date={start_date}&end_date={end_date}",
            200,
            auth_type="admin"
        )[0]

    def test_user_report_stats_denied(self):
        """Test that regular user cannot access report stats"""
        start_date = (datetime.now() - timedelta(days=7)).isoformat()
        end_date = datetime.now().isoformat()
        
        return self.run_test(
            "User Report Stats (Should Fail)",
            "GET",
            f"reports/stats?start_date={start_date}&end_date={end_date}",
            403,
            auth_type="user"
        )[0]

    def test_generate_pdf_report(self):
        """Test generating PDF report (admin only)"""
        start_date = (datetime.now() - timedelta(days=7)).isoformat()
        end_date = datetime.now().isoformat()
        
        return self.run_test(
            "Generate PDF Report (Admin)",
            "POST",
            "reports/generate",
            200,
            data={
                "start_date": start_date,
                "end_date": end_date
            },
            auth_type="admin"
        )[0]

    def test_delete_product(self):
        """Test deleting a product (admin only)"""
        if not self.product_id:
            print("❌ Skipping delete product - no product to delete")
            return True
            
        return self.run_test(
            "Delete Product (Admin)",
            "DELETE",
            f"products/{self.product_id}",
            200,
            auth_type="admin"
        )[0]

    def test_delete_category(self):
        """Test deleting a category (admin only)"""
        if not self.category_id:
            print("❌ Skipping delete category - no category to delete")
            return True
            
        return self.run_test(
            "Delete Category (Admin)",
            "DELETE",
            f"categories/{self.category_id}",
            200,
            auth_type="admin"
        )[0]

def main():
    print("🚀 Starting POS API Tests...")
    print(f"Testing against: https://menu-manager-pos.preview.emergentagent.com/api")
    
    tester = POSAPITester()
    
    # Authentication Tests
    print("\n" + "="*50)
    print("AUTHENTICATION TESTS")
    print("="*50)
    
    if not tester.test_admin_login():
        print("❌ Admin login failed - stopping critical tests")
        return 1
    
    if not tester.test_user_login():
        print("❌ User login failed - stopping critical tests")
        return 1
    
    tester.test_invalid_login()
    tester.test_admin_auth_check()
    tester.test_user_auth_check()
    
    # Category Management Tests
    print("\n" + "="*50)
    print("CATEGORY MANAGEMENT TESTS")
    print("="*50)
    
    tester.test_get_categories()
    tester.test_create_category()
    tester.test_user_create_category_denied()
    tester.test_update_category()
    
    # Product Management Tests
    print("\n" + "="*50)
    print("PRODUCT MANAGEMENT TESTS")
    print("="*50)
    
    tester.test_get_products()
    tester.test_create_product()
    tester.test_user_create_product_denied()
    
    # Order Management Tests
    print("\n" + "="*50)
    print("ORDER MANAGEMENT TESTS")
    print("="*50)
    
    tester.test_create_order_admin()
    tester.test_create_order_user()
    tester.test_get_orders_admin()
    tester.test_get_orders_user()
    tester.test_sync_offline_orders()
    
    # Reporting Tests
    print("\n" + "="*50)
    print("REPORTING TESTS")
    print("="*50)
    
    tester.test_report_stats()
    tester.test_user_report_stats_denied()
    tester.test_generate_pdf_report()
    
    # Cleanup Tests
    print("\n" + "="*50)
    print("CLEANUP TESTS")
    print("="*50)
    
    tester.test_delete_product()
    tester.test_delete_category()
    
    # Final Results
    print("\n" + "="*50)
    print("TEST RESULTS SUMMARY")
    print("="*50)
    print(f"📊 Tests passed: {tester.tests_passed}/{tester.tests_run}")
    print(f"✅ Success rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"❌ {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())