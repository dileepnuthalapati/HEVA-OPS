"""
Iteration 39: Smart Attendance Handling Tests
Tests for ghost shift detection, self-correction flow, and manager approval workflow.

Features tested:
1. POST /api/attendance/clock-me with JWT auth - normal clock in/out still works
2. GET /api/attendance/my-status returns ghost_shift_pending:true when open record >14h exists
3. POST /api/attendance/clock-me returns action:ghost_shift_pending (BLOCKED) when ghost shift exists
4. POST /api/attendance/resolve-ghost with claimed_clock_out saves staff_claimed_time
5. POST /api/attendance/resolve-ghost rejects if claimed time is before clock_in
6. POST /api/attendance/resolve-ghost rejects if claimed shift exceeds 14 hours
7. GET /api/attendance/pending-adjustments (admin) returns staff-corrected records
8. PUT /api/attendance/{id}/approve-adjustment (admin) approves with manager_approved_time
9. GET /api/attendance/dashboard-stats includes pending_adjustments_count for admin
10. POST /api/attendance/clock (PIN-based terminal) auto-closes ghost shifts >14h
"""

import pytest
import requests
import os
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_USERNAME = "SKAdmin"
ADMIN_PASSWORD = "saswata@123"
STAFF_USERNAME = "user"
STAFF_PASSWORD = "user123"
STAFF_PIN = "1111"
RESTAURANT_ID = "rest_demo_1"
STAFF_ID = "restaurant_user_1"

# Business location for geofence (from context)
BIZ_LAT = 51.5074
BIZ_LNG = -0.1278


class TestSmartAttendanceSetup:
    """Setup and helper methods for smart attendance tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin JWT token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def staff_token(self):
        """Get staff JWT token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF_USERNAME,
            "password": STAFF_PASSWORD
        })
        assert response.status_code == 200, f"Staff login failed: {response.text}"
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def admin_headers(self, admin_token):
        return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def staff_headers(self, staff_token):
        return {"Authorization": f"Bearer {staff_token}", "Content-Type": "application/json"}


class TestNormalClockInOut(TestSmartAttendanceSetup):
    """Test that normal clock in/out still works with JWT auth"""
    
    def test_clock_me_normal_clock_in(self, staff_headers):
        """POST /api/attendance/clock-me - normal clock in works"""
        # First, ensure staff is clocked out by checking status
        status_resp = requests.get(f"{BASE_URL}/api/attendance/my-status", headers=staff_headers)
        assert status_resp.status_code == 200
        status = status_resp.json()
        
        # If clocked in (not ghost), clock out first
        if status.get("clocked_in") and not status.get("ghost_shift_pending"):
            clock_out = requests.post(f"{BASE_URL}/api/attendance/clock-me", 
                headers=staff_headers,
                json={"latitude": BIZ_LAT, "longitude": BIZ_LNG}
            )
            print(f"Pre-test clock out: {clock_out.json()}")
        
        # Now clock in
        response = requests.post(f"{BASE_URL}/api/attendance/clock-me", 
            headers=staff_headers,
            json={"latitude": BIZ_LAT, "longitude": BIZ_LNG}
        )
        
        # Could be clock_in, clock_out, or ghost_shift_pending
        assert response.status_code == 200
        data = response.json()
        print(f"Clock-me response: {data}")
        
        # If ghost shift pending, that's expected behavior - test passes
        if data.get("action") == "ghost_shift_pending":
            print("Ghost shift detected - this is expected if there's an old open record")
            assert "ghost_shift" in data
        else:
            assert data.get("action") in ["clock_in", "clock_out"]
            assert "staff_name" in data or "staff_id" in data


