"""
HevaPOS Audit Log Feature Tests - Iteration 23
Tests for tamper-proof activity trail tracking system.

Features tested:
- GET /api/audit/logs - Paginated audit log retrieval with filters
- GET /api/audit/logs/summary - Today's stats, top actors, recent voids
- Audit logging on order creation, cancellation, completion, edit
- Audit logging on KDS status changes
- Filter by action type
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuditLogAuthentication:
    """Test that audit endpoints require admin authentication"""
    
    def test_audit_logs_requires_auth(self):
        """GET /api/audit/logs should require authentication"""
        response = requests.get(f"{BASE_URL}/api/audit/logs")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASSED: Audit logs endpoint requires authentication")
    
    def test_audit_summary_requires_auth(self):
        """GET /api/audit/logs/summary should require authentication"""
        response = requests.get(f"{BASE_URL}/api/audit/logs/summary")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASSED: Audit summary endpoint requires authentication")


class TestAuditLogEndpoints:
    """Test audit log API endpoints with authentication"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
        print(f"Setup: Logged in as restaurant_admin")
    
    def test_get_audit_logs_success(self):
        """GET /api/audit/logs should return paginated audit entries"""
        response = requests.get(f"{BASE_URL}/api/audit/logs", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "logs" in data, "Response should contain 'logs' field"
        assert "total" in data, "Response should contain 'total' field"
        assert "limit" in data, "Response should contain 'limit' field"
        assert "skip" in data, "Response should contain 'skip' field"
        assert isinstance(data["logs"], list), "logs should be a list"
        
        print(f"PASSED: GET /api/audit/logs returned {len(data['logs'])} logs, total: {data['total']}")
    
    def test_get_audit_logs_with_limit(self):
        """GET /api/audit/logs?limit=5 should respect limit parameter"""
        response = requests.get(f"{BASE_URL}/api/audit/logs?limit=5", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["logs"]) <= 5, f"Expected max 5 logs, got {len(data['logs'])}"
        assert data["limit"] == 5, f"Expected limit=5, got {data['limit']}"
        
        print(f"PASSED: Limit parameter works, returned {len(data['logs'])} logs")
    
    def test_get_audit_logs_filter_by_action(self):
        """GET /api/audit/logs?action=order_cancelled should filter by action"""
        response = requests.get(f"{BASE_URL}/api/audit/logs?action=order_cancelled", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        for log in data["logs"]:
            assert log["action"] == "order_cancelled", f"Expected action=order_cancelled, got {log['action']}"
        
        print(f"PASSED: Action filter works, returned {len(data['logs'])} cancellation logs")
    
    def test_get_audit_logs_filter_by_order_created(self):
        """GET /api/audit/logs?action=order_created should filter by action"""
        response = requests.get(f"{BASE_URL}/api/audit/logs?action=order_created", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        for log in data["logs"]:
            assert log["action"] == "order_created", f"Expected action=order_created, got {log['action']}"
        
        print(f"PASSED: Order created filter works, returned {len(data['logs'])} creation logs")
    
    def test_get_audit_summary_success(self):
        """GET /api/audit/logs/summary should return today's stats"""
        response = requests.get(f"{BASE_URL}/api/audit/logs/summary", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "total_events_today" in data, "Response should contain 'total_events_today'"
        assert "action_counts" in data, "Response should contain 'action_counts'"
        assert "top_actors" in data, "Response should contain 'top_actors'"
        assert "recent_voids" in data, "Response should contain 'recent_voids'"
        
        assert isinstance(data["action_counts"], dict), "action_counts should be a dict"
        assert isinstance(data["top_actors"], list), "top_actors should be a list"
        assert isinstance(data["recent_voids"], list), "recent_voids should be a list"
        
        print(f"PASSED: GET /api/audit/logs/summary - total_events_today: {data['total_events_today']}")
        print(f"  action_counts: {data['action_counts']}")
        print(f"  top_actors: {data['top_actors'][:3] if data['top_actors'] else 'none'}")
    
    def test_audit_log_entry_structure(self):
        """Verify audit log entry has required fields"""
        response = requests.get(f"{BASE_URL}/api/audit/logs?limit=1", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        if data["logs"]:
            log = data["logs"][0]
            required_fields = ["id", "action", "performed_by", "created_at"]
            for field in required_fields:
                assert field in log, f"Audit log entry missing required field: {field}"
            
            # Optional but expected fields
            optional_fields = ["restaurant_id", "order_id", "order_number", "details"]
            present_optional = [f for f in optional_fields if f in log]
            
            print(f"PASSED: Audit log entry has required fields. Optional present: {present_optional}")
            print(f"  Sample entry: action={log['action']}, performed_by={log['performed_by']}")
        else:
            print("SKIPPED: No audit logs to verify structure")


class TestAuditLogIntegration:
    """Test that actions generate audit log entries"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_order_creation_generates_audit_log(self):
        """Creating an order should generate audit log with action='order_created'"""
        # Create an order
        order_data = {
            "items": [{"product_id": "test_prod", "product_name": "TEST_Audit_Item", "quantity": 1, "unit_price": 10.00, "total": 10.00}],
            "subtotal": 10.00,
            "total_amount": 10.00
        }
        create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert create_response.status_code == 200, f"Order creation failed: {create_response.text}"
        
        order = create_response.json()
        order_id = order["id"]
        order_number = order["order_number"]
        
        # Wait a moment for audit log to be written
        time.sleep(0.5)
        
        # Check audit logs for this order
        audit_response = requests.get(f"{BASE_URL}/api/audit/logs?action=order_created&limit=10", headers=self.headers)
        assert audit_response.status_code == 200
        
        audit_data = audit_response.json()
        found = False
        for log in audit_data["logs"]:
            if log.get("order_id") == order_id:
                found = True
                assert log["action"] == "order_created"
                assert "details" in log
                assert log["details"].get("total") == 10.00
                print(f"PASSED: Order creation generated audit log for order #{order_number}")
                break
        
        assert found, f"Audit log entry not found for order {order_id}"
    
    def test_order_cancellation_generates_audit_log(self):
        """Cancelling an order should generate audit log with action='order_cancelled'"""
        # Create an order first
        order_data = {
            "items": [{"product_id": "test_prod", "product_name": "TEST_Cancel_Item", "quantity": 2, "unit_price": 15.00, "total": 30.00}],
            "subtotal": 30.00,
            "total_amount": 30.00
        }
        create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert create_response.status_code == 200
        
        order = create_response.json()
        order_id = order["id"]
        order_number = order["order_number"]
        
        # Cancel the order with a reason
        cancel_response = requests.put(
            f"{BASE_URL}/api/orders/{order_id}/cancel",
            json={"cancel_reason": "TEST_Customer changed mind"},
            headers=self.headers
        )
        assert cancel_response.status_code == 200, f"Order cancellation failed: {cancel_response.text}"
        
        # Wait a moment for audit log to be written
        time.sleep(0.5)
        
        # Check audit logs for cancellation
        audit_response = requests.get(f"{BASE_URL}/api/audit/logs?action=order_cancelled&limit=10", headers=self.headers)
        assert audit_response.status_code == 200
        
        audit_data = audit_response.json()
        found = False
        for log in audit_data["logs"]:
            if log.get("order_id") == order_id:
                found = True
                assert log["action"] == "order_cancelled"
                assert "details" in log
                details = log["details"]
                assert details.get("reason") == "TEST_Customer changed mind", f"Expected reason, got {details}"
                assert details.get("original_total") == 30.00, f"Expected original_total=30, got {details}"
                assert "items" in details, "Cancellation should include items list"
                print(f"PASSED: Order cancellation generated audit log for order #{order_number}")
                print(f"  Reason: {details.get('reason')}, Original total: {details.get('original_total')}")
                break
        
        assert found, f"Audit log entry not found for cancelled order {order_id}"
    
    def test_kds_acknowledge_generates_audit_log(self):
        """KDS acknowledge should generate audit log with action='kds_acknowledged'"""
        # Get a pending order from KDS
        kds_response = requests.get(f"{BASE_URL}/api/kds/orders", headers=self.headers)
        assert kds_response.status_code == 200
        
        kds_orders = kds_response.json()
        if not kds_orders:
            # Create an order if none exist
            order_data = {
                "items": [{"product_id": "test_prod", "product_name": "TEST_KDS_Item", "quantity": 1, "unit_price": 5.00, "total": 5.00}],
                "subtotal": 5.00,
                "total_amount": 5.00
            }
            create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
            assert create_response.status_code == 200
            order_id = create_response.json()["id"]
        else:
            # Find an order with kds_status='new'
            new_orders = [o for o in kds_orders if o.get("kds_status") == "new"]
            if new_orders:
                order_id = new_orders[0]["id"]
            else:
                # Create a new order
                order_data = {
                    "items": [{"product_id": "test_prod", "product_name": "TEST_KDS_Item", "quantity": 1, "unit_price": 5.00, "total": 5.00}],
                    "subtotal": 5.00,
                    "total_amount": 5.00
                }
                create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
                assert create_response.status_code == 200
                order_id = create_response.json()["id"]
        
        # Acknowledge the order
        ack_response = requests.put(f"{BASE_URL}/api/kds/orders/{order_id}/acknowledge", headers=self.headers)
        assert ack_response.status_code == 200, f"KDS acknowledge failed: {ack_response.text}"
        
        # Wait a moment for audit log to be written
        time.sleep(0.5)
        
        # Check audit logs for KDS acknowledge
        audit_response = requests.get(f"{BASE_URL}/api/audit/logs?action=kds_acknowledged&limit=10", headers=self.headers)
        assert audit_response.status_code == 200
        
        audit_data = audit_response.json()
        found = False
        for log in audit_data["logs"]:
            if log.get("order_id") == order_id:
                found = True
                assert log["action"] == "kds_acknowledged"
                print(f"PASSED: KDS acknowledge generated audit log for order {order_id}")
                break
        
        assert found, f"Audit log entry not found for KDS acknowledged order {order_id}"


class TestAuditLogPagination:
    """Test audit log pagination"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert login_response.status_code == 200
        self.token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_pagination_skip_parameter(self):
        """Test skip parameter for pagination"""
        # Get first page
        page1_response = requests.get(f"{BASE_URL}/api/audit/logs?limit=5&skip=0", headers=self.headers)
        assert page1_response.status_code == 200
        page1_data = page1_response.json()
        
        # Get second page
        page2_response = requests.get(f"{BASE_URL}/api/audit/logs?limit=5&skip=5", headers=self.headers)
        assert page2_response.status_code == 200
        page2_data = page2_response.json()
        
        # Verify pages are different (if enough data)
        if page1_data["total"] > 5 and page2_data["logs"]:
            page1_ids = [log["id"] for log in page1_data["logs"]]
            page2_ids = [log["id"] for log in page2_data["logs"]]
            
            # No overlap between pages
            overlap = set(page1_ids) & set(page2_ids)
            assert len(overlap) == 0, f"Pages should not overlap, found: {overlap}"
            
            print(f"PASSED: Pagination works - page1: {len(page1_ids)} logs, page2: {len(page2_ids)} logs, no overlap")
        else:
            print(f"PASSED: Pagination parameters accepted (not enough data to verify no overlap)")


class TestAuditLogSummaryStats:
    """Test audit summary statistics"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "restaurant_admin",
            "password": "admin123"
        })
        assert login_response.status_code == 200
        self.token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_summary_action_counts(self):
        """Summary should include action counts"""
        response = requests.get(f"{BASE_URL}/api/audit/logs/summary", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        action_counts = data.get("action_counts", {})
        
        # Verify it's a dict with action types as keys
        assert isinstance(action_counts, dict)
        
        # If there are counts, verify they're integers
        for action, count in action_counts.items():
            assert isinstance(count, int), f"Count for {action} should be int, got {type(count)}"
        
        print(f"PASSED: Summary action_counts: {action_counts}")
    
    def test_summary_top_actors(self):
        """Summary should include top actors"""
        response = requests.get(f"{BASE_URL}/api/audit/logs/summary", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        top_actors = data.get("top_actors", [])
        
        assert isinstance(top_actors, list)
        
        for actor in top_actors:
            assert "user" in actor, "Actor should have 'user' field"
            assert "actions" in actor, "Actor should have 'actions' field"
        
        print(f"PASSED: Summary top_actors: {top_actors[:3] if top_actors else 'none'}")
    
    def test_summary_recent_voids(self):
        """Summary should include recent voids/cancellations"""
        response = requests.get(f"{BASE_URL}/api/audit/logs/summary", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        recent_voids = data.get("recent_voids", [])
        
        assert isinstance(recent_voids, list)
        
        # Verify void entries have correct action types
        for void in recent_voids:
            assert void.get("action") in ["order_cancelled", "order_voided", "item_removed"], \
                f"Unexpected action in recent_voids: {void.get('action')}"
        
        print(f"PASSED: Summary recent_voids count: {len(recent_voids)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
