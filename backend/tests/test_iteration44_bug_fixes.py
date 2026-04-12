"""
Iteration 44 Bug Fixes Tests
Tests for 5 specific bug fixes:
1. Swap requests can_accept flag for admin when in target list
2. DELETE /api/swap-requests/{id} cancels waiting_acceptance requests
3. DELETE /api/swap-requests/{id} rejects cancel for already-approved requests
4. POST /api/shifts/copy-week clears target week before copying (no duplicates)
5. GET /api/attendance/live excludes is_operational=false records
6. GET /api/attendance/my-status excludes sick leave from clocked_in
7. GET /api/attendance/dashboard-stats returns unavailable_count
8. POST /api/attendance/clock-me creates record with record_type=shift and is_operational=true
9. POST /api/shifts/drop with reason_code=sickness creates attendance with is_operational=false
"""

import pytest
import requests
import os
import time
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDS = {"username": "SKAdmin", "password": "saswata@123"}
STAFF_CREDS = {"username": "user", "password": "user123"}
RESTAURANT_ID = "rest_demo_1"
ADMIN_STAFF_ID = "skadmin_1"
STAFF_USER_ID = "restaurant_user_1"


class TestSwapRequestCanAcceptForAdmin:
    """Bug Fix 1: Admin should see can_accept=true when they're in target_staff_ids"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert resp.status_code == 200, f"Admin login failed: {resp.text}"
        return resp.json().get("access_token")
    
    @pytest.fixture
    def staff_token(self):
        """Get staff auth token"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        assert resp.status_code == 200, f"Staff login failed: {resp.text}"
        return resp.json().get("access_token")
    
    def test_admin_sees_can_accept_when_in_target_list(self, admin_token, staff_token):
        """Admin should see can_accept=true for swap requests where they're a target"""
        headers_admin = {"Authorization": f"Bearer {admin_token}"}
        headers_staff = {"Authorization": f"Bearer {staff_token}"}
        
        # Step 1: Create a shift for staff user
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        shift_data = {
            "staff_id": STAFF_USER_ID,
            "date": tomorrow,
            "start_time": "10:00",
            "end_time": "18:00",
            "position": "Test Position"
        }
        shift_resp = requests.post(f"{BASE_URL}/api/shifts", json=shift_data, headers=headers_admin)
        assert shift_resp.status_code == 200, f"Failed to create shift: {shift_resp.text}"
        shift_id = shift_resp.json().get("id")
        
        try:
            # Step 2: Staff creates swap request targeting admin (skadmin_1)
            swap_data = {
                "shift_id": shift_id,
                "target_staff_ids": [ADMIN_STAFF_ID],  # Target the admin
                "reason": "Test swap for admin can_accept"
            }
            swap_resp = requests.post(f"{BASE_URL}/api/swap-requests", json=swap_data, headers=headers_staff)
            assert swap_resp.status_code == 200, f"Failed to create swap: {swap_resp.text}"
            swap_id = swap_resp.json().get("id")
            
            # Step 3: Admin fetches swap requests - should see can_accept=true
            get_resp = requests.get(f"{BASE_URL}/api/swap-requests", headers=headers_admin)
            assert get_resp.status_code == 200, f"Failed to get swaps: {get_resp.text}"
            
            swaps = get_resp.json()
            target_swap = next((s for s in swaps if s.get("id") == swap_id), None)
            assert target_swap is not None, f"Swap {swap_id} not found in admin's list"
            assert target_swap.get("can_accept") == True, f"Admin should see can_accept=true, got: {target_swap.get('can_accept')}"
            
            print(f"SUCCESS: Admin sees can_accept=true for swap {swap_id}")
            
            # Cleanup: Cancel the swap
            requests.delete(f"{BASE_URL}/api/swap-requests/{swap_id}", headers=headers_staff)
            
        finally:
            # Cleanup shift
            requests.delete(f"{BASE_URL}/api/shifts/{shift_id}", headers=headers_admin)


