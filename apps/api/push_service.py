import os
import logging
from typing import Optional
from firebase_admin import credentials, initialize_app, messaging

logger = logging.getLogger("push_service")

_app_initialized = False

def _init_fcm():
    global _app_initialized
    if _app_initialized:
        return

    private_key = os.getenv("FCM_PRIVATE_KEY", "")
    client_email = os.getenv("FCM_CLIENT_EMAIL", "")
    project_id = os.getenv("FCM_PROJECT_ID", "digitalport-d23f0")

    if not private_key or not client_email:
        logger.warning("FCM credentials not configured - push notifications disabled")
        return

    cred = credentials.Certificate({
        "type": "service_account",
        "project_id": project_id,
        "private_key_id": os.getenv("FCM_PRIVATE_KEY_ID", ""),
        "private_key": private_key.replace("\\n", "\n"),
        "client_email": client_email,
        "client_id": os.getenv("FCM_CLIENT_ID", ""),
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{client_email.replace('@', '%40')}",
        "universe_domain": "googleapis.com",
    })

    initialize_app(cred)
    _app_initialized = True
    logger.info("Firebase Admin initialized")


def _full_url(path: str) -> str:
    """Resolve a relative path to a full HTTPS URL."""
    if path.startswith("https://") or path.startswith("http://"):
        return path
    base = os.getenv("APP_BASE_URL", "https://budget.digitalport.my").rstrip("/")
    return f"{base}{path}"


def send_push(token: str, title: str, body: str, link: str = "/", tag: str = "new-order") -> Optional[str]:
    """Send a push notification to a single FCM token."""
    _init_fcm()
    if not _app_initialized:
        return None

    full_link = _full_url(link)

    try:
        message = messaging.Message(
            token=token,
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data={
                "title": title,
                "body": body,
                "link": full_link,
                "type": tag,
                "tag": tag,
            },
            webpush=messaging.WebpushConfig(
                fcm_options=messaging.WebpushFCMOptions(link=full_link),
            ),
        )

        result = messaging.send(message)
        return result
    except messaging.UnregisteredError:
        logger.info(f"Token unregistered: {token[:20]}...")
        return "unregistered"
    except Exception as e:
        logger.error(f"FCM send error: {e}")
        return None


async def send_push_to_user(db, user_id: str, title: str, body: str, link: str = "/", tag: str = "new-order") -> int:
    """Send push to all active tokens for a user. Returns count sent."""
    from sqlalchemy import select
    from models import UserPushToken

    result = await db.execute(
        select(UserPushToken).where(
            UserPushToken.user_id == user_id,
            UserPushToken.is_active == True,
        )
    )
    tokens = result.scalars().all()

    sent = 0
    unregistered = []

    for pt in tokens:
        msg_id = send_push(pt.token, title, body, link, tag)
        if msg_id == "unregistered":
            unregistered.append(pt.id)
        elif msg_id:
            sent += 1

    if unregistered:
        from sqlalchemy import update
        await db.execute(
            update(UserPushToken)
            .where(UserPushToken.id.in_(unregistered))
            .values(is_active=False)
        )
        await db.commit()

    return sent
