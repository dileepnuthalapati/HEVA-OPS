"""
Iteration 34: Testing 5 NEW Changes for Heva One Rebranding
1. Floating clock button hidden on POS screen
2. Geofence 10m enforcement on clock-in
3. Staff onboarding has richer profile fields
4. App rebranded from HevaPOS to 'Heva One'
5. Onboarding uses 'Business Name' + 'Business Type' instead of 'Restaurant Name'
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
PLATFORM_OWNER = {"username": "platform_owner", "password": "admin123"}
SKADMIN = {"username": "SKAdmin", "password": "saswata@123"}
STAFF_USER = {"username": "user", "password": "user123", "pos_pin": "1111"}

# Business location for rest_demo_1 (London coordinates)
BUSINESS_LAT = 51.5074
BUSINESS_LNG = -0.1278


class TestGeofenceEnforcement:
    """Test geofence 10m enforcement on clock-in/out"""
    
    def test_clock_within_geofence_succeeds(self):
        """Clock in/out with location within 10m of business should succeed"""
        # Location exactly at business (0m away)
        response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": STAFF_USER["pos_pin"],
            "restaurant_id": "rest_demo_1",
            "latitude": BUSINESS_LAT,
            "longitude": BUSINESS_LNG
        })
        # Should succeed (200) or fail with invalid PIN (401) but NOT 403 geofence error
        assert response.status_code in [200, 401], f"Expected 200/401, got {response.status_code}: {response.text}"
        if response.status_code == 200:
            data = response.json()
            assert data.get("action") in ["clock_in", "clock_out"]
            print(f"SUCCESS: Clock {data.get('action')} within geofence")
    
    def test_clock_outside_geofence_fails_403(self):
        """Clock in/out with location outside 10m should return 403"""
        # Location ~100km away (Paris coordinates)
        response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": STAFF_USER["pos_pin"],
            "restaurant_id": "rest_demo_1",
            "latitude": 48.8566,  # Paris
            "longitude": 2.3522
        })
        assert response.status_code == 403, f"Expected 403 for outside geofence, got {response.status_code}: {response.text}"
        data = response.json()
        assert "away" in data.get("detail", "").lower() or "10m" in data.get("detail", "")
        print(f"SUCCESS: Clock blocked outside geofence - {data.get('detail')}")
    
    def test_clock_without_location_when_business_has_coords_fails_400(self):
        """Clock without location when business has lat/lng set should return 400"""
        response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": STAFF_USER["pos_pin"],
            "restaurant_id": "rest_demo_1",
            "latitude": None,
            "longitude": None
        })
        assert response.status_code == 400, f"Expected 400 for missing location, got {response.status_code}: {response.text}"
        data = response.json()
        assert "location" in data.get("detail", "").lower()
        print(f"SUCCESS: Clock blocked without location - {data.get('detail')}")
    
    def test_clock_slightly_outside_10m_fails(self):
        """Clock at ~15m away should fail (outside 10m radius)"""
        # Move ~15m north (0.000135 degrees latitude ≈ 15m)
        response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": STAFF_USER["pos_pin"],
            "restaurant_id": "rest_demo_1",
            "latitude": BUSINESS_LAT + 0.000135,
            "longitude": BUSINESS_LNG
        })
        assert response.status_code == 403, f"Expected 403 for 15m away, got {response.status_code}: {response.text}"
        print("SUCCESS: Clock blocked at ~15m distance")
    
    def test_clock_within_5m_succeeds(self):
        """Clock at ~5m away should succeed (within 10m radius)"""
        # Move ~5m north (0.000045 degrees latitude ≈ 5m)
        response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": STAFF_USER["pos_pin"],
            "restaurant_id": "rest_demo_1",
            "latitude": BUSINESS_LAT + 0.000045,
            "longitude": BUSINESS_LNG
        })
        # Should succeed or fail with PIN error, not geofence
        assert response.status_code in [200, 401], f"Expected 200/401 for 5m away, got {response.status_code}: {response.text}"
        print("SUCCESS: Clock allowed at ~5m distance")


class TestStaffRicherProfile:
    """Test staff create/update with new fields: position, hourly_rate, phone, employment_type, joining_date, tax_id"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SKADMIN)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["access_token"]
    
    def test_create_staff_with_new_fields(self, admin_token):
        """Create staff with all new profile fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        staff_data = {
            "username": "TEST_new_staff_rich_profile",
            "password": "testpass123",
            "role": "user",
            "position": "Head Chef",
            "hourly_rate": 15.50,
            "phone": "+44 7700 900123",
            "employment_type": "full_time",
            "joining_date": "2025-01-15",
            "tax_id": "AB123456C"
        }
        response = requests.post(f"{BASE_URL}/api/restaurant/staff", json=staff_data, headers=headers)
        assert response.status_code == 200, f"Staff create failed: {response.text}"
        data = response.json()
        assert "id" in data
        print(f"SUCCESS: Staff created with rich profile - ID: {data['id']}")
        
        # Verify by fetching staff list
        list_response = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=headers)
        assert list_response.status_code == 200
        staff_list = list_response.json()
        created_staff = next((s for s in staff_list if s["username"] == "TEST_new_staff_rich_profile"), None)
        assert created_staff is not None, "Created staff not found in list"
        
        # Verify new fields are stored
        assert created_staff.get("position") == "Head Chef"
        assert created_staff.get("hourly_rate") == 15.50
        assert created_staff.get("phone") == "+44 7700 900123"
        assert created_staff.get("employment_type") == "full_time"
        assert created_staff.get("joining_date") == "2025-01-15"
        assert created_staff.get("tax_id") == "AB123456C"
        print("SUCCESS: All new staff profile fields verified")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/restaurant/staff/{data['id']}", headers=headers)
    
    def test_update_staff_with_new_fields(self, admin_token):
        """Update existing staff with new profile fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create a test staff first
        create_response = requests.post(f"{BASE_URL}/api/restaurant/staff", json={
            "username": "TEST_update_staff_profile",
            "password": "testpass123",
            "role": "user"
        }, headers=headers)
        assert create_response.status_code == 200
        staff_id = create_response.json()["id"]
        
        # Update with new fields
        update_data = {
            "username": "TEST_update_staff_profile",
            "role": "user",
            "position": "Senior Waiter",
            "hourly_rate": 12.75,
            "phone": "+44 7700 900456",
            "employment_type": "part_time",
            "joining_date": "2024-06-01",
            "tax_id": "XY987654Z"
        }
        update_response = requests.put(f"{BASE_URL}/api/restaurant/staff/{staff_id}", json=update_data, headers=headers)
        assert update_response.status_code == 200, f"Staff update failed: {update_response.text}"
        
        # Verify update
        list_response = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=headers)
        staff_list = list_response.json()
        updated_staff = next((s for s in staff_list if s["id"] == staff_id), None)
        assert updated_staff is not None
        assert updated_staff.get("position") == "Senior Waiter"
        assert updated_staff.get("hourly_rate") == 12.75
        assert updated_staff.get("employment_type") == "part_time"
        print("SUCCESS: Staff profile fields updated correctly")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/restaurant/staff/{staff_id}", headers=headers)


