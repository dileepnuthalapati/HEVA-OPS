"""
Iteration 54: Geofence Radius & Email Status Tests
- Geofence radius changed from 10m to 50m default (configurable per restaurant)
- Clock-me with coordinates 30m away should SUCCEED (within 50m)
- Clock-me with coordinates 80m away should FAIL
- Staff creation returns email_status field
"""
import pytest
import requests
import os
import math

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Restaurant geofence center: lat=51.5074, lng=-0.1278, radius=50m
RESTAURANT_LAT = 51.5074
RESTAURANT_LNG = -0.1278
GEOFENCE_RADIUS = 50  # meters

# Test credentials
ADMIN_USERNAME = "SKAdmin"
ADMIN_PASSWORD = "saswata@123"
STAFF_USERNAME = "user"
STAFF_PASSWORD = "user123"


def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance in meters between two GPS coordinates."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def calculate_offset_coords(lat, lng, distance_meters, bearing_degrees=0):
    """Calculate new coordinates at a given distance and bearing from origin."""
    R = 6371000  # Earth radius in meters
    bearing = math.radians(bearing_degrees)
    lat1 = math.radians(lat)
    lng1 = math.radians(lng)
    
    lat2 = math.asin(
        math.sin(lat1) * math.cos(distance_meters / R) +
        math.cos(lat1) * math.sin(distance_meters / R) * math.cos(bearing)
    )
    lng2 = lng1 + math.atan2(
        math.sin(bearing) * math.sin(distance_meters / R) * math.cos(lat1),
        math.cos(distance_meters / R) - math.sin(lat1) * math.sin(lat2)
    )
    
    return math.degrees(lat2), math.degrees(lng2)


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def staff_token():
    """Get staff authentication token."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": STAFF_USERNAME,
        "password": STAFF_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Staff login failed: {response.status_code} - {response.text}")


class TestGeofenceRadius:
    """Test geofence radius functionality - now 50m default instead of 10m"""
    
    def test_clock_me_within_30m_should_succeed(self, staff_token):
        """Clock-me with coordinates 30m away from restaurant should SUCCEED (within 50m radius)"""
        # Calculate coordinates 30m north of restaurant
        lat_30m, lng_30m = calculate_offset_coords(RESTAURANT_LAT, RESTAURANT_LNG, 30, bearing_degrees=0)
        
        # Verify distance is approximately 30m
        actual_distance = haversine_distance(RESTAURANT_LAT, RESTAURANT_LNG, lat_30m, lng_30m)
        print(f"Calculated coordinates: lat={lat_30m:.6f}, lng={lng_30m:.6f}")
        print(f"Actual distance from restaurant: {actual_distance:.1f}m")
        assert 25 < actual_distance < 35, f"Expected ~30m, got {actual_distance:.1f}m"
        
        # First, check current status and clock out if needed
        headers = {"Authorization": f"Bearer {staff_token}"}
        status_response = requests.get(f"{BASE_URL}/api/attendance/my-status", headers=headers)
        print(f"Current status: {status_response.json()}")
        
        if status_response.status_code == 200:
            status = status_response.json()
            if status.get("clocked_in"):
                # Clock out first
                clock_out_response = requests.post(
                    f"{BASE_URL}/api/attendance/clock-me",
                    headers=headers,
                    json={"latitude": lat_30m, "longitude": lng_30m}
                )
                print(f"Clocked out first: {clock_out_response.status_code} - {clock_out_response.text}")
        
        # Now attempt clock-in at 30m distance
        response = requests.post(
            f"{BASE_URL}/api/attendance/clock-me",
            headers=headers,
            json={"latitude": lat_30m, "longitude": lng_30m}
        )
        
        print(f"Clock-me at 30m response: {response.status_code} - {response.text}")
        
        # Should succeed - 30m is within 50m radius
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("action") in ["clock_in", "clock_out"], f"Expected clock_in or clock_out action, got: {data}"
        print(f"SUCCESS: Clock-me at 30m succeeded with action: {data.get('action')}")
    
    def test_clock_me_at_80m_should_fail(self, staff_token):
        """Clock-me with coordinates 80m away from restaurant should FAIL (outside 50m radius)"""
        # Calculate coordinates 80m north of restaurant
        lat_80m, lng_80m = calculate_offset_coords(RESTAURANT_LAT, RESTAURANT_LNG, 80, bearing_degrees=0)
        
        # Verify distance is approximately 80m
        actual_distance = haversine_distance(RESTAURANT_LAT, RESTAURANT_LNG, lat_80m, lng_80m)
        print(f"Calculated coordinates: lat={lat_80m:.6f}, lng={lng_80m:.6f}")
        print(f"Actual distance from restaurant: {actual_distance:.1f}m")
        assert 75 < actual_distance < 85, f"Expected ~80m, got {actual_distance:.1f}m"
        
        headers = {"Authorization": f"Bearer {staff_token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/attendance/clock-me",
            headers=headers,
            json={"latitude": lat_80m, "longitude": lng_80m}
        )
        
        print(f"Clock-me at 80m response: {response.status_code} - {response.text}")
        
        # Should fail - 80m is outside 50m radius
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        data = response.json()
        assert "away" in data.get("detail", "").lower() or "within" in data.get("detail", "").lower(), \
            f"Expected geofence error message, got: {data}"
        # Verify the error message mentions 50m radius (not 10m)
        assert "50m" in data.get("detail", "") or "50" in data.get("detail", ""), \
            f"Expected error to mention 50m radius, got: {data.get('detail')}"
        print(f"SUCCESS: Clock-me at 80m correctly rejected with message: {data.get('detail')}")
    
    def test_geofence_uses_restaurant_radius_not_hardcoded(self, admin_token):
        """Verify geofence uses restaurant's business_info.geofence_radius (not hardcoded 10m)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get restaurant settings
        response = requests.get(f"{BASE_URL}/api/restaurants/my", headers=headers)
        assert response.status_code == 200, f"Failed to get restaurant: {response.text}"
        
        data = response.json()
        business_info = data.get("business_info", {})
        geofence_radius = business_info.get("geofence_radius")
        
        print(f"Restaurant business_info: {business_info}")
        print(f"Geofence radius from DB: {geofence_radius}")
        
        # Verify geofence_radius is set and is 50 (not 10)
        assert geofence_radius is not None, "geofence_radius should be set in business_info"
        assert geofence_radius == 50, f"Expected geofence_radius=50, got {geofence_radius}"
        print(f"SUCCESS: Restaurant geofence_radius is correctly set to {geofence_radius}m")


