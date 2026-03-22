"""
HevaPOS Backend API Tests
Tests for authentication, role-based access control, and core API endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from seed data
PLATFORM_OWNER_CREDS = {"username": "platform_owner", "password": "admin123"}
RESTAURANT_ADMIN_CREDS = {"username": "restaurant_admin", "password": "admin123"}
STAFF_CREDS = {"username": "user", "password": "user123"}


class TestHealthCheck:
    """Basic API health check tests"""
    
    def test_api_root_accessible(self):
        """Test that API root endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"API root response: {data}")


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_platform_owner_success(self):
        """Test Platform Owner login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER_CREDS)
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["username"] == "platform_owner"
        assert data["user"]["role"] == "platform_owner"
        print(f"Platform Owner login successful: role={data['user']['role']}")
    
    def test_login_restaurant_admin_success(self):
        """Test Restaurant Admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN_CREDS)
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["username"] == "restaurant_admin"
        assert data["user"]["role"] == "admin"
        print(f"Restaurant Admin login successful: role={data['user']['role']}")
    
    def test_login_staff_success(self):
        """Test Staff user login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["username"] == "user"
        assert data["user"]["role"] == "user"
        print(f"Staff login successful: role={data['user']['role']}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "invalid_user",
            "password": "wrong_password"
        })
        assert response.status_code == 401
        print("Invalid credentials correctly rejected with 401")
    
    def test_login_wrong_password(self):
        """Test login with wrong password returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "platform_owner",
            "password": "wrong_password"
        })
        assert response.status_code == 401
        print("Wrong password correctly rejected with 401")


class TestRoleBasedAccess:
    """Role-based access control tests"""
    
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
    
    @pytest.fixture
    def staff_token(self):
        """Get Staff user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Staff login failed")
    
    def test_restaurants_api_platform_owner_access(self, platform_owner_token):
        """Platform Owner should access /restaurants endpoint"""
        headers = {"Authorization": f"Bearer {platform_owner_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurants", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Platform Owner can access restaurants: {len(data)} restaurants found")
    
    def test_restaurants_api_restaurant_admin_forbidden(self, restaurant_admin_token):
        """Restaurant Admin should get 403 on /restaurants endpoint"""
        headers = {"Authorization": f"Bearer {restaurant_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurants", headers=headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("Restaurant Admin correctly forbidden from /restaurants endpoint")
    
    def test_restaurants_api_staff_forbidden(self, staff_token):
        """Staff should get 403 on /restaurants endpoint"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurants", headers=headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("Staff correctly forbidden from /restaurants endpoint")


class TestProductsAPI:
    """Products API tests"""
    
    @pytest.fixture
    def staff_token(self):
        """Get Staff user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Staff login failed")
    
    def test_get_products_returns_11_products(self, staff_token):
        """Products API should return 11 products"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        # Check for expected number of products (11 as per requirement)
        print(f"Products API returned {len(data)} products")
        # Verify product structure
        if len(data) > 0:
            product = data[0]
            assert "id" in product
            assert "name" in product
            assert "price" in product
            assert "category_id" in product
            print(f"Sample product: {product['name']} - ${product['price']}")


class TestCategoriesAPI:
    """Categories API tests"""
    
    @pytest.fixture
    def staff_token(self):
        """Get Staff user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Staff login failed")
    
    def test_get_categories_returns_4_categories(self, staff_token):
        """Categories API should return 4 categories"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.get(f"{BASE_URL}/api/categories", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        # Check for expected number of categories (4 as per requirement)
        print(f"Categories API returned {len(data)} categories")
        # Verify category structure
        if len(data) > 0:
            category = data[0]
            assert "id" in category
            assert "name" in category
            print(f"Sample category: {category['name']}")


class TestAuthMe:
    """Test /auth/me endpoint for each role"""
    
    def test_auth_me_platform_owner(self):
        """Test /auth/me returns correct user info for Platform Owner"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER_CREDS)
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Get user info
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["username"] == "platform_owner"
        assert data["role"] == "platform_owner"
        print(f"Auth/me for Platform Owner: {data}")
    
    def test_auth_me_restaurant_admin(self):
        """Test /auth/me returns correct user info for Restaurant Admin"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN_CREDS)
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Get user info
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["username"] == "restaurant_admin"
        assert data["role"] == "admin"
        print(f"Auth/me for Restaurant Admin: {data}")
    
    def test_auth_me_staff(self):
        """Test /auth/me returns correct user info for Staff"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Get user info
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["username"] == "user"
        assert data["role"] == "user"
        print(f"Auth/me for Staff: {data}")


class TestReportsAPI:
    """Reports API tests - admin only"""
    
    @pytest.fixture
    def restaurant_admin_token(self):
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
    
    def test_reports_stats_admin_access(self, restaurant_admin_token):
        """Restaurant Admin should access /reports/stats endpoint"""
        headers = {"Authorization": f"Bearer {restaurant_admin_token}"}
        today = "2025-01-01"
        week_ago = "2024-12-25"
        response = requests.get(
            f"{BASE_URL}/api/reports/stats?start_date={week_ago}&end_date={today}",
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "total_sales" in data
        assert "total_orders" in data
        print(f"Reports stats: total_sales={data['total_sales']}, total_orders={data['total_orders']}")
    
    def test_reports_stats_staff_forbidden(self, staff_token):
        """Staff should get 403 on /reports/stats endpoint"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        today = "2025-01-01"
        week_ago = "2024-12-25"
        response = requests.get(
            f"{BASE_URL}/api/reports/stats?start_date={week_ago}&end_date={today}",
            headers=headers
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("Staff correctly forbidden from /reports/stats endpoint")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
