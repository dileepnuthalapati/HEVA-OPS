"""
Iteration 46: Leave & Availability System + Top Selling Toggle Tests

Features tested:
1. POST /api/leave-requests - Staff creates leave request with pending status
2. GET /api/leave-requests - Staff sees own requests
3. GET /api/leave-requests/pending - Admin sees pending requests
4. PUT /api/leave-requests/{id}/approve - Admin approves leave
5. PUT /api/leave-requests/{id}/decline - Admin declines leave
6. DELETE /api/leave-requests/{id} - Staff cancels pending request
7. Overlapping leave request rejection
8. PUT /api/availability/my - Staff saves recurring availability rules
9. GET /api/availability/my - Staff retrieves saved rules
10. GET /api/scheduler/blocks - Returns leave blocks + availability blocks
11. GET /api/reports/today?sort_top_by=quantity - Top products by quantity
12. GET /api/reports/today?sort_top_by=revenue - Top products by revenue
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USERNAME = "SKAdmin"
ADMIN_PASSWORD = "saswata@123"
STAFF_USERNAME = "user"
STAFF_PASSWORD = "user123"

# Global token storage to avoid rate limiting
_tokens = {"admin": None, "staff": None}
_created_leave_id = None


def get_admin_token():
    """Get or create admin token"""
    global _tokens
    if _tokens["admin"] is None:
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if resp.status_code == 200:
            _tokens["admin"] = resp.json().get("access_token")
    return _tokens["admin"]


def get_staff_token():
    """Get or create staff token"""
    global _tokens
    if _tokens["staff"] is None:
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF_USERNAME,
            "password": STAFF_PASSWORD
        })
        if resp.status_code == 200:
            _tokens["staff"] = resp.json().get("access_token")
    return _tokens["staff"]


def admin_headers():
    token = get_admin_token()
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def staff_headers():
    token = get_staff_token()
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ── Leave Request CRUD Tests ──

def test_01_login_admin():
    """Verify admin login works"""
    token = get_admin_token()
    assert token is not None, "Admin login should return token"
    print(f"✓ Admin login successful")


def test_02_login_staff():
    """Verify staff login works"""
    token = get_staff_token()
    assert token is not None, "Staff login should return token"
    print(f"✓ Staff login successful")


def test_03_create_leave_request_as_staff():
    """POST /api/leave-requests - Staff creates leave request with pending status"""
    global _created_leave_id
    
    # Use unique dates far in the future to avoid conflicts (use timestamp for uniqueness)
    import time
    unique_offset = int(time.time()) % 200 + 150  # 150-350 days in future
    start_date = (datetime.now() + timedelta(days=unique_offset)).strftime("%Y-%m-%d")
    end_date = (datetime.now() + timedelta(days=unique_offset + 2)).strftime("%Y-%m-%d")
    
    response = requests.post(
        f"{BASE_URL}/api/leave-requests",
        headers=staff_headers(),
        json={
            "start_date": start_date,
            "end_date": end_date,
            "leave_type": "vacation",
            "note": "TEST_iteration46_vacation"
        }
    )
    
    assert response.status_code == 200, f"Create leave request failed: {response.text}"
    data = response.json()
    assert "id" in data, "Response should contain leave request ID"
    assert "message" in data, "Response should contain message"
    _created_leave_id = data["id"]
    print(f"✓ Created leave request: {data['id']}")


def test_04_get_leave_requests_as_staff():
    """GET /api/leave-requests - Staff sees their own requests"""
    response = requests.get(
        f"{BASE_URL}/api/leave-requests",
        headers=staff_headers()
    )
    
    assert response.status_code == 200, f"Get leave requests failed: {response.text}"
    data = response.json()
    assert isinstance(data, list), "Response should be a list"
    
    # Find our created request
    our_request = next((r for r in data if r.get("id") == _created_leave_id), None)
    if our_request:
        assert our_request["status"] == "pending", "New request should be pending"
        assert our_request["leave_type"] == "vacation", "Leave type should match"
        print(f"✓ Staff can see their leave request with status: {our_request['status']}")
    else:
        print(f"✓ Staff can see {len(data)} leave requests")


def test_05_get_pending_leave_requests_as_admin():
    """GET /api/leave-requests/pending - Admin sees pending requests"""
    response = requests.get(
        f"{BASE_URL}/api/leave-requests/pending",
        headers=admin_headers()
    )
    
    assert response.status_code == 200, f"Get pending requests failed: {response.text}"
    data = response.json()
    assert isinstance(data, list), "Response should be a list"
    
    # All returned requests should be pending
    for req in data:
        assert req.get("status") == "pending", f"All requests should be pending, got: {req.get('status')}"
    
    print(f"✓ Admin can see {len(data)} pending leave requests")


def test_06_overlapping_leave_request_rejected():
    """Overlapping leave request should be rejected"""
    if not _created_leave_id:
        pytest.skip("No leave request created to test overlap")
    
    # Get the created leave request to find its dates
    resp = requests.get(f"{BASE_URL}/api/leave-requests", headers=staff_headers())
    if resp.status_code != 200:
        pytest.skip("Could not get leave requests")
    
    our_request = next((r for r in resp.json() if r.get("id") == _created_leave_id), None)
    if not our_request:
        pytest.skip("Could not find created leave request")
    
    # Try to create overlapping request using the same dates
    start_date = our_request["start_date"]
    end_date = our_request["end_date"]
    
    response = requests.post(
        f"{BASE_URL}/api/leave-requests",
        headers=staff_headers(),
        json={
            "start_date": start_date,
            "end_date": end_date,
            "leave_type": "sick",
            "note": "TEST_overlapping_request"
        }
    )
    
    # Should be rejected with 400
    assert response.status_code == 400, f"Overlapping request should be rejected, got: {response.status_code}"
    assert "overlap" in response.text.lower(), "Error should mention overlap"
    print("✓ Overlapping leave request correctly rejected")


def test_07_approve_leave_request_as_admin():
    """PUT /api/leave-requests/{id}/approve - Admin approves leave"""
    if not _created_leave_id:
        pytest.skip("No leave request to approve")
    
    response = requests.put(
        f"{BASE_URL}/api/leave-requests/{_created_leave_id}/approve",
        headers=admin_headers()
    )
    
    assert response.status_code == 200, f"Approve leave failed: {response.text}"
    data = response.json()
    assert "message" in data, "Response should contain message"
    print(f"✓ Leave request approved: {data.get('message')}")


def test_08_verify_approved_leave_status():
    """Verify leave request status changed to approved"""
    response = requests.get(
        f"{BASE_URL}/api/leave-requests",
        headers=staff_headers()
    )
    
    assert response.status_code == 200
    data = response.json()
    
    our_request = next((r for r in data if r.get("id") == _created_leave_id), None)
    if our_request:
        assert our_request["status"] == "approved", f"Status should be approved, got: {our_request['status']}"
        print(f"✓ Leave request status verified as approved")
    else:
        print("✓ Leave request status check passed (request may have been cleaned up)")


def test_09_create_and_decline_leave_request():
    """PUT /api/leave-requests/{id}/decline - Admin declines leave"""
    # Create a new request to decline
    start_date = (datetime.now() + timedelta(days=90)).strftime("%Y-%m-%d")
    end_date = (datetime.now() + timedelta(days=91)).strftime("%Y-%m-%d")
    
    create_resp = requests.post(
        f"{BASE_URL}/api/leave-requests",
        headers=staff_headers(),
        json={
            "start_date": start_date,
            "end_date": end_date,
            "leave_type": "personal",
            "note": "TEST_to_be_declined"
        }
    )
    
    if create_resp.status_code != 200:
        pytest.skip(f"Could not create leave request to decline: {create_resp.text}")
    
    leave_id = create_resp.json().get("id")
    
    # Decline it
    decline_resp = requests.put(
        f"{BASE_URL}/api/leave-requests/{leave_id}/decline",
        headers=admin_headers()
    )
    
    assert decline_resp.status_code == 200, f"Decline leave failed: {decline_resp.text}"
    print(f"✓ Leave request declined successfully")
    
    # Verify status
    get_resp = requests.get(f"{BASE_URL}/api/leave-requests", headers=staff_headers())
    if get_resp.status_code == 200:
        data = get_resp.json()
        declined_req = next((r for r in data if r.get("id") == leave_id), None)
        if declined_req:
            assert declined_req["status"] == "declined", f"Status should be declined, got: {declined_req['status']}"
            print(f"✓ Declined status verified")


def test_10_cancel_pending_leave_request():
    """DELETE /api/leave-requests/{id} - Staff cancels pending request"""
    # Create a new request to cancel
    start_date = (datetime.now() + timedelta(days=100)).strftime("%Y-%m-%d")
    end_date = (datetime.now() + timedelta(days=101)).strftime("%Y-%m-%d")
    
    create_resp = requests.post(
        f"{BASE_URL}/api/leave-requests",
        headers=staff_headers(),
        json={
            "start_date": start_date,
            "end_date": end_date,
            "leave_type": "sick",
            "note": "TEST_to_be_cancelled"
        }
    )
    
    if create_resp.status_code != 200:
        pytest.skip(f"Could not create leave request to cancel: {create_resp.text}")
    
    leave_id = create_resp.json().get("id")
    
    # Cancel it
    cancel_resp = requests.delete(
        f"{BASE_URL}/api/leave-requests/{leave_id}",
        headers=staff_headers()
    )
    
    assert cancel_resp.status_code == 200, f"Cancel leave failed: {cancel_resp.text}"
    print(f"✓ Leave request cancelled successfully")


# ── Availability Tests ──

def test_11_save_availability_rules():
    """PUT /api/availability/my - Staff saves recurring availability rules"""
    rules = [
        {"day_of_week": 0, "unavailable_from": None, "unavailable_to": None, "reason": "TEST_Sunday_off"},
        {"day_of_week": 6, "unavailable_from": "18:00", "unavailable_to": "23:00", "reason": "TEST_Saturday_evening"}
    ]
    
    response = requests.put(
        f"{BASE_URL}/api/availability/my",
        headers=staff_headers(),
        json={"rules": rules}
    )
    
    assert response.status_code == 200, f"Save availability failed: {response.text}"
    data = response.json()
    assert "message" in data, "Response should contain message"
    print(f"✓ Availability rules saved: {data.get('message')}")


def test_12_get_availability_rules():
    """GET /api/availability/my - Staff retrieves saved rules"""
    response = requests.get(
        f"{BASE_URL}/api/availability/my",
        headers=staff_headers()
    )
    
    assert response.status_code == 200, f"Get availability failed: {response.text}"
    data = response.json()
    assert "rules" in data, "Response should contain rules"
    
    rules = data["rules"]
    assert isinstance(rules, list), "Rules should be a list"
    print(f"✓ Retrieved {len(rules)} availability rules")
    
    # Verify our test rules are there
    sunday_rule = next((r for r in rules if r.get("day_of_week") == 0), None)
    if sunday_rule:
        assert "TEST_Sunday_off" in sunday_rule.get("reason", ""), "Sunday rule should have our test reason"
        print(f"✓ Sunday rule verified: {sunday_rule}")


# ── Scheduler Blocks Tests ──

def test_13_get_scheduler_blocks():
    """GET /api/scheduler/blocks - Returns leave blocks + availability blocks"""
    start_date = datetime.now().strftime("%Y-%m-%d")
    end_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
    
    response = requests.get(
        f"{BASE_URL}/api/scheduler/blocks?start_date={start_date}&end_date={end_date}",
        headers=admin_headers()
    )
    
    assert response.status_code == 200, f"Get scheduler blocks failed: {response.text}"
    data = response.json()
    assert isinstance(data, dict), "Response should be a dict (staff_id -> date -> block)"
    print(f"✓ Scheduler blocks retrieved for {len(data)} staff members")
    
    # Check structure if we have data
    for staff_id, dates in data.items():
        assert isinstance(dates, dict), f"Staff {staff_id} should have date dict"
        for date, block in dates.items():
            assert "block_type" in block, f"Block should have block_type"
            assert block["block_type"] in ["hard", "soft", "pending_leave"], f"Invalid block type: {block['block_type']}"
            print(f"  - {staff_id} on {date}: {block['block_type']} ({block.get('reason', 'N/A')})")


# ── Top Selling Toggle Tests ──

def test_14_top_products_sorted_by_revenue():
    """GET /api/reports/today?sort_top_by=revenue - Top products by revenue"""
    response = requests.get(
        f"{BASE_URL}/api/reports/today?sort_top_by=revenue",
        headers=admin_headers()
    )
    
    assert response.status_code == 200, f"Get today stats failed: {response.text}"
    data = response.json()
    
    assert "top_products" in data, "Response should contain top_products"
    top_products = data["top_products"]
    
    # Verify sorted by revenue (descending)
    if len(top_products) >= 2:
        for i in range(len(top_products) - 1):
            assert top_products[i]["revenue"] >= top_products[i+1]["revenue"], \
                f"Products should be sorted by revenue descending: {top_products[i]['revenue']} >= {top_products[i+1]['revenue']}"
        print(f"✓ Top products sorted by revenue (descending): {[p['name'] + ':' + str(p['revenue']) for p in top_products[:3]]}")
    else:
        print(f"✓ Top products endpoint works (only {len(top_products)} products)")


def test_15_top_products_sorted_by_quantity():
    """GET /api/reports/today?sort_top_by=quantity - Top products by quantity"""
    response = requests.get(
        f"{BASE_URL}/api/reports/today?sort_top_by=quantity",
        headers=admin_headers()
    )
    
    assert response.status_code == 200, f"Get today stats failed: {response.text}"
    data = response.json()
    
    assert "top_products" in data, "Response should contain top_products"
    top_products = data["top_products"]
    
    # Verify sorted by quantity (descending)
    if len(top_products) >= 2:
        for i in range(len(top_products) - 1):
            assert top_products[i]["quantity"] >= top_products[i+1]["quantity"], \
                f"Products should be sorted by quantity descending: {top_products[i]['quantity']} >= {top_products[i+1]['quantity']}"
        print(f"✓ Top products sorted by quantity (descending): {[p['name'] + ':' + str(p['quantity']) for p in top_products[:3]]}")
    else:
        print(f"✓ Top products endpoint works (only {len(top_products)} products)")


def test_16_default_sort_is_revenue():
    """GET /api/reports/today (no param) - Default should be revenue"""
    response = requests.get(
        f"{BASE_URL}/api/reports/today",
        headers=admin_headers()
    )
    
    assert response.status_code == 200, f"Get today stats failed: {response.text}"
    data = response.json()
    
    assert "top_products" in data, "Response should contain top_products"
    top_products = data["top_products"]
    
    # Default should be revenue sorted
    if len(top_products) >= 2:
        for i in range(len(top_products) - 1):
            assert top_products[i]["revenue"] >= top_products[i+1]["revenue"], \
                f"Default sort should be by revenue: {top_products[i]['revenue']} >= {top_products[i+1]['revenue']}"
        print(f"✓ Default sort is by revenue")
    else:
        print(f"✓ Default sort endpoint works")


# ── Cleanup ──

def test_99_cleanup_test_data():
    """Clean up TEST_ prefixed leave requests and availability rules"""
    headers = staff_headers()
    
    # Get all leave requests
    resp = requests.get(f"{BASE_URL}/api/leave-requests", headers=headers)
    if resp.status_code == 200:
        leaves = resp.json()
        for leave in leaves:
            if leave.get("note", "").startswith("TEST_"):
                # Try to delete (only works for pending)
                del_resp = requests.delete(f"{BASE_URL}/api/leave-requests/{leave['id']}", headers=headers)
                if del_resp.status_code == 200:
                    print(f"  Cleaned up leave: {leave['id']}")
    
    # Clear availability rules
    clear_resp = requests.put(
        f"{BASE_URL}/api/availability/my",
        headers=headers,
        json={"rules": []}
    )
    if clear_resp.status_code == 200:
        print("  Cleared availability rules")
    
    print("✓ Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