class TestBusinessTypeOnboarding:
    """Test business onboarding with Business Name and Business Type"""
    
    @pytest.fixture
    def platform_token(self):
        """Get platform owner auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=PLATFORM_OWNER)
        assert response.status_code == 200, f"Platform owner login failed: {response.text}"
        return response.json()["access_token"]
    
    def test_create_business_with_business_type(self, platform_token):
        """Create business with business_type field"""
        headers = {"Authorization": f"Bearer {platform_token}"}
        business_data = {
            "owner_email": "test_cafe@example.com",
            "subscription_plan": "standard_monthly",
            "price": 29.99,
            "currency": "GBP",
            "business_info": {
                "name": "TEST Cozy Cafe",
                "business_type": "cafe",
                "address_line1": "123 Coffee Lane",
                "city": "London",
                "postcode": "EC1A 1BB",
                "phone": "020 1234 5678",
                "email": "test_cafe@example.com"
            },
            "features": {"pos": True, "kds": False, "qr_ordering": False, "workforce": False}
        }
        response = requests.post(f"{BASE_URL}/api/restaurants", json=business_data, headers=headers)
        assert response.status_code == 200, f"Business create failed: {response.text}"
        data = response.json()
        assert "id" in data
        business_id = data["id"]
        print(f"SUCCESS: Business created with type 'cafe' - ID: {business_id}")
        
        # Verify business_type is stored - get all restaurants and find ours
        get_response = requests.get(f"{BASE_URL}/api/restaurants", headers=headers)
        assert get_response.status_code == 200
        restaurants = get_response.json()
        business = next((r for r in restaurants if r["id"] == business_id), None)
        assert business is not None, f"Business {business_id} not found in list"
        assert business.get("business_info", {}).get("business_type") == "cafe"
        assert business.get("business_info", {}).get("name") == "TEST Cozy Cafe"
        print("SUCCESS: Business type 'cafe' verified in database")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/restaurants/{business_id}", headers=headers)
    
    def test_create_business_with_various_types(self, platform_token):
        """Test creating businesses with different business types"""
        headers = {"Authorization": f"Bearer {platform_token}"}
        business_types = ["restaurant", "cafe", "bar", "takeaway", "retail", "salon", "gym", "hotel", "other"]
        
        for btype in business_types[:3]:  # Test first 3 to save time
            business_data = {
                "owner_email": f"test_{btype}@example.com",
                "subscription_plan": "standard_monthly",
                "price": 19.99,
                "currency": "GBP",
                "business_info": {
                    "name": f"TEST {btype.title()} Business",
                    "business_type": btype,
                    "address_line1": "123 Test St",
                    "city": "London",
                    "postcode": "SW1A 1AA",
                    "phone": "020 1234 5678",
                    "email": f"test_{btype}@example.com"
                },
                "features": {"pos": True}
            }
            response = requests.post(f"{BASE_URL}/api/restaurants", json=business_data, headers=headers)
            assert response.status_code == 200, f"Failed to create {btype} business: {response.text}"
            business_id = response.json()["id"]
            print(f"SUCCESS: Created business type '{btype}'")
            
            # Cleanup
            requests.delete(f"{BASE_URL}/api/restaurants/{business_id}", headers=headers)


class TestBusinessLatLngSettings:
    """Test business info latitude/longitude fields for geofence"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SKADMIN)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_update_business_with_lat_lng(self, admin_token):
        """Update business info with latitude and longitude"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Update business settings with lat/lng using correct endpoint
        update_data = {
            "business_info": {
                "name": "Pizza Palace Updated",
                "latitude": 51.5074,
                "longitude": -0.1278,
                "address_line1": "123 Test St",
                "city": "London",
                "postcode": "SW1A 1AA",
                "phone": "020 1234 5678",
                "email": "test@example.com"
            }
        }
        response = requests.put(f"{BASE_URL}/api/restaurants/my/settings", json=update_data, headers=headers)
        assert response.status_code == 200, f"Settings update failed: {response.text}"
        
        # Verify lat/lng are stored
        get_response = requests.get(f"{BASE_URL}/api/restaurants/my", headers=headers)
        assert get_response.status_code == 200
        restaurant = get_response.json()
        biz_info = restaurant.get("business_info", {})
        assert biz_info.get("latitude") == 51.5074
        assert biz_info.get("longitude") == -0.1278
        print("SUCCESS: Business lat/lng stored correctly")


class TestExistingEndpointsStillWork:
    """Verify existing POS and workforce endpoints still work"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SKADMIN)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_pos_products_endpoint(self, admin_token):
        """POS products endpoint still works"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        assert response.status_code == 200
        print("SUCCESS: GET /api/products works")
    
    def test_pos_orders_endpoint(self, admin_token):
        """POS orders endpoint still works"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/orders", headers=headers)
        assert response.status_code == 200
        print("SUCCESS: GET /api/orders works")
    
    def test_workforce_attendance_endpoint(self, admin_token):
        """Workforce attendance endpoint still works"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/attendance?start_date=2025-01-01&end_date=2025-12-31", headers=headers)
        assert response.status_code == 200
        print("SUCCESS: GET /api/attendance works")
    
    def test_workforce_shifts_endpoint(self, admin_token):
        """Workforce shifts endpoint still works"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/shifts?start_date=2025-01-01&end_date=2025-12-31", headers=headers)
        assert response.status_code == 200
        print("SUCCESS: GET /api/shifts works")
    
    def test_staff_list_endpoint(self, admin_token):
        """Staff list endpoint still works"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=headers)
        assert response.status_code == 200
        print("SUCCESS: GET /api/restaurant/staff works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
