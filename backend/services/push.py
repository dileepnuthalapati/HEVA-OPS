"""Firebase Cloud Messaging push notification service.
Gracefully handles missing credentials — logs warnings instead of crashing."""
import os
import logging

logger = logging.getLogger(__name__)

_firebase_app = None
_fcm_available = False


def _init_firebase():
    """Initialize Firebase Admin SDK if credentials are available."""
    global _firebase_app, _fcm_available
    creds_path = os.environ.get("FIREBASE_CREDENTIALS_PATH")
    if not creds_path or not os.path.exists(creds_path):
        logger.warning("[Push] FIREBASE_CREDENTIALS_PATH not set or file missing. Push notifications disabled.")
        return

    try:
        import firebase_admin
        from firebase_admin import credentials
        if not firebase_admin._apps:
            cred = credentials.Certificate(creds_path)
            _firebase_app = firebase_admin.initialize_app(cred)
        else:
            _firebase_app = firebase_admin.get_app()
        _fcm_available = True
        logger.info("[Push] Firebase initialized. Push notifications enabled.")
    except Exception as e:
        logger.error(f"[Push] Firebase init failed: {e}")


_init_firebase()


def is_push_available():
    return _fcm_available


def send_push(token: str, title: str, body: str, data: dict = None) -> str:
    """Send a push notification to a single device. Returns message_id or None."""
    if not _fcm_available:
        logger.info(f"[Push] (dry-run) → {title}: {body}")
        return None
    try:
        from firebase_admin import messaging
        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            token=token,
        )
        return messaging.send(message)
    except Exception as e:
        logger.error(f"[Push] Send failed for token {token[:20]}...: {e}")
        return None


def send_push_multi(tokens: list, title: str, body: str, data: dict = None):
    """Send push to multiple devices. Returns (success_count, failure_count, failed_tokens)."""
    if not _fcm_available:
        logger.info(f"[Push] (dry-run multi) → {title}: {body} to {len(tokens)} devices")
        return len(tokens), 0, []
    if not tokens:
        return 0, 0, []
    try:
        from firebase_admin import messaging
        message = messaging.MulticastMessage(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            tokens=tokens,
        )
        resp = messaging.send_each_for_multicast(message)
        failed = [tokens[i] for i, r in enumerate(resp.responses) if not r.success]
        return resp.success_count, resp.failure_count, failed
    except Exception as e:
        logger.error(f"[Push] Multi-send failed: {e}")
        return 0, len(tokens), tokens
