"""
Test suite for HevaPOS Subscription and Notification APIs
Tests: Subscriptions list, status change, my subscription, notifications, check-trials
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://heva-pos-preview.preview.emergentagent.com').rstrip('/')

# Test credentials
PLATFORM_OWNER = {"username": "platform_owner", "password": "admin123"}
RESTAURANT_ADMIN = {"username": "restaurant_admin", "password": "admin123"}
STAFF_USER = {"username": "user", "password": "user123"}


class TestAuth:
    """Authentication tests"""
    
    def test_platform_owner_login(self):
        """Test platform owner can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "platform_owner"
        print(f"✓ Platform owner login successful, role: {data['user']['role']}")
    
    def test_restaurant_admin_login(self):
        """Test restaurant admin can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Restaurant admin login successful, role: {data['user']['role']}")
    
    def test_staff_user_login(self):
        """Test staff user can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_USER)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "user"
        print(f"✓ Staff user login successful, role: {data['user']['role']}")


class TestSubscriptionsAPI:
    """Subscription management API tests"""
    
    @pytest.fixture
    def platform_owner_token(self):
        """Get platform owner auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture
    def restaurant_admin_token(self):
        """Get restaurant admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=RESTAURANT_ADMIN)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_get_subscriptions_list(self, platform_owner_token):
        """GET /api/subscriptions - Platform owner gets list of all subscriptions"""
        headers = {"Authorization": f"Bearer {platform_owner_token}"}
        response = requests.get(f"{BASE_URL}/api/subscriptions", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Find Pizza Palace (rest_demo_1)
        pizza_palace = next((s for s in data if s.get("id") == "rest_demo_1"), None)
        assert pizza_palace is not None, "Pizza Palace (rest_demo_1) not found in subscriptions"
        
        # Verify subscription fields
        assert "subscription_status" in pizza_palace
        assert "trial_days_left" in pizza_palace or pizza_palace.get("subscription_status") != "trial"
        assert "name" in pizza_palace
        assert "owner_email" in pizza_palace
        
        print(f"✓ Found {len(data)} subscriptions")
        print(f"✓ Pizza Palace status: {pizza_palace.get('subscription_status')}, trial_days_left: {pizza_palace.get('trial_days_left')}")
    
    def test_update_subscription_status_to_active(self, platform_owner_token):
        """PUT /api/subscriptions/rest_demo_1 - Change status to active"""
        headers = {"Authorization": f"Bearer {platform_owner_token}"}
        
        # Change to active
        response = requests.put(
            f"{BASE_URL}/api/subscriptions/rest_demo_1",
            headers=headers,
            json={"status": "active"}
        )
        
        assert response.status_code == 200, f"Failed to update: {response.text}"
        data = response.json()
        assert "message" in data
        print(f"✓ Status change response: {data}")
        
        # Verify the change
        response = requests.get(f"{BASE_URL}/api/subscriptions", headers=headers)
        assert response.status_code == 200
        subscriptions = response.json()
        pizza_palace = next((s for s in subscriptions if s.get("id") == "rest_demo_1"), None)
        assert pizza_palace is not None
        assert pizza_palace.get("subscription_status") == "active", f"Status not updated: {pizza_palace.get('subscription_status')}"
        print(f"✓ Verified status is now: {pizza_palace.get('subscription_status')}")
    
    def test_revert_subscription_status_to_trial(self, platform_owner_token):
        """PUT /api/subscriptions/rest_demo_1 - Revert status back to trial"""
        headers = {"Authorization": f"Bearer {platform_owner_token}"}
        
        # Change back to trial
        response = requests.put(
            f"{BASE_URL}/api/subscriptions/rest_demo_1",
            headers=headers,
            json={"status": "trial"}
        )
        
        assert response.status_code == 200, f"Failed to revert: {response.text}"
        
        # Verify the change
        response = requests.get(f"{BASE_URL}/api/subscriptions", headers=headers)
        assert response.status_code == 200
        subscriptions = response.json()
        pizza_palace = next((s for s in subscriptions if s.get("id") == "rest_demo_1"), None)
        assert pizza_palace is not None
        assert pizza_palace.get("subscription_status") == "trial", f"Status not reverted: {pizza_palace.get('subscription_status')}"
        print(f"✓ Reverted status back to: {pizza_palace.get('subscription_status')}")
    
    def test_get_my_subscription(self, restaurant_admin_token):
        """GET /api/subscriptions/my - Restaurant admin gets their subscription info"""
        headers = {"Authorization": f"Bearer {restaurant_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/subscriptions/my", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify subscription fields
        assert "subscription_status" in data
        assert "subscription_plan" in data
        assert "price" in data
        assert "currency" in data
        
        print(f"✓ My subscription: status={data.get('subscription_status')}, plan={data.get('subscription_plan')}, price={data.get('price')} {data.get('currency')}")
    
    def test_check_trials(self, platform_owner_token):
        """POST /api/subscriptions/check-trials - Check trial expirations"""
        headers = {"Authorization": f"Bearer {platform_owner_token}"}
        response = requests.post(f"{BASE_URL}/api/subscriptions/check-trials", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "total_trials_checked" in data
        assert "expired_and_suspended" in data
        assert "expiring_soon_notified" in data
        
        print(f"✓ Check trials result: total_checked={data.get('total_trials_checked')}, expired={len(data.get('expired_and_suspended', []))}, expiring_soon={len(data.get('expiring_soon_notified', []))}")


class TestNotificationsAPI:
    """Notification API tests"""
    
    @pytest.fixture
    def platform_owner_token(self):
        """Get platform owner auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_get_notifications(self, platform_owner_token):
        """GET /api/notifications - Platform owner gets all notifications"""
        headers = {"Authorization": f"Bearer {platform_owner_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ Found {len(data)} notifications")
        if len(data) > 0:
            print(f"  Latest notification: {data[0].get('message', 'N/A')[:50]}...")


class TestAccessControl:
    """Test role-based access control"""
    
    @pytest.fixture
    def staff_token(self):
        """Get staff user auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_USER)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_staff_cannot_access_subscriptions_list(self, staff_token):
        """Staff user should not be able to access subscriptions list"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.get(f"{BASE_URL}/api/subscriptions", headers=headers)
        
        # Should be 403 Forbidden
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Staff correctly denied access to subscriptions list")
    
    def test_staff_cannot_access_notifications(self, staff_token):
        """Staff user should not be able to access all notifications"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        
        # Should be 403 Forbidden
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Staff correctly denied access to notifications")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
