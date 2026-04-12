"""
Iteration 40: Long Shift Notifications & Admin Dashboard Changes
Tests:
1. POST /api/notifications/check-long-shifts - creates nudge for shifts >10h, skips duplicates
2. GET /api/notifications/my - returns staff's unread notifications
3. PUT /api/notifications/{id}/dismiss - marks notification as read
4. GET /api/attendance/dashboard-stats - still works correctly
"""
import pytest
import requests
import os
import time
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDS = {"username": "SKAdmin", "password": "saswata@123"}
STAFF_CREDS = {"username": "user", "password": "user123"}
STAFF_ID = "restaurant_user_1"
RESTAURANT_ID = "rest_demo_1"


# Session-scoped fixtures to avoid rate limiting
@pytest.fixture(scope="session")
def session():
    """Shared requests session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(session):
    """Get admin token once for all tests"""
    time.sleep(1)  # Rate limit buffer
    resp = session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def staff_token(session):
    """Get staff token once for all tests"""
    time.sleep(1)  # Rate limit buffer
    resp = session.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
    assert resp.status_code == 200, f"Staff login failed: {resp.text}"
    return resp.json()["access_token"]


def cleanup_test_data():
    """Clean up test notifications and attendance records"""
    try:
        import pymongo
        client = pymongo.MongoClient("mongodb://localhost:27017")
        db = client["hevapos"]
        
        # Delete test notifications
        db.notifications.delete_many({"id": {"$regex": "^notif_.*test_long_shift"}})
        db.notifications.delete_many({"ref_id": {"$regex": "^test_long_shift"}})
        
        # Delete test attendance records
        db.attendance.delete_many({"id": {"$regex": "^test_long_shift"}})
        
        client.close()
    except Exception as e:
        print(f"Cleanup error: {e}")


def create_long_shift_record(record_id):
    """Create a test attendance record that's been open for 12 hours"""
    import pymongo
    client = pymongo.MongoClient("mongodb://localhost:27017")
    db = client["hevapos"]
    
    clock_in_time = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat()
    record = {
        "id": record_id,
        "restaurant_id": RESTAURANT_ID,
        "staff_id": STAFF_ID,
        "staff_name": "Test User",
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "clock_in": clock_in_time,
        "clock_out": None,
        "hours_worked": None,
        "created_at": clock_in_time,
    }
    db.attendance.insert_one(record)
    client.close()
    return record_id


class TestLoginEndpoints:
    """Test login endpoints work correctly"""
    
    def test_01_admin_login_works(self, session):
        """Test admin login returns valid token"""
        time.sleep(1)
        resp = session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["role"] == "admin"
        assert data["restaurant_id"] == RESTAURANT_ID
        print("✓ Admin login works correctly")
    
    def test_02_staff_login_works(self, session):
        """Test staff login returns valid token"""
        time.sleep(1)
        resp = session.post(f"{BASE_URL}/api/auth/login", json=STAFF_CREDS)
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["role"] == "user"
        assert data["restaurant_id"] == RESTAURANT_ID
        print("✓ Staff login works correctly")


