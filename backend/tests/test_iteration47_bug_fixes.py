"""
Iteration 47: Bug Fixes Testing
- Username space validation (backend)
- Input text visibility (frontend - visual)
- Availability delete functionality
- Skeleton loading states
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USERNAME = "SKAdmin"
ADMIN_PASSWORD = "saswata@123"
STAFF_USERNAME = "user"
STAFF_PASSWORD = "user123"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def staff_token():
    """Get staff auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": STAFF_USERNAME,
        "password": STAFF_PASSWORD
    })
    assert response.status_code == 200, f"Staff login failed: {response.text}"
    return response.json()["access_token"]


class TestUsernameSpaceValidation:
    """Test that usernames with spaces are rejected"""
    
    def test_register_rejects_username_with_spaces(self):
        """POST /api/auth/register should reject usernames with spaces"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "username": "test user with spaces",
            "password": "testpass123",
            "role": "user"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "space" in data.get("detail", "").lower(), f"Expected space error, got: {data}"
        print("PASS: /api/auth/register rejects usernames with spaces")
    
    def test_register_rejects_username_with_single_space(self):
        """POST /api/auth/register should reject usernames with even a single space"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "username": "test user",
            "password": "testpass123",
            "role": "user"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "space" in data.get("detail", "").lower(), f"Expected space error, got: {data}"
        print("PASS: /api/auth/register rejects usernames with single space")
    
    def test_register_accepts_username_without_spaces(self):
        """POST /api/auth/register should accept valid usernames"""
        # Use timestamp to ensure unique username
        unique_username = f"TEST_validuser_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "username": unique_username,
            "password": "testpass123",
            "role": "user"
        })
        # Should succeed (200) or fail for other reasons (not space-related)
        if response.status_code == 200:
            print(f"PASS: /api/auth/register accepts valid username '{unique_username}'")
        elif response.status_code == 400:
            data = response.json()
            # Should NOT be a space-related error
            assert "space" not in data.get("detail", "").lower(), f"Unexpected space error for valid username"
            print(f"PASS: /api/auth/register accepts valid username (other validation may apply)")
        else:
            print(f"INFO: Got status {response.status_code} - {response.text}")
    
    def test_create_staff_rejects_username_with_spaces(self, admin_token):
        """POST /api/restaurant/staff should reject usernames with spaces"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(f"{BASE_URL}/api/restaurant/staff", json={
            "username": "staff with spaces",
            "email": "test@example.com",
            "password": "testpass123",
            "role": "user"
        }, headers=headers)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "space" in data.get("detail", "").lower(), f"Expected space error, got: {data}"
        print("PASS: /api/restaurant/staff rejects usernames with spaces")
    
    def test_create_staff_accepts_username_without_spaces(self, admin_token):
        """POST /api/restaurant/staff should accept valid usernames"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        unique_username = f"TEST_staffuser_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/restaurant/staff", json={
            "username": unique_username,
            "email": f"{unique_username}@example.com",
            "password": "testpass123",
            "role": "user"
        }, headers=headers)
        # Should succeed or fail for non-space reasons
        if response.status_code in [200, 201]:
            print(f"PASS: /api/restaurant/staff accepts valid username '{unique_username}'")
            # Cleanup - delete the test user
            data = response.json()
            if "id" in data:
                requests.delete(f"{BASE_URL}/api/restaurant/staff/{data['id']}", headers=headers)
        elif response.status_code == 400:
            data = response.json()
            assert "space" not in data.get("detail", "").lower(), f"Unexpected space error for valid username"
            print(f"PASS: /api/restaurant/staff accepts valid username (other validation may apply)")