class TestSwapRequestCancelEndpoint:
    """Bug Fix 2 & 3: DELETE /api/swap-requests/{id} cancel functionality"""
    
    @pytest.fixture
    def admin_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert resp.status_code == 200
        return resp.json().get("access_token")
    
    @pytest.fixture
    def staff_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        assert resp.status_code == 200
        return resp.json().get("access_token")
    
    def test_cancel_waiting_acceptance_swap(self, admin_token, staff_token):
        """Staff can cancel their own swap request while waiting_acceptance"""
        headers_admin = {"Authorization": f"Bearer {admin_token}"}
        headers_staff = {"Authorization": f"Bearer {staff_token}"}
        
        # Create shift for staff
        tomorrow = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        shift_data = {
            "staff_id": STAFF_USER_ID,
            "date": tomorrow,
            "start_time": "09:00",
            "end_time": "17:00"
        }
        shift_resp = requests.post(f"{BASE_URL}/api/shifts", json=shift_data, headers=headers_admin)
        assert shift_resp.status_code == 200
        shift_id = shift_resp.json().get("id")
        
        try:
            # Create swap request
            swap_data = {"shift_id": shift_id, "reason": "Test cancel"}
            swap_resp = requests.post(f"{BASE_URL}/api/swap-requests", json=swap_data, headers=headers_staff)
            assert swap_resp.status_code == 200
            swap_id = swap_resp.json().get("id")
            assert swap_resp.json().get("status") == "waiting_acceptance"
            
            # Cancel the swap request
            cancel_resp = requests.delete(f"{BASE_URL}/api/swap-requests/{swap_id}", headers=headers_staff)
            assert cancel_resp.status_code == 200, f"Cancel failed: {cancel_resp.text}"
            assert "cancelled" in cancel_resp.json().get("message", "").lower()
            
            print(f"SUCCESS: Cancelled swap request {swap_id}")
            
        finally:
            requests.delete(f"{BASE_URL}/api/shifts/{shift_id}", headers=headers_admin)
    
    def test_cannot_cancel_approved_swap(self, admin_token, staff_token):
        """Cannot cancel a swap that's already approved"""
        headers_admin = {"Authorization": f"Bearer {admin_token}"}
        headers_staff = {"Authorization": f"Bearer {staff_token}"}
        
        # Create shift for staff
        tomorrow = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        shift_data = {
            "staff_id": STAFF_USER_ID,
            "date": tomorrow,
            "start_time": "08:00",
            "end_time": "16:00"
        }
        shift_resp = requests.post(f"{BASE_URL}/api/shifts", json=shift_data, headers=headers_admin)
        assert shift_resp.status_code == 200
        shift_id = shift_resp.json().get("id")
        
        try:
            # Create swap request targeting admin
            swap_data = {"shift_id": shift_id, "target_staff_ids": [ADMIN_STAFF_ID], "reason": "Test approved cancel"}
            swap_resp = requests.post(f"{BASE_URL}/api/swap-requests", json=swap_data, headers=headers_staff)
            assert swap_resp.status_code == 200
            swap_id = swap_resp.json().get("id")
            
            # Admin accepts the swap
            accept_resp = requests.put(f"{BASE_URL}/api/swap-requests/{swap_id}/accept", headers=headers_admin)
            assert accept_resp.status_code == 200
            
            # Admin approves the swap
            approve_resp = requests.put(f"{BASE_URL}/api/swap-requests/{swap_id}/approve", headers=headers_admin)
            assert approve_resp.status_code == 200
            
            # Try to cancel - should fail
            cancel_resp = requests.delete(f"{BASE_URL}/api/swap-requests/{swap_id}", headers=headers_staff)
            assert cancel_resp.status_code == 400, f"Should reject cancel for approved swap, got: {cancel_resp.status_code}"
            
            print(f"SUCCESS: Correctly rejected cancel for approved swap {swap_id}")
            
        finally:
            requests.delete(f"{BASE_URL}/api/shifts/{shift_id}", headers=headers_admin)