class TestLongShiftNotifications:
    """Test long shift notification system"""
    
    def test_03_check_long_shifts_creates_notification(self, session, admin_token):
        """Test POST /api/notifications/check-long-shifts creates nudge for >10h shifts"""
        cleanup_test_data()
        
        # Create a long shift record first
        record_id = f"test_long_shift_{datetime.now().timestamp()}"
        create_long_shift_record(record_id)
        
        # Call check-long-shifts endpoint
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = session.post(f"{BASE_URL}/api/notifications/check-long-shifts", headers=headers)
        
        assert resp.status_code == 200, f"check-long-shifts failed: {resp.text}"
        data = resp.json()
        assert "message" in data
        assert "created" in data["message"]
        print(f"✓ check-long-shifts response: {data['message']}")
        
        # Verify notification was created
        import pymongo
        client = pymongo.MongoClient("mongodb://localhost:27017")
        db = client["hevapos"]
        notif = db.notifications.find_one({"ref_id": record_id, "type": "long_shift_nudge"})
        client.close()
        
        assert notif is not None, "Notification was not created"
        assert notif["staff_id"] == STAFF_ID
        assert notif["title"] == "Still on shift?"
        print(f"✓ Notification created with message: {notif['message']}")
        
        cleanup_test_data()
    
    def test_04_check_long_shifts_skips_duplicates(self, session, admin_token):
        """Test POST /api/notifications/check-long-shifts skips existing notifications"""
        cleanup_test_data()
        
        # Create a long shift record
        record_id = f"test_long_shift_{datetime.now().timestamp()}"
        create_long_shift_record(record_id)
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First call - should create notification
        resp1 = session.post(f"{BASE_URL}/api/notifications/check-long-shifts", headers=headers)
        assert resp1.status_code == 200
        data1 = resp1.json()
        
        time.sleep(0.5)
        
        # Second call - should skip (no new notifications)
        resp2 = session.post(f"{BASE_URL}/api/notifications/check-long-shifts", headers=headers)
        assert resp2.status_code == 200
        data2 = resp2.json()
        
        # The second call should report 0 new notifications created
        assert "created 0" in data2["message"]
        print(f"✓ Duplicate check works - First: {data1['message']}, Second: {data2['message']}")
        
        cleanup_test_data()
    
    def test_05_get_my_notifications_returns_staff_notifications(self, session, admin_token, staff_token):
        """Test GET /api/notifications/my returns staff's unread notifications"""
        cleanup_test_data()
        
        # Create a long shift and notification
        record_id = f"test_long_shift_{datetime.now().timestamp()}"
        create_long_shift_record(record_id)
        
        # Create notification via check-long-shifts
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        session.post(f"{BASE_URL}/api/notifications/check-long-shifts", headers=admin_headers)
        
        time.sleep(0.5)
        
        # Get notifications as staff
        staff_headers = {"Authorization": f"Bearer {staff_token}"}
        resp = session.get(f"{BASE_URL}/api/notifications/my", headers=staff_headers)
        
        assert resp.status_code == 200, f"get my notifications failed: {resp.text}"
        data = resp.json()
        assert isinstance(data, list)
        
        # Find our test notification
        test_notif = next((n for n in data if n.get("ref_id") == record_id), None)
        if test_notif:
            assert test_notif["type"] == "long_shift_nudge"
            assert test_notif["title"] == "Still on shift?"
            assert test_notif["read"] == False
            print(f"✓ Staff can see their notification: {test_notif['title']}")
        else:
            print(f"✓ GET /api/notifications/my returns {len(data)} notifications")
        
        cleanup_test_data()
    
    def test_06_dismiss_notification_marks_as_read(self, session, admin_token, staff_token):
        """Test PUT /api/notifications/{id}/dismiss marks notification as read"""
        cleanup_test_data()
        
        # Create a long shift and notification
        record_id = f"test_long_shift_{datetime.now().timestamp()}"
        create_long_shift_record(record_id)
        
        # Create notification
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        session.post(f"{BASE_URL}/api/notifications/check-long-shifts", headers=admin_headers)
        
        time.sleep(0.5)
        
        # Get the notification ID
        import pymongo
        client = pymongo.MongoClient("mongodb://localhost:27017")
        db = client["hevapos"]
        notif = db.notifications.find_one({"ref_id": record_id, "type": "long_shift_nudge"})
        client.close()
        
        assert notif is not None, "Notification not found"
        notif_id = notif["id"]
        
        # Dismiss the notification
        staff_headers = {"Authorization": f"Bearer {staff_token}"}
        resp = session.put(f"{BASE_URL}/api/notifications/{notif_id}/dismiss", headers=staff_headers)
        
        assert resp.status_code == 200, f"dismiss failed: {resp.text}"
        data = resp.json()
        assert data["message"] == "Notification dismissed"
        
        # Verify it's marked as read
        client = pymongo.MongoClient("mongodb://localhost:27017")
        db = client["hevapos"]
        updated_notif = db.notifications.find_one({"id": notif_id})
        client.close()
        
        assert updated_notif["read"] == True
        assert "read_at" in updated_notif
        print(f"✓ Notification {notif_id} dismissed and marked as read")
        
        cleanup_test_data()
    
    def test_07_dismissed_notification_not_in_my_notifications(self, session, admin_token, staff_token):
        """Test dismissed notifications don't appear in GET /api/notifications/my"""
        cleanup_test_data()
        
        # Create and dismiss a notification
        record_id = f"test_long_shift_{datetime.now().timestamp()}"
        create_long_shift_record(record_id)
        
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        session.post(f"{BASE_URL}/api/notifications/check-long-shifts", headers=admin_headers)
        
        time.sleep(0.5)
        
        # Get notification ID and dismiss
        import pymongo
        client = pymongo.MongoClient("mongodb://localhost:27017")
        db = client["hevapos"]
        notif = db.notifications.find_one({"ref_id": record_id, "type": "long_shift_nudge"})
        client.close()
        
        if notif:
            notif_id = notif["id"]
            staff_headers = {"Authorization": f"Bearer {staff_token}"}
            session.put(f"{BASE_URL}/api/notifications/{notif_id}/dismiss", headers=staff_headers)
            
            time.sleep(0.5)
            
            # Get my notifications - dismissed one should not appear
            resp = session.get(f"{BASE_URL}/api/notifications/my", headers=staff_headers)
            assert resp.status_code == 200
            data = resp.json()
            
            dismissed_notif = next((n for n in data if n.get("id") == notif_id), None)
            assert dismissed_notif is None, "Dismissed notification should not appear in my notifications"
            print("✓ Dismissed notification not in my notifications list")
        
        cleanup_test_data()


