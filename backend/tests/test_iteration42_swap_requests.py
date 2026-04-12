"""
Iteration 42: Swap Requests & Shift Scheduler Fixes
Tests:
1. POST /api/swap-requests - Staff creates swap request
2. GET /api/swap-requests - Admin sees pending, staff sees own
3. PUT /api/swap-requests/{id}/approve - Admin approves (shift becomes OPEN)
4. PUT /api/swap-requests/{id}/reject - Admin rejects
5. POST /api/shifts - Regression check for shift creation
"""
import pytest
import requests
import os
import time
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Module-level tokens to avoid rate limiting
_admin_token = None
_staff_token = None
_created_shift_id = None
_created_swap_id = None
_second_shift_id = None
_second_swap_id = None


def get_admin_token():
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


class TestSwapRequestsAndShifts:
    """Test swap requests CRUD and shift creation"""
    
    # ========== SHIFT CREATION (Regression) ==========
    
    def test_01_create_shift_for_staff(self):
        """POST /api/shifts - Admin creates a shift for staff user"""
        global _created_shift_id
        
        # Get staff list to find staff user's ID
        staff_resp = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=admin_headers())
        assert staff_resp.status_code == 200, f"Failed to get staff: {staff_resp.text}"
        staff_list = staff_resp.json()
        
        # Find the 'user' staff member
        staff_user = next((s for s in staff_list if s.get("username") == "user"), None)
        assert staff_user is not None, f"Staff user 'user' not found in staff list: {[s.get('username') for s in staff_list]}"
        staff_id = staff_user.get("id")
        
        # Create shift for tomorrow
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        shift_data = {
            "staff_id": staff_id,
            "date": tomorrow,
            "start_time": "09:00",
            "end_time": "17:00",
            "position": "Server",
            "note": "TEST_swap_request_shift"
        }
        
        resp = requests.post(f"{BASE_URL}/api/shifts", json=shift_data, headers=admin_headers())
        assert resp.status_code in [200, 201], f"Failed to create shift: {resp.text}"
        
        shift = resp.json()
        assert "id" in shift, "Shift response missing 'id'"
        assert shift.get("staff_id") == staff_id, "Shift staff_id mismatch"
        assert shift.get("date") == tomorrow, "Shift date mismatch"
        
        _created_shift_id = shift["id"]
        print(f"✓ Created shift {shift['id']} for staff user on {tomorrow}")
    
    def test_02_get_shifts_returns_created_shift(self):
        """GET /api/shifts - Verify created shift appears in list"""
        global _created_shift_id
        assert _created_shift_id, "No shift created in previous test"
        
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        resp = requests.get(
            f"{BASE_URL}/api/shifts",
            params={"start_date": tomorrow, "end_date": tomorrow},
            headers=admin_headers()
        )
        assert resp.status_code == 200, f"Failed to get shifts: {resp.text}"
        
        shifts = resp.json()
        assert isinstance(shifts, list), "Shifts response should be a list"
        
        found = any(s.get("id") == _created_shift_id for s in shifts)
        assert found, f"Created shift {_created_shift_id} not found in shifts list"
        print(f"✓ Shift {_created_shift_id} found in shifts list")
    
    # ========== SWAP REQUESTS ==========
    
    def test_03_staff_creates_swap_request(self):
        """POST /api/swap-requests - Staff requests to swap their shift"""
        global _created_shift_id, _created_swap_id
        assert _created_shift_id, "No shift created to swap"
        
        swap_data = {
            "shift_id": _created_shift_id,
            "reason": "Personal appointment"
        }
        
        resp = requests.post(f"{BASE_URL}/api/swap-requests", json=swap_data, headers=staff_headers())
        assert resp.status_code in [200, 201], f"Failed to create swap request: {resp.text}"
        
        swap = resp.json()
        assert "id" in swap, "Swap request response missing 'id'"
        assert swap.get("shift_id") == _created_shift_id, "Swap shift_id mismatch"
        assert swap.get("status") == "pending", "Swap status should be 'pending'"
        assert swap.get("reason") == "Personal appointment", "Swap reason mismatch"
        
        _created_swap_id = swap["id"]
        print(f"✓ Created swap request {swap['id']} for shift {_created_shift_id}")
    
    def test_04_duplicate_swap_request_rejected(self):
        """POST /api/swap-requests - Duplicate request for same shift should fail"""
        global _created_shift_id
        assert _created_shift_id, "No shift created"
        
        swap_data = {
            "shift_id": _created_shift_id,
            "reason": "Another reason"
        }
        
        resp = requests.post(f"{BASE_URL}/api/swap-requests", json=swap_data, headers=staff_headers())
        assert resp.status_code == 400, f"Expected 400 for duplicate swap, got {resp.status_code}: {resp.text}"
        print("✓ Duplicate swap request correctly rejected")
    
    def test_05_admin_gets_pending_swap_requests(self):
        """GET /api/swap-requests - Admin sees pending requests"""
        global _created_swap_id
        
        resp = requests.get(f"{BASE_URL}/api/swap-requests", headers=admin_headers())
        assert resp.status_code == 200, f"Failed to get swap requests: {resp.text}"
        
        swaps = resp.json()
        assert isinstance(swaps, list), "Swap requests response should be a list"
        
        # Find our created swap
        found = any(s.get("id") == _created_swap_id for s in swaps)
        assert found, f"Created swap request {_created_swap_id} not found in admin's list"
        print(f"✓ Admin can see pending swap request {_created_swap_id}")
    
    def test_06_staff_gets_own_swap_requests(self):
        """GET /api/swap-requests - Staff sees their own requests"""
        global _created_swap_id
        
        resp = requests.get(f"{BASE_URL}/api/swap-requests", headers=staff_headers())
        assert resp.status_code == 200, f"Failed to get swap requests: {resp.text}"
        
        swaps = resp.json()
        assert isinstance(swaps, list), "Swap requests response should be a list"
        
        # Staff should see their own request
        found = any(s.get("id") == _created_swap_id for s in swaps)
        assert found, f"Staff cannot see their own swap request {_created_swap_id}"
        print(f"✓ Staff can see their own swap request {_created_swap_id}")
    
    def test_07_staff_cannot_approve_swap(self):
        """PUT /api/swap-requests/{id}/approve - Staff cannot approve (admin only)"""
        global _created_swap_id
        assert _created_swap_id, "No swap request created"
        
        resp = requests.put(
            f"{BASE_URL}/api/swap-requests/{_created_swap_id}/approve",
            headers=staff_headers()
        )
        # Should be 403 Forbidden for non-admin
        assert resp.status_code in [401, 403], f"Expected 401/403 for staff approve, got {resp.status_code}"
        print("✓ Staff correctly denied from approving swap requests")
    
    def test_08_admin_approves_swap_request(self):
        """PUT /api/swap-requests/{id}/approve - Admin approves, shift becomes OPEN"""
        global _created_swap_id, _created_shift_id
        assert _created_swap_id, "No swap request created"
        
        resp = requests.put(
            f"{BASE_URL}/api/swap-requests/{_created_swap_id}/approve",
            headers=admin_headers()
        )
        assert resp.status_code == 200, f"Failed to approve swap: {resp.text}"
        
        result = resp.json()
        assert "message" in result, "Approve response missing message"
        print(f"✓ Admin approved swap request: {result.get('message')}")
        
        # Verify shift is now OPEN
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        shifts_resp = requests.get(
            f"{BASE_URL}/api/shifts",
            params={"start_date": tomorrow, "end_date": tomorrow},
            headers=admin_headers()
        )
        assert shifts_resp.status_code == 200
        
        shifts = shifts_resp.json()
        shift = next((s for s in shifts if s.get("id") == _created_shift_id), None)
        if shift:
            # Shift should have staff_name = "OPEN - Needs Cover" or staff_id = None
            assert shift.get("staff_id") is None or shift.get("staff_name") == "OPEN - Needs Cover", \
                f"Shift not marked as OPEN after approval: {shift}"
            print(f"✓ Shift {_created_shift_id} is now OPEN for reassignment")
    
    def test_09_create_another_shift_for_reject_test(self):
        """Create another shift to test reject flow"""
        global _second_shift_id
        
        # Get staff ID
        staff_resp = requests.get(f"{BASE_URL}/api/restaurant/staff", headers=admin_headers())
        staff_list = staff_resp.json()
        staff_user = next((s for s in staff_list if s.get("username") == "user"), None)
        staff_id = staff_user.get("id")
        
        # Create shift for day after tomorrow
        day_after = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        shift_data = {
            "staff_id": staff_id,
            "date": day_after,
            "start_time": "10:00",
            "end_time": "18:00",
            "position": "Cashier",
            "note": "TEST_swap_reject_shift"
        }
        
        resp = requests.post(f"{BASE_URL}/api/shifts", json=shift_data, headers=admin_headers())
        assert resp.status_code in [200, 201], f"Failed to create shift: {resp.text}"
        
        shift = resp.json()
        _second_shift_id = shift["id"]
        print(f"✓ Created second shift {shift['id']} for reject test")
    
    def test_10_staff_creates_second_swap_request(self):
        """Staff creates swap request for second shift"""
        global _second_shift_id, _second_swap_id
        assert _second_shift_id, "No second shift created"
        
        swap_data = {
            "shift_id": _second_shift_id,
            "reason": "Family emergency"
        }
        
        resp = requests.post(f"{BASE_URL}/api/swap-requests", json=swap_data, headers=staff_headers())
        assert resp.status_code in [200, 201], f"Failed to create swap request: {resp.text}"
        
        swap = resp.json()
        _second_swap_id = swap["id"]
        print(f"✓ Created second swap request {swap['id']}")
    
    def test_11_admin_rejects_swap_request(self):
        """PUT /api/swap-requests/{id}/reject - Admin rejects request"""
        global _second_swap_id
        assert _second_swap_id, "No swap request created"
        
        resp = requests.put(
            f"{BASE_URL}/api/swap-requests/{_second_swap_id}/reject",
            headers=admin_headers()
        )
        assert resp.status_code == 200, f"Failed to reject swap: {resp.text}"
        
        result = resp.json()
        assert "message" in result, "Reject response missing message"
        print(f"✓ Admin rejected swap request: {result.get('message')}")
    
    def test_12_rejected_swap_not_in_pending_list(self):
        """GET /api/swap-requests - Rejected swap should not appear in admin's pending list"""
        global _second_swap_id
        
        resp = requests.get(f"{BASE_URL}/api/swap-requests", headers=admin_headers())
        assert resp.status_code == 200
        
        swaps = resp.json()
        # Admin only sees pending, so rejected should not be there
        found = any(s.get("id") == _second_swap_id and s.get("status") == "pending" for s in swaps)
        assert not found, "Rejected swap should not appear as pending"
        print("✓ Rejected swap correctly removed from pending list")
    
    def test_13_swap_request_without_auth_fails(self):
        """POST /api/swap-requests - Unauthenticated request should fail"""
        swap_data = {"shift_id": "some_shift", "reason": "test"}
        resp = requests.post(f"{BASE_URL}/api/swap-requests", json=swap_data)
        assert resp.status_code in [401, 403], f"Expected 401/403 without auth, got {resp.status_code}"
        print("✓ Unauthenticated swap request correctly rejected")
    
    def test_14_swap_request_for_nonexistent_shift_fails(self):
        """POST /api/swap-requests - Request for non-existent shift should fail"""
        swap_data = {
            "shift_id": "nonexistent_shift_12345",
            "reason": "test"
        }
        resp = requests.post(f"{BASE_URL}/api/swap-requests", json=swap_data, headers=staff_headers())
        assert resp.status_code == 404, f"Expected 404 for nonexistent shift, got {resp.status_code}: {resp.text}"
        print("✓ Swap request for nonexistent shift correctly rejected")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_shifts(self):
        """Delete test shifts created during testing"""
        global _created_shift_id, _second_shift_id
        
        headers = admin_headers()
        
        # Delete specific test shifts
        for shift_id in [_created_shift_id, _second_shift_id]:
            if shift_id:
                resp = requests.delete(f"{BASE_URL}/api/shifts/{shift_id}", headers=headers)
                print(f"Cleanup shift {shift_id}: {resp.status_code}")
        
        print("✓ Cleanup completed")