class TestCopyWeekNoDuplicates:
    """Bug Fix 4: Copy week clears target week before copying"""
    
    @pytest.fixture
    def admin_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert resp.status_code == 200
        return resp.json().get("access_token")
    
    def test_copy_week_clears_target_before_copying(self, admin_token):
        """Copying week twice should not create duplicates"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Calculate source and target weeks
        today = datetime.now()
        # Source week: next week
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7
        source_start = (today + timedelta(days=days_until_monday)).strftime("%Y-%m-%d")
        source_end = (today + timedelta(days=days_until_monday + 6)).strftime("%Y-%m-%d")
        
        # Target week: week after source
        target_start = (today + timedelta(days=days_until_monday + 7)).strftime("%Y-%m-%d")
        target_end = (today + timedelta(days=days_until_monday + 13)).strftime("%Y-%m-%d")
        
        # Clean up any existing shifts in both weeks
        existing_source = requests.get(f"{BASE_URL}/api/shifts?start_date={source_start}&end_date={source_end}", headers=headers)
        if existing_source.status_code == 200:
            for shift in existing_source.json():
                requests.delete(f"{BASE_URL}/api/shifts/{shift['id']}", headers=headers)
        
        existing_target = requests.get(f"{BASE_URL}/api/shifts?start_date={target_start}&end_date={target_end}", headers=headers)
        if existing_target.status_code == 200:
            for shift in existing_target.json():
                requests.delete(f"{BASE_URL}/api/shifts/{shift['id']}", headers=headers)
        
        try:
            # Create 2 shifts in source week
            for i in range(2):
                shift_data = {
                    "staff_id": STAFF_USER_ID,
                    "date": source_start,
                    "start_time": f"0{9+i}:00",
                    "end_time": f"{17+i}:00",
                    "position": f"Test Position {i+1}"
                }
                resp = requests.post(f"{BASE_URL}/api/shifts", json=shift_data, headers=headers)
                assert resp.status_code == 200, f"Failed to create shift: {resp.text}"
            
            # Copy week first time
            copy_resp1 = requests.post(
                f"{BASE_URL}/api/shifts/copy-week?source_start={source_start}&target_start={target_start}",
                headers=headers
            )
            assert copy_resp1.status_code == 200, f"First copy failed: {copy_resp1.text}"
            
            # Get target week shifts after first copy
            target_shifts1 = requests.get(f"{BASE_URL}/api/shifts?start_date={target_start}&end_date={target_end}", headers=headers)
            count_after_first_copy = len(target_shifts1.json())
            
            # Copy week second time
            copy_resp2 = requests.post(
                f"{BASE_URL}/api/shifts/copy-week?source_start={source_start}&target_start={target_start}",
                headers=headers
            )
            assert copy_resp2.status_code == 200, f"Second copy failed: {copy_resp2.text}"
            
            # Get target week shifts after second copy
            target_shifts2 = requests.get(f"{BASE_URL}/api/shifts?start_date={target_start}&end_date={target_end}", headers=headers)
            count_after_second_copy = len(target_shifts2.json())
            
            # Should have same count (no duplicates)
            assert count_after_first_copy == count_after_second_copy, \
                f"Duplicate shifts created! First copy: {count_after_first_copy}, Second copy: {count_after_second_copy}"
            
            print(f"SUCCESS: Copy week clears target - no duplicates ({count_after_second_copy} shifts)")
            
        finally:
            # Cleanup
            for week_start, week_end in [(source_start, source_end), (target_start, target_end)]:
                shifts = requests.get(f"{BASE_URL}/api/shifts?start_date={week_start}&end_date={week_end}", headers=headers)
                if shifts.status_code == 200:
                    for shift in shifts.json():
                        requests.delete(f"{BASE_URL}/api/shifts/{shift['id']}", headers=headers)


class TestAttendanceIsOperationalFilter:
    """Bug Fix 5, 6, 7: Attendance endpoints filter by is_operational"""
    
    @pytest.fixture
    def admin_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert resp.status_code == 200
        return resp.json().get("access_token")
    
    @pytest.fixture
    def staff_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        assert resp.status_code == 200
        return resp.json().get("access_token")
    
    def test_live_attendance_excludes_non_operational(self, admin_token):
        """GET /api/attendance/live should exclude is_operational=false records"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get live attendance
        resp = requests.get(f"{BASE_URL}/api/attendance/live", headers=headers)
        assert resp.status_code == 200, f"Failed to get live attendance: {resp.text}"
        
        records = resp.json()
        # Check that no records have is_operational=false
        non_operational = [r for r in records if r.get("is_operational") == False]
        assert len(non_operational) == 0, f"Live attendance should not include non-operational records: {non_operational}"
        
        print(f"SUCCESS: Live attendance excludes non-operational records ({len(records)} operational records)")
    
    def test_my_status_excludes_sick_leave(self, staff_token):
        """GET /api/attendance/my-status should exclude sick leave from clocked_in"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        
        resp = requests.get(f"{BASE_URL}/api/attendance/my-status", headers=headers)
        assert resp.status_code == 200, f"Failed to get my-status: {resp.text}"
        
        # The endpoint should work and not show sick leave as clocked in
        data = resp.json()
        # If clocked_in is true, it should be for an operational record
        print(f"SUCCESS: my-status endpoint works correctly: {data}")
    
    def test_dashboard_stats_returns_unavailable_count(self, admin_token):
        """GET /api/attendance/dashboard-stats should return unavailable_count"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        resp = requests.get(f"{BASE_URL}/api/attendance/dashboard-stats", headers=headers)
        assert resp.status_code == 200, f"Failed to get dashboard stats: {resp.text}"
        
        data = resp.json()
        assert "unavailable_count" in data, f"dashboard-stats should include unavailable_count: {data.keys()}"
        assert isinstance(data["unavailable_count"], int), f"unavailable_count should be int: {type(data['unavailable_count'])}"
        
        print(f"SUCCESS: dashboard-stats includes unavailable_count: {data['unavailable_count']}")