class TestEmailStatus:
    """Test email_status field in staff creation response"""
    
    def test_staff_creation_returns_email_status(self, admin_token):
        """POST /api/restaurant/staff should return email_status field"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create a test staff member (we won't actually send email to avoid quota issues)
        # Using a fake email that won't actually send
        import time
        test_username = f"TEST_email_status_{int(time.time())}"
        
        response = requests.post(
            f"{BASE_URL}/api/restaurant/staff",
            headers=headers,
            json={
                "username": test_username,
                "email": f"{test_username}@test-no-send.invalid",  # Invalid domain won't send
                "password": "testpass123",
                "role": "user",
                "position": "Test Position"
            }
        )
        
        print(f"Staff creation response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Staff creation failed: {response.text}"
        data = response.json()
        
        # Verify email_status field exists in response
        assert "email_status" in data, f"email_status field missing from response: {data}"
        print(f"SUCCESS: email_status field present in response: {data.get('email_status')}")
        
        # Clean up - delete the test user
        user_id = data.get("id")
        if user_id:
            delete_response = requests.delete(
                f"{BASE_URL}/api/restaurant/staff/{user_id}",
                headers=headers
            )
            print(f"Cleanup - deleted test user: {delete_response.status_code}")
    
    def test_staff_list_endpoint_works(self, admin_token):
        """GET /api/restaurant/staff should return staff list"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=headers)
        
        print(f"Staff list response: {response.status_code}")
        
        assert response.status_code == 200, f"Staff list failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"SUCCESS: Staff list returned {len(data)} members")


class TestGeofenceConfiguration:
    """Test geofence radius configuration in settings"""
    
    def test_update_geofence_radius(self, admin_token):
        """Verify geofence_radius can be updated via settings"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get current settings
        get_response = requests.get(f"{BASE_URL}/api/restaurants/my", headers=headers)
        assert get_response.status_code == 200
        current_data = get_response.json()
        current_business_info = current_data.get("business_info", {})
        original_radius = current_business_info.get("geofence_radius", 50)
        
        print(f"Original geofence_radius: {original_radius}")
        
        # Update to a different value (75m)
        new_radius = 75
        updated_business_info = {**current_business_info, "geofence_radius": new_radius}
        
        update_response = requests.put(
            f"{BASE_URL}/api/restaurants/my/settings",
            headers=headers,
            json={"business_info": updated_business_info}
        )
        
        print(f"Update response: {update_response.status_code} - {update_response.text}")
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        # Verify the update
        verify_response = requests.get(f"{BASE_URL}/api/restaurants/my", headers=headers)
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        new_geofence = verify_data.get("business_info", {}).get("geofence_radius")
        
        print(f"Updated geofence_radius: {new_geofence}")
        assert new_geofence == new_radius, f"Expected {new_radius}, got {new_geofence}"
        
        # Restore original value
        restore_business_info = {**current_business_info, "geofence_radius": original_radius}
        restore_response = requests.put(
            f"{BASE_URL}/api/restaurants/my/settings",
            headers=headers,
            json={"business_info": restore_business_info}
        )
        print(f"Restored geofence_radius to {original_radius}: {restore_response.status_code}")
        
        print(f"SUCCESS: Geofence radius is configurable (tested {original_radius} -> {new_radius} -> {original_radius})")


class TestClockMeCleanup:
    """Cleanup: ensure staff is clocked out after tests"""
    
    def test_cleanup_clock_out_staff(self, staff_token):
        """Ensure staff is clocked out after geofence tests"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        
        # Check status
        status_response = requests.get(f"{BASE_URL}/api/attendance/my-status", headers=headers)
        if status_response.status_code == 200:
            status = status_response.json()
            if status.get("clocked_in"):
                # Clock out using valid coordinates (within geofence)
                lat_valid, lng_valid = calculate_offset_coords(RESTAURANT_LAT, RESTAURANT_LNG, 10, bearing_degrees=0)
                clock_out_response = requests.post(
                    f"{BASE_URL}/api/attendance/clock-me",
                    headers=headers,
                    json={"latitude": lat_valid, "longitude": lng_valid}
                )
                print(f"Cleanup clock-out: {clock_out_response.status_code} - {clock_out_response.text}")
                assert clock_out_response.status_code == 200, f"Cleanup clock-out failed: {clock_out_response.text}"
                print("SUCCESS: Staff clocked out for cleanup")
            else:
                print("Staff already clocked out, no cleanup needed")
        else:
            print(f"Could not check status: {status_response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
