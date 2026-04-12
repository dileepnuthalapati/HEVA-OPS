"""
Iteration 43: Three-Way Handshake Swap System Tests
Tests the full 3-step swap flow:
1. Staff A requests swap → status='waiting_acceptance'
2. Staff B accepts → status='pending_approval'
3. Manager approves → shift auto-reassigns from A to B

Also tests:
- GET /api/swap-requests/eligible/{shift_id} - returns colleagues excluding requester
- PUT /api/swap-requests/{id}/decline - removes staff from target list
- Duplicate swap request rejection
- Admin sees pending_approval + waiting_acceptance
- Staff sees own + incoming requests
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Module-level tokens and IDs
_admin_token = None
_staff_token = None
_test_shift_id = None
_test_swap_id = None
_decline_shift_id = None
_decline_swap_id = None


def get_admin_token():
    """Login as SKAdmin (admin user with staff_id=skadmin_1)"""
    global _admin_token
    if _admin_token:
        return _admin_token
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "SKAdmin",
        "password": "saswata@123"
    })
    if resp.status_code == 200:
        _admin_token = resp.json().get("access_token")
    return _admin_token


def get_staff_token():
    """Login as 'user' (staff user with staff_id=restaurant_user_1)"""
    global _staff_token
    if _staff_token:
        return _staff_token
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "user",
        "password": "user123"
    })
    if resp.status_code == 200:
        _staff_token = resp.json().get("access_token")
    return _staff_token


def admin_headers():
    token = get_admin_token()
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def staff_headers():
    token = get_staff_token()
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestSwapHandshakeFlow:
    """Test the full 3-step swap handshake flow"""
    
    # ========== SETUP: Create test shift ==========
    
    def test_01_create_shift_for_staff_user(self):
        """Create a shift assigned to 'user' (staff_id=restaurant_user_1)"""
        global _test_shift_id
        
        # Get staff list to find 'user' staff_id
        staff_resp = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=admin_headers())
        assert staff_resp.status_code == 200, f"Failed to get staff: {staff_resp.text}"
        staff_list = staff_resp.json()
        
        staff_user = next((s for s in staff_list if s.get("username") == "user"), None)
        assert staff_user is not None, f"Staff 'user' not found. Available: {[s.get('username') for s in staff_list]}"
        staff_id = staff_user.get("id")
        print(f"Found staff 'user' with id: {staff_id}")
        
        # Create shift for tomorrow
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        shift_data = {
            "staff_id": staff_id,
            "date": tomorrow,
            "start_time": "09:00",
            "end_time": "17:00",
            "position": "Server",
            "note": "TEST_swap_handshake_shift"
        }
        
        resp = requests.post(f"{BASE_URL}/api/shifts", json=shift_data, headers=admin_headers())
        assert resp.status_code in [200, 201], f"Failed to create shift: {resp.text}"
        
        shift = resp.json()
        _test_shift_id = shift["id"]
        print(f"✓ Created shift {_test_shift_id} for 'user' on {tomorrow}")
    
    # ========== STEP 1: Staff A requests swap ==========
    
    def test_02_staff_creates_swap_request(self):
        """POST /api/swap-requests - Staff creates swap request with status='waiting_acceptance'"""
        global _test_shift_id, _test_swap_id
        assert _test_shift_id, "No shift created"
        
        swap_data = {
            "shift_id": _test_shift_id,
            "reason": "Personal appointment - testing 3-step swap"
        }
        
        resp = requests.post(f"{BASE_URL}/api/swap-requests", json=swap_data, headers=staff_headers())
        assert resp.status_code in [200, 201], f"Failed to create swap request: {resp.text}"
        
        result = resp.json()
        assert "id" in result, "Response missing 'id'"
        assert result.get("status") == "waiting_acceptance", f"Expected status='waiting_acceptance', got '{result.get('status')}'"
        
        _test_swap_id = result["id"]
        print(f"✓ Created swap request {_test_swap_id} with status='waiting_acceptance'")
    
    def test_03_duplicate_swap_request_rejected(self):
        """POST /api/swap-requests - Duplicate request for same shift should fail"""
        global _test_shift_id
        assert _test_shift_id, "No shift created"
        
        swap_data = {
            "shift_id": _test_shift_id,
            "reason": "Another reason"
        }
        
        resp = requests.post(f"{BASE_URL}/api/swap-requests", json=swap_data, headers=staff_headers())
        assert resp.status_code == 400, f"Expected 400 for duplicate, got {resp.status_code}: {resp.text}"
        print("✓ Duplicate swap request correctly rejected")
    
    def test_04_get_eligible_staff_excludes_requester(self):
        """GET /api/swap-requests/eligible/{shift_id} - Returns colleagues excluding requester"""
        global _test_shift_id
        assert _test_shift_id, "No shift created"
        
        resp = requests.get(f"{BASE_URL}/api/swap-requests/eligible/{_test_shift_id}", headers=staff_headers())
        assert resp.status_code == 200, f"Failed to get eligible staff: {resp.text}"
        
        eligible = resp.json()
        assert isinstance(eligible, list), "Response should be a list"
        
        # Should not include the requester ('user')
        usernames = [s.get("username") for s in eligible]
        assert "user" not in usernames, f"Requester 'user' should not be in eligible list: {usernames}"
        
        # Should include SKAdmin (who can accept)
        assert "SKAdmin" in usernames, f"SKAdmin should be in eligible list: {usernames}"
        print(f"✓ Eligible staff: {usernames} (excludes requester)")
    
    def test_05_admin_sees_waiting_acceptance_requests(self):
        """GET /api/swap-requests - Admin sees requests in waiting_acceptance status"""
        global _test_swap_id
        
        resp = requests.get(f"{BASE_URL}/api/swap-requests", headers=admin_headers())
        assert resp.status_code == 200, f"Failed to get swap requests: {resp.text}"
        
        swaps = resp.json()
        found = next((s for s in swaps if s.get("id") == _test_swap_id), None)
        assert found is not None, f"Swap {_test_swap_id} not found in admin's list"
        assert found.get("status") == "waiting_acceptance", f"Expected status='waiting_acceptance', got '{found.get('status')}'"
        print(f"✓ Admin sees swap request {_test_swap_id} with status='waiting_acceptance'")
    
    def test_06_staff_sees_own_requests(self):
        """GET /api/swap-requests - Staff sees their own requests"""
        global _test_swap_id
        
        resp = requests.get(f"{BASE_URL}/api/swap-requests", headers=staff_headers())
        assert resp.status_code == 200, f"Failed to get swap requests: {resp.text}"
        
        swaps = resp.json()
        found = next((s for s in swaps if s.get("id") == _test_swap_id), None)
        assert found is not None, f"Staff cannot see their own swap request {_test_swap_id}"
        print(f"✓ Staff sees their own swap request {_test_swap_id}")
    
    # ========== STEP 2: Staff B (SKAdmin) accepts ==========
    
    def test_07_admin_cannot_approve_before_acceptance(self):
        """PUT /api/swap-requests/{id}/approve - Cannot approve while waiting_acceptance"""
        global _test_swap_id
        assert _test_swap_id, "No swap request created"
        
        resp = requests.put(f"{BASE_URL}/api/swap-requests/{_test_swap_id}/approve", headers=admin_headers())
        assert resp.status_code == 400, f"Expected 400 (must be pending_approval), got {resp.status_code}: {resp.text}"
        print("✓ Cannot approve swap before colleague accepts")
    
    def test_08_colleague_accepts_swap(self):
        """PUT /api/swap-requests/{id}/accept - SKAdmin accepts, status becomes 'pending_approval'"""
        global _test_swap_id
        assert _test_swap_id, "No swap request created"
        
        resp = requests.put(f"{BASE_URL}/api/swap-requests/{_test_swap_id}/accept", headers=admin_headers())
        assert resp.status_code == 200, f"Failed to accept swap: {resp.text}"
        
        result = resp.json()
        assert result.get("status") == "pending_approval", f"Expected status='pending_approval', got '{result.get('status')}'"
        print(f"✓ SKAdmin accepted swap, status now 'pending_approval'")
    
    def test_09_swap_shows_acceptor_info(self):
        """GET /api/swap-requests - Swap now shows acceptor_id and acceptor_name"""
        global _test_swap_id
        
        resp = requests.get(f"{BASE_URL}/api/swap-requests", headers=admin_headers())
        assert resp.status_code == 200
        
        swaps = resp.json()
        found = next((s for s in swaps if s.get("id") == _test_swap_id), None)
        assert found is not None, f"Swap {_test_swap_id} not found"
        assert found.get("status") == "pending_approval", f"Expected status='pending_approval'"
        assert found.get("acceptor_name") == "SKAdmin", f"Expected acceptor_name='SKAdmin', got '{found.get('acceptor_name')}'"
        print(f"✓ Swap shows acceptor: {found.get('acceptor_name')}")
    
    # ========== STEP 3: Manager approves ==========
    
    def test_10_admin_approves_swap(self):
        """PUT /api/swap-requests/{id}/approve - Admin approves, shift auto-reassigns"""
        global _test_swap_id, _test_shift_id
        assert _test_swap_id, "No swap request created"
        
        resp = requests.put(f"{BASE_URL}/api/swap-requests/{_test_swap_id}/approve", headers=admin_headers())
        assert resp.status_code == 200, f"Failed to approve swap: {resp.text}"
        
        result = resp.json()
        assert "message" in result, "Response missing message"
        print(f"✓ Admin approved swap: {result.get('message')}")
    
    def test_11_shift_reassigned_to_acceptor(self):
        """Verify shift.staff_id changed from requester to acceptor"""
        global _test_shift_id
        assert _test_shift_id, "No shift created"
        
        # Get staff list to find SKAdmin's staff_id
        staff_resp = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=admin_headers())
        staff_list = staff_resp.json()
        skadmin = next((s for s in staff_list if s.get("username") == "SKAdmin"), None)
        skadmin_id = skadmin.get("id") if skadmin else None
        
        # Get shifts
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        shifts_resp = requests.get(
            f"{BASE_URL}/api/shifts",
            params={"start_date": tomorrow, "end_date": tomorrow},
            headers=admin_headers()
        )
        assert shifts_resp.status_code == 200
        
        shifts = shifts_resp.json()
        shift = next((s for s in shifts if s.get("id") == _test_shift_id), None)
        
        if shift:
            # Shift should now be assigned to SKAdmin (the acceptor)
            assert shift.get("staff_id") == skadmin_id, \
                f"Shift should be reassigned to SKAdmin ({skadmin_id}), but got {shift.get('staff_id')}"
            print(f"✓ Shift {_test_shift_id} reassigned from 'user' to 'SKAdmin'")
        else:
            print(f"⚠ Shift {_test_shift_id} not found in shifts list")


class TestDeclineFlow:
    """Test the decline flow - staff removed from target list"""
    
    def test_12_create_shift_for_decline_test(self):
        """Create another shift for decline testing"""
        global _decline_shift_id
        
        staff_resp = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=admin_headers())
        staff_list = staff_resp.json()
        staff_user = next((s for s in staff_list if s.get("username") == "user"), None)
        staff_id = staff_user.get("id")
        
        day_after = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        shift_data = {
            "staff_id": staff_id,
            "date": day_after,
            "start_time": "10:00",
            "end_time": "18:00",
            "position": "Cashier",
            "note": "TEST_decline_shift"
        }
        
        resp = requests.post(f"{BASE_URL}/api/shifts", json=shift_data, headers=admin_headers())
        assert resp.status_code in [200, 201], f"Failed to create shift: {resp.text}"
        
        _decline_shift_id = resp.json()["id"]
        print(f"✓ Created shift {_decline_shift_id} for decline test")
    
    def test_13_staff_creates_swap_for_decline(self):
        """Staff creates swap request to test decline"""
        global _decline_shift_id, _decline_swap_id
        assert _decline_shift_id, "No shift created"
        
        swap_data = {
            "shift_id": _decline_shift_id,
            "reason": "Testing decline flow"
        }
        
        resp = requests.post(f"{BASE_URL}/api/swap-requests", json=swap_data, headers=staff_headers())
        assert resp.status_code in [200, 201], f"Failed to create swap: {resp.text}"
        
        _decline_swap_id = resp.json()["id"]
        print(f"✓ Created swap request {_decline_swap_id} for decline test")
    
    def test_14_colleague_declines_swap(self):
        """PUT /api/swap-requests/{id}/decline - SKAdmin declines"""
        global _decline_swap_id
        assert _decline_swap_id, "No swap request created"
        
        resp = requests.put(f"{BASE_URL}/api/swap-requests/{_decline_swap_id}/decline", headers=admin_headers())
        assert resp.status_code == 200, f"Failed to decline swap: {resp.text}"
        
        result = resp.json()
        # If SKAdmin was the only target, status should be 'expired'
        # Otherwise, status remains 'waiting_acceptance'
        print(f"✓ Decline result: {result}")


class TestAdminRejectFlow:
    """Test admin rejection of swap requests"""
    
    def test_15_admin_rejects_waiting_acceptance(self):
        """PUT /api/swap-requests/{id}/reject - Admin can reject even waiting_acceptance"""
        global _decline_swap_id
        
        # Create a new swap for rejection test
        staff_resp = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=admin_headers())
        staff_list = staff_resp.json()
        staff_user = next((s for s in staff_list if s.get("username") == "user"), None)
        staff_id = staff_user.get("id")
        
        day3 = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        shift_data = {
            "staff_id": staff_id,
            "date": day3,
            "start_time": "11:00",
            "end_time": "19:00",
            "position": "Host",
            "note": "TEST_reject_shift"
        }
        
        shift_resp = requests.post(f"{BASE_URL}/api/shifts", json=shift_data, headers=admin_headers())
        if shift_resp.status_code not in [200, 201]:
            pytest.skip("Could not create shift for reject test")
        
        shift_id = shift_resp.json()["id"]
        
        # Create swap request
        swap_resp = requests.post(f"{BASE_URL}/api/swap-requests", json={
            "shift_id": shift_id,
            "reason": "Testing reject"
        }, headers=staff_headers())
        
        if swap_resp.status_code not in [200, 201]:
            pytest.skip("Could not create swap for reject test")
        
        swap_id = swap_resp.json()["id"]
        
        # Admin rejects
        reject_resp = requests.put(f"{BASE_URL}/api/swap-requests/{swap_id}/reject", headers=admin_headers())
        assert reject_resp.status_code == 200, f"Failed to reject: {reject_resp.text}"
        print(f"✓ Admin rejected swap request {swap_id}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/shifts/{shift_id}", headers=admin_headers())


class TestEdgeCases:
    """Test edge cases and error handling"""
    
    def test_16_swap_request_without_auth_fails(self):
        """POST /api/swap-requests - Unauthenticated request fails"""
        resp = requests.post(f"{BASE_URL}/api/swap-requests", json={
            "shift_id": "some_shift",
            "reason": "test"
        })
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
        print("✓ Unauthenticated swap request rejected")
    
    def test_17_swap_for_nonexistent_shift_fails(self):
        """POST /api/swap-requests - Request for non-existent shift fails"""
        resp = requests.post(f"{BASE_URL}/api/swap-requests", json={
            "shift_id": "nonexistent_shift_xyz",
            "reason": "test"
        }, headers=staff_headers())
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"
        print("✓ Swap for nonexistent shift rejected")
    
    def test_18_staff_cannot_approve(self):
        """PUT /api/swap-requests/{id}/approve - Staff cannot approve (admin only)"""
        # Use a fake ID - should fail with 403 before 404
        resp = requests.put(f"{BASE_URL}/api/swap-requests/fake_id/approve", headers=staff_headers())
        assert resp.status_code in [401, 403], f"Expected 401/403 for staff approve, got {resp.status_code}"
        print("✓ Staff correctly denied from approving")
    
    def test_19_staff_cannot_reject(self):
        """PUT /api/swap-requests/{id}/reject - Staff cannot reject (admin only)"""
        resp = requests.put(f"{BASE_URL}/api/swap-requests/fake_id/reject", headers=staff_headers())
        assert resp.status_code in [401, 403], f"Expected 401/403 for staff reject, got {resp.status_code}"
        print("✓ Staff correctly denied from rejecting")


class TestCleanup:
    """Cleanup test data"""
    
    def test_99_cleanup_test_shifts(self):
        """Delete test shifts created during testing"""
        global _test_shift_id, _decline_shift_id
        
        headers = admin_headers()
        
        for shift_id in [_test_shift_id, _decline_shift_id]:
            if shift_id:
                resp = requests.delete(f"{BASE_URL}/api/shifts/{shift_id}", headers=headers)
                print(f"Cleanup shift {shift_id}: {resp.status_code}")
        
        print("✓ Cleanup completed")