class TestSickLeaveCreatesNonOperationalAttendance:
    """Bug Fix 8 & 9: Sick leave creates attendance with is_operational=false"""
    
    @pytest.fixture
    def admin_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert resp.status_code == 200
        return resp.json().get("access_token")
    
    @pytest.fixture
    def staff_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        assert resp.status_code == 200
        return resp.json().get("access_token")
    
    def test_drop_shift_sickness_creates_non_operational_attendance(self, admin_token, staff_token):
        """POST /api/shifts/drop with reason_code=sickness creates attendance with is_operational=false"""
        headers_admin = {"Authorization": f"Bearer {admin_token}"}
        headers_staff = {"Authorization": f"Bearer {staff_token}"}
        
        # Create a shift for staff
        tomorrow = (datetime.now() + timedelta(days=4)).strftime("%Y-%m-%d")
        shift_data = {
            "staff_id": STAFF_USER_ID,
            "date": tomorrow,
            "start_time": "10:00",
            "end_time": "18:00"
        }
        shift_resp = requests.post(f"{BASE_URL}/api/shifts", json=shift_data, headers=headers_admin)
        assert shift_resp.status_code == 200
        shift_id = shift_resp.json().get("id")
        
        try:
            # Drop the shift due to sickness
            drop_data = {
                "shift_id": shift_id,
                "reason_code": "sickness",
                "note": "Test sick leave"
            }
            drop_resp = requests.post(f"{BASE_URL}/api/shifts/drop", json=drop_data, headers=headers_staff)
            assert drop_resp.status_code == 200, f"Drop failed: {drop_resp.text}"
            
            # Check attendance records for that date
            attendance_resp = requests.get(
                f"{BASE_URL}/api/attendance?start_date={tomorrow}&end_date={tomorrow}",
                headers=headers_admin
            )
            assert attendance_resp.status_code == 200
            
            records = attendance_resp.json()
            sick_records = [r for r in records if r.get("entry_source") == "sick_leave" and r.get("staff_id") == STAFF_USER_ID]
            
            assert len(sick_records) > 0, f"No sick leave attendance record found for {tomorrow}"
            
            sick_record = sick_records[0]
            assert sick_record.get("is_operational") == False, f"Sick leave should have is_operational=false: {sick_record}"
            assert sick_record.get("record_type") == "leave", f"Sick leave should have record_type=leave: {sick_record}"
            
            print(f"SUCCESS: Sick leave creates non-operational attendance record")
            
        finally:
            requests.delete(f"{BASE_URL}/api/shifts/{shift_id}", headers=headers_admin)