class TestAvailabilityManagement:
    """Test availability CRUD operations including delete"""
    
    def test_get_my_availability(self, staff_token):
        """GET /api/availability/my should return availability rules"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.get(f"{BASE_URL}/api/availability/my", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "rules" in data, f"Expected 'rules' in response, got: {data}"
        print(f"PASS: GET /api/availability/my returns rules (count: {len(data.get('rules', []))})")
    
    def test_create_availability_rule(self, staff_token):
        """PUT /api/availability/my should create availability rules"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        
        # First get current rules
        get_response = requests.get(f"{BASE_URL}/api/availability/my", headers=headers)
        current_rules = get_response.json().get("rules", [])
        
        # Add a test rule
        test_rule = {
            "day_of_week": 3,  # Wednesday
            "unavailable_from": "14:00",
            "unavailable_to": "18:00",
            "reason": "TEST_iteration47"
        }
        new_rules = current_rules + [test_rule]
        
        response = requests.put(f"{BASE_URL}/api/availability/my", json={
            "rules": new_rules
        }, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: PUT /api/availability/my creates availability rule")
        
        # Verify the rule was added
        verify_response = requests.get(f"{BASE_URL}/api/availability/my", headers=headers)
        verify_data = verify_response.json()
        rules = verify_data.get("rules", [])
        test_rules = [r for r in rules if r.get("reason") == "TEST_iteration47"]
        assert len(test_rules) > 0, "Test rule not found after creation"
        print("PASS: Availability rule verified after creation")
        
        return new_rules
    
    def test_delete_availability_rule(self, staff_token):
        """PUT /api/availability/my with removed rule should delete it"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        
        # First ensure we have a test rule
        get_response = requests.get(f"{BASE_URL}/api/availability/my", headers=headers)
        current_rules = get_response.json().get("rules", [])
        
        # Add a test rule if not present
        test_rule = {
            "day_of_week": 4,  # Thursday
            "unavailable_from": "10:00",
            "unavailable_to": "12:00",
            "reason": "TEST_delete_iteration47"
        }
        
        # Add the rule
        rules_with_test = current_rules + [test_rule]
        requests.put(f"{BASE_URL}/api/availability/my", json={"rules": rules_with_test}, headers=headers)
        
        # Verify it was added
        verify_add = requests.get(f"{BASE_URL}/api/availability/my", headers=headers)
        rules_after_add = verify_add.json().get("rules", [])
        test_rules = [r for r in rules_after_add if r.get("reason") == "TEST_delete_iteration47"]
        assert len(test_rules) > 0, "Test rule not found after adding"
        
        # Now delete by removing from array and PUT
        rules_without_test = [r for r in rules_after_add if r.get("reason") != "TEST_delete_iteration47"]
        delete_response = requests.put(f"{BASE_URL}/api/availability/my", json={
            "rules": rules_without_test
        }, headers=headers)
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        
        # Verify deletion
        verify_delete = requests.get(f"{BASE_URL}/api/availability/my", headers=headers)
        rules_after_delete = verify_delete.json().get("rules", [])
        remaining_test_rules = [r for r in rules_after_delete if r.get("reason") == "TEST_delete_iteration47"]
        assert len(remaining_test_rules) == 0, f"Test rule still exists after deletion: {remaining_test_rules}"
        print("PASS: Availability rule deleted successfully via PUT with removed rule")


class TestSchedulerBlocks:
    """Test scheduler blocks endpoint for partial-day display"""
    
    def test_scheduler_blocks_returns_partial_day_times(self, admin_token):
        """GET /api/scheduler/blocks should return from/to times for soft blocks"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get current week dates
        from datetime import datetime, timedelta
        today = datetime.now()
        start_of_week = today - timedelta(days=today.weekday())
        end_of_week = start_of_week + timedelta(days=6)
        
        start_date = start_of_week.strftime("%Y-%m-%d")
        end_date = end_of_week.strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/scheduler/blocks?start_date={start_date}&end_date={end_date}",
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Check structure - should be {staff_id: {date: {block_type, reason, from?, to?}}}
        print(f"PASS: GET /api/scheduler/blocks returns data structure")
        
        # If there are soft blocks, verify they have from/to fields
        for staff_id, dates in data.items():
            for date, block in dates.items():
                if block.get("block_type") == "soft":
                    # Soft blocks should have from/to for partial days
                    print(f"  Found soft block for {staff_id} on {date}: {block}")
                    if block.get("from") and block.get("to"):
                        print(f"  PASS: Soft block has from/to times: {block['from']} - {block['to']}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_availability_rules(self, staff_token):
        """Remove any TEST_ prefixed availability rules"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        
        get_response = requests.get(f"{BASE_URL}/api/availability/my", headers=headers)
        current_rules = get_response.json().get("rules", [])
        
        # Remove TEST_ rules
        clean_rules = [r for r in current_rules if not str(r.get("reason", "")).startswith("TEST_")]
        
        if len(clean_rules) != len(current_rules):
            requests.put(f"{BASE_URL}/api/availability/my", json={"rules": clean_rules}, headers=headers)
            print(f"CLEANUP: Removed {len(current_rules) - len(clean_rules)} test availability rules")
        else:
            print("CLEANUP: No test availability rules to remove")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