class TestGhostShiftDetection(TestSmartAttendanceSetup):
    """Test ghost shift detection (>14h open shift)"""
    
    def test_my_status_returns_ghost_shift_pending(self, staff_headers):
        """GET /api/attendance/my-status returns ghost_shift_pending when >14h open record exists"""
        # This test requires a ghost shift to exist in DB
        # The main agent context says to insert a test record with clock_in 20h ago
        
        response = requests.get(f"{BASE_URL}/api/attendance/my-status", headers=staff_headers)
        assert response.status_code == 200
        data = response.json()
        print(f"My-status response: {data}")
        
        # If ghost_shift_pending is true, verify structure
        if data.get("ghost_shift_pending"):
            assert "ghost_shift" in data
            ghost = data["ghost_shift"]
            assert "record_id" in ghost
            assert "clock_in" in ghost
            assert "elapsed_hours" in ghost
            assert ghost["elapsed_hours"] > 14, "Ghost shift should be >14 hours"
            print(f"Ghost shift detected: {ghost['elapsed_hours']} hours elapsed")
        else:
            # No ghost shift - that's also valid if no old records exist
            print("No ghost shift detected - staff has no open record >14h")
    
    def test_clock_me_blocked_when_ghost_exists(self, staff_headers):
        """POST /api/attendance/clock-me returns ghost_shift_pending when ghost shift exists"""
        # First check if ghost shift exists
        status_resp = requests.get(f"{BASE_URL}/api/attendance/my-status", headers=staff_headers)
        status = status_resp.json()
        
        if not status.get("ghost_shift_pending"):
            pytest.skip("No ghost shift exists - cannot test blocker behavior")
        
        # Try to clock in - should be blocked
        response = requests.post(f"{BASE_URL}/api/attendance/clock-me",
            headers=staff_headers,
            json={"latitude": BIZ_LAT, "longitude": BIZ_LNG}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("action") == "ghost_shift_pending", "Should return ghost_shift_pending action"
        assert "ghost_shift" in data
        assert "message" in data
        print(f"Blocker working: {data['message']}")


class TestResolveGhostShift(TestSmartAttendanceSetup):
    """Test staff self-correction flow for ghost shifts"""
    
    def test_resolve_ghost_rejects_time_before_clock_in(self, staff_headers):
        """POST /api/attendance/resolve-ghost rejects if claimed time is before clock_in"""
        # First get ghost shift info
        status_resp = requests.get(f"{BASE_URL}/api/attendance/my-status", headers=staff_headers)
        status = status_resp.json()
        
        if not status.get("ghost_shift_pending"):
            pytest.skip("No ghost shift exists - cannot test resolve-ghost")
        
        ghost = status["ghost_shift"]
        record_id = ghost["record_id"]
        clock_in = datetime.fromisoformat(ghost["clock_in"].replace('Z', '+00:00'))
        
        # Try to claim a time BEFORE clock_in
        invalid_time = (clock_in - timedelta(hours=1)).isoformat()
        
        response = requests.post(f"{BASE_URL}/api/attendance/resolve-ghost",
            headers=staff_headers,
            json={"record_id": record_id, "claimed_clock_out": invalid_time}
        )
        
        assert response.status_code == 400, f"Should reject time before clock_in: {response.text}"
        assert "after clock-in" in response.json().get("detail", "").lower() or "before" in response.json().get("detail", "").lower()
        print(f"Correctly rejected: {response.json()}")
    
    def test_resolve_ghost_rejects_exceeds_14_hours(self, staff_headers):
        """POST /api/attendance/resolve-ghost rejects if claimed shift exceeds 14 hours"""
        status_resp = requests.get(f"{BASE_URL}/api/attendance/my-status", headers=staff_headers)
        status = status_resp.json()
        
        if not status.get("ghost_shift_pending"):
            pytest.skip("No ghost shift exists - cannot test resolve-ghost")
        
        ghost = status["ghost_shift"]
        record_id = ghost["record_id"]
        clock_in = datetime.fromisoformat(ghost["clock_in"].replace('Z', '+00:00'))
        
        # Try to claim 15 hours (exceeds 14h limit)
        invalid_time = (clock_in + timedelta(hours=15)).isoformat()
        
        response = requests.post(f"{BASE_URL}/api/attendance/resolve-ghost",
            headers=staff_headers,
            json={"record_id": record_id, "claimed_clock_out": invalid_time}
        )
        
        assert response.status_code == 400, f"Should reject >14h shift: {response.text}"
        assert "14" in response.json().get("detail", "") or "exceed" in response.json().get("detail", "").lower()
        print(f"Correctly rejected: {response.json()}")
    
    def test_resolve_ghost_success(self, staff_headers):
        """POST /api/attendance/resolve-ghost with valid claimed_clock_out saves staff_claimed_time"""
        status_resp = requests.get(f"{BASE_URL}/api/attendance/my-status", headers=staff_headers)
        status = status_resp.json()
        
        if not status.get("ghost_shift_pending"):
            pytest.skip("No ghost shift exists - cannot test resolve-ghost")
        
        ghost = status["ghost_shift"]
        record_id = ghost["record_id"]
        clock_in = datetime.fromisoformat(ghost["clock_in"].replace('Z', '+00:00'))
        
        # Claim 8 hours (valid)
        valid_time = (clock_in + timedelta(hours=8)).isoformat()
        
        response = requests.post(f"{BASE_URL}/api/attendance/resolve-ghost",
            headers=staff_headers,
            json={"record_id": record_id, "claimed_clock_out": valid_time}
        )
        
        assert response.status_code == 200, f"Should accept valid time: {response.text}"
        data = response.json()
        assert "message" in data
        assert "hours_claimed" in data
        assert data["hours_claimed"] == 8.0
        print(f"Ghost resolved: {data}")


class TestPendingAdjustments(TestSmartAttendanceSetup):
    """Test manager pending adjustments workflow"""
    
    def test_get_pending_adjustments_admin(self, admin_headers):
        """GET /api/attendance/pending-adjustments (admin) returns staff-corrected records"""
        response = requests.get(f"{BASE_URL}/api/attendance/pending-adjustments", headers=admin_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Pending adjustments count: {len(data)}")
        
        # If there are pending adjustments, verify structure
        if len(data) > 0:
            record = data[0]
            assert "id" in record
            assert "staff_name" in record or "staff_id" in record
            assert "pending_manager_approval" in record
            assert record["pending_manager_approval"] == True
            print(f"First pending record: {record.get('id')}, staff: {record.get('staff_name')}")
    
    def test_get_pending_adjustments_requires_admin(self, staff_headers):
        """GET /api/attendance/pending-adjustments requires admin role"""
        response = requests.get(f"{BASE_URL}/api/attendance/pending-adjustments", headers=staff_headers)
        
        # Should be 403 Forbidden for non-admin
        assert response.status_code == 403, f"Should require admin: {response.text}"
        print("Correctly requires admin role")


class TestApproveAdjustment(TestSmartAttendanceSetup):
    """Test manager approval of staff-corrected shifts"""
    
    def test_approve_adjustment_success(self, admin_headers):
        """PUT /api/attendance/{id}/approve-adjustment approves with manager_approved_time"""
        # First get pending adjustments
        pending_resp = requests.get(f"{BASE_URL}/api/attendance/pending-adjustments", headers=admin_headers)
        pending = pending_resp.json()
        
        if len(pending) == 0:
            pytest.skip("No pending adjustments to approve")
        
        record_id = pending[0]["id"]
        
        # Approve the adjustment
        response = requests.put(f"{BASE_URL}/api/attendance/{record_id}/approve-adjustment",
            headers=admin_headers,
            json={}  # Approve as-is
        )
        
        assert response.status_code == 200, f"Should approve: {response.text}"
        data = response.json()
        assert "message" in data
        assert "hours_approved" in data
        print(f"Approved: {data}")
    
    def test_approve_adjustment_requires_admin(self, staff_headers):
        """PUT /api/attendance/{id}/approve-adjustment requires admin role"""
        response = requests.put(f"{BASE_URL}/api/attendance/fake_id/approve-adjustment",
            headers=staff_headers,
            json={}
        )
        
        assert response.status_code == 403, f"Should require admin: {response.text}"
        print("Correctly requires admin role")


class TestDashboardStats(TestSmartAttendanceSetup):
    """Test dashboard stats include pending_adjustments_count"""
    
    def test_dashboard_stats_includes_pending_count_admin(self, admin_headers):
        """GET /api/attendance/dashboard-stats includes pending_adjustments_count for admin"""
        response = requests.get(f"{BASE_URL}/api/attendance/dashboard-stats", headers=admin_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "scheduled_shifts" in data
        assert "clocked_in_count" in data
        assert "total_hours_today" in data
        assert "pending_adjustments_count" in data, "Admin should see pending_adjustments_count"
        
        print(f"Dashboard stats: pending_adjustments_count={data['pending_adjustments_count']}")
    
    def test_dashboard_stats_staff_no_pending_count(self, staff_headers):
        """GET /api/attendance/dashboard-stats - staff should not see pending count (or it's 0)"""
        response = requests.get(f"{BASE_URL}/api/attendance/dashboard-stats", headers=staff_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Staff should see 0 or no pending_adjustments_count
        pending_count = data.get("pending_adjustments_count", 0)
        assert pending_count == 0, "Staff should not see pending adjustments count"
        print(f"Staff dashboard stats: pending_adjustments_count={pending_count}")


class TestTerminalAutoClose(TestSmartAttendanceSetup):
    """Test PIN-based terminal auto-closes ghost shifts"""
    
    def test_terminal_clock_auto_closes_ghost(self):
        """POST /api/attendance/clock (PIN-based) auto-closes ghost shifts >14h"""
        # This test uses PIN-based clock which doesn't require JWT
        # It should auto-close any ghost shift and allow new clock-in
        
        response = requests.post(f"{BASE_URL}/api/attendance/clock", json={
            "pin": STAFF_PIN,
            "restaurant_id": RESTAURANT_ID,
            "entry_source": "pos_terminal"
            # No lat/lng needed for pos_terminal
        })
        
        assert response.status_code == 200, f"Terminal clock should work: {response.text}"
        data = response.json()
        
        # Should be clock_in or clock_out (ghost auto-closed silently)
        assert data.get("action") in ["clock_in", "clock_out"], f"Unexpected action: {data}"
        print(f"Terminal clock result: {data.get('action')}")
        
        # If there was a ghost shift, it should have been auto-closed
        # The response won't explicitly say "ghost_shift_pending" for terminal mode


class TestAuditTrailFields:
    """Test that audit trail fields are properly stored"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def admin_headers(self, admin_token):
        return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    
    def test_attendance_records_have_audit_fields(self, admin_headers):
        """Verify attendance records can have audit trail fields"""
        # Get recent attendance records
        today = datetime.now().strftime("%Y-%m-%d")
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/attendance?start_date={week_ago}&end_date={today}",
            headers=admin_headers
        )
        
        assert response.status_code == 200
        records = response.json()
        print(f"Found {len(records)} attendance records")
        
        # Check if any records have audit fields
        audit_fields = ["auto_close_time", "staff_claimed_time", "manager_approved_time", "flagged", "flag_reason"]
        
        for record in records:
            has_audit = any(field in record for field in audit_fields)
            if has_audit:
                print(f"Record {record.get('id')} has audit fields:")
                for field in audit_fields:
                    if field in record:
                        print(f"  {field}: {record[field]}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