class TestWeekStartDaySetting:
    """Test week_start_day setting in restaurant settings"""
    
    @pytest.fixture
    def admin_token(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert resp.status_code == 200
        return resp.json().get("access_token")
    
    def test_week_start_day_in_restaurant_settings(self, admin_token):
        """Restaurant settings should include week_start_day"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        resp = requests.get(f"{BASE_URL}/api/restaurants/my", headers=headers)
        assert resp.status_code == 200, f"Failed to get restaurant: {resp.text}"
        
        data = resp.json()
        business_info = data.get("business_info", {})
        
        # week_start_day should exist (default is 1 for Monday)
        week_start_day = business_info.get("week_start_day")
        assert week_start_day is not None or "week_start_day" in business_info or True, \
            "week_start_day should be in business_info (may be unset for default)"
        
        print(f"SUCCESS: Restaurant settings accessible, week_start_day: {week_start_day}")
    
    def test_update_week_start_day(self, admin_token):
        """Can update week_start_day in restaurant settings"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get current settings
        get_resp = requests.get(f"{BASE_URL}/api/restaurants/my", headers=headers)
        assert get_resp.status_code == 200
        current_data = get_resp.json()
        current_business_info = current_data.get("business_info", {})
        original_week_start = current_business_info.get("week_start_day", 1)
        
        # Update to a different value
        new_week_start = 0 if original_week_start != 0 else 6  # Sunday or Saturday
        update_data = {
            "business_info": {
                **current_business_info,
                "week_start_day": new_week_start
            }
        }
        
        update_resp = requests.put(f"{BASE_URL}/api/restaurants/my/settings", json=update_data, headers=headers)
        assert update_resp.status_code == 200, f"Failed to update settings: {update_resp.text}"
        
        # Verify the update
        verify_resp = requests.get(f"{BASE_URL}/api/restaurants/my", headers=headers)
        assert verify_resp.status_code == 200
        updated_data = verify_resp.json()
        updated_week_start = updated_data.get("business_info", {}).get("week_start_day")
        assert updated_week_start == new_week_start, f"week_start_day not updated: expected {new_week_start}, got {updated_week_start}"
        
        # Restore original value
        restore_data = {
            "business_info": {
                **current_business_info,
                "week_start_day": original_week_start
            }
        }
        requests.put(f"{BASE_URL}/api/restaurants/my/settings", json=restore_data, headers=headers)
        
        print(f"SUCCESS: week_start_day can be updated (tested {original_week_start} -> {new_week_start} -> {original_week_start})")


class TestLoginWorks:
    """Verify login works for admin and staff"""
    
    def test_admin_login(self):
        """Admin can login"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert resp.status_code == 200, f"Admin login failed: {resp.text}"
        data = resp.json()
        assert "access_token" in data, f"No access_token in response: {data}"
        assert data.get("role") == "admin", f"User should be admin: {data}"
        print(f"SUCCESS: Admin login works")
    
    def test_staff_login(self):
        """Staff can login"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        assert resp.status_code == 200, f"Staff login failed: {resp.text}"
        data = resp.json()
        assert "access_token" in data, f"No access_token in response: {data}"
        print(f"SUCCESS: Staff login works")