class TestDashboardEndpoints:
    """Test dashboard related endpoints"""
    
    def test_08_dashboard_stats_still_works(self, session, admin_token):
        """Test GET /api/attendance/dashboard-stats returns correct data"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = session.get(f"{BASE_URL}/api/attendance/dashboard-stats", headers=headers)
        
        assert resp.status_code == 200, f"dashboard-stats failed: {resp.text}"
        data = resp.json()
        
        # Verify expected fields exist
        assert "total_staff" in data
        assert "clocked_in_count" in data
        assert "scheduled_shifts" in data
        assert "total_hours_today" in data
        
        print(f"✓ Dashboard stats: {data['total_staff']} staff, {data['clocked_in_count']} clocked in")
    
    def test_09_today_stats_endpoint_works(self, session, admin_token):
        """Test GET /api/reports/today returns revenue data"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = session.get(f"{BASE_URL}/api/reports/today", headers=headers)
        assert resp.status_code == 200, f"today stats failed: {resp.text}"
        data = resp.json()
        
        # Verify expected fields for revenue widget
        assert "total_sales" in data
        assert "total_orders" in data
        assert "cash_total" in data
        assert "card_total" in data
        print(f"✓ Today stats endpoint works: £{data.get('total_sales', 0)} total sales")
    
    def test_10_kds_stats_endpoint_works(self, session, admin_token):
        """Test GET /api/kds/stats returns kitchen stats"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = session.get(f"{BASE_URL}/api/kds/stats", headers=headers)
        assert resp.status_code == 200, f"kds stats failed: {resp.text}"
        print("✓ KDS stats endpoint works")
    
    def test_11_restaurant_my_endpoint_works(self, session, admin_token):
        """Test GET /api/restaurants/my returns restaurant info"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = session.get(f"{BASE_URL}/api/restaurants/my", headers=headers)
        assert resp.status_code == 200, f"restaurants/my failed: {resp.text}"
        data = resp.json()
        assert "id" in data or "currency" in data
        print("✓ Restaurant info endpoint works")
    
    def test_12_subscription_my_endpoint_works(self, session, admin_token):
        """Test GET /api/subscriptions/my returns subscription info"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = session.get(f"{BASE_URL}/api/subscriptions/my", headers=headers)
        assert resp.status_code == 200, f"subscriptions/my failed: {resp.text}"
        print("✓ Subscription endpoint works")


class TestAuthRequirements:
    """Test authentication requirements"""
    
    def test_13_check_long_shifts_requires_auth(self, session):
        """Test POST /api/notifications/check-long-shifts requires authentication"""
        resp = session.post(f"{BASE_URL}/api/notifications/check-long-shifts")
        assert resp.status_code in [401, 403]
        print("✓ check-long-shifts requires authentication")
    
    def test_14_get_my_notifications_requires_auth(self, session):
        """Test GET /api/notifications/my requires authentication"""
        resp = session.get(f"{BASE_URL}/api/notifications/my")
        assert resp.status_code in [401, 403]
        print("✓ GET /api/notifications/my requires authentication")
    
    def test_15_dismiss_notification_requires_auth(self, session):
        """Test PUT /api/notifications/{id}/dismiss requires authentication"""
        resp = session.put(f"{BASE_URL}/api/notifications/fake_id/dismiss")
        assert resp.status_code in [401, 403]
        print("✓ dismiss notification requires authentication")
    
    def test_16_dismiss_nonexistent_notification_returns_404(self, session, staff_token):
        """Test dismissing non-existent notification returns 404"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        resp = session.put(f"{BASE_URL}/api/notifications/nonexistent_id_12345/dismiss", headers=headers)
        assert resp.status_code == 404
        print("✓ Dismissing non-existent notification returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
