from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.push_subscription import PushSubscription
from app.schemas.push import PushSubscriptionCreate, VapidKeysResponse
import os
import json
from pywebpush import webpush, WebPushException
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/push", tags=["push"])

# Get keys from env
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_CLAIMS_EMAIL = os.getenv("VAPID_CLAIMS_EMAIL", "mailto:admin@example.com")

@router.get("/vapid-public-key", response_model=VapidKeysResponse)
def get_vapid_public_key():
    if not VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=500, detail="VAPID keys not configured")
    return {"public_key": VAPID_PUBLIC_KEY}

@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
def subscribe(
    subscription: PushSubscriptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Check if subscription already exists
    existing = db.query(PushSubscription).filter(
        PushSubscription.endpoint == subscription.endpoint
    ).first()
    
    if existing:
        # Update if user changed (e.g. logout/login)
        if existing.user_id != current_user.id:
            existing.user_id = current_user.id
            db.commit()
        return {"message": "Subscription updated"}
    
    new_sub = PushSubscription(
        user_id=current_user.id,
        endpoint=subscription.endpoint,
        p256dh=subscription.keys.p256dh,
        auth=subscription.keys.auth,
        user_agent=subscription.user_agent
    )
    db.add(new_sub)
    db.commit()
    return {"message": "Subscribed successfully"}

@router.post("/unsubscribe")
def unsubscribe(
    endpoint: str = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sub = db.query(PushSubscription).filter(
        PushSubscription.endpoint == endpoint,
        PushSubscription.user_id == current_user.id
    ).first()
    
    if sub:
        db.delete(sub)
        db.commit()
    
    return {"message": "Unsubscribed successfully"}

@router.post("/test-notification")
def send_test_notification(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == current_user.id).all()
    
    if not subs:
        raise HTTPException(status_code=404, detail="No subscriptions found for current user")
    
    if not VAPID_PRIVATE_KEY:
         raise HTTPException(status_code=500, detail="VAPID private key not configured")

    results = []
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh,
                        "auth": sub.auth
                    }
                },
                data=json.dumps({
                    "title": "Test Notification",
                    "body": "This is a test notification from Sunny Football Academy!",
                    "icon": "/icons/icon-192.png",
                    "url": "/"
                }),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_CLAIMS_EMAIL}
            )
            results.append({"endpoint": sub.endpoint, "status": "success"})
        except WebPushException as ex:
            # If 410 Gone, delete subscription
            if ex.response.status_code == 410:
                db.delete(sub)
                db.commit()
                results.append({"endpoint": sub.endpoint, "status": "expired"})
            else:
                logger.error(f"WebPush error: {ex}")
                results.append({"endpoint": sub.endpoint, "status": "error", "detail": str(ex)})
        except Exception as e:
            logger.error(f"Notification error: {e}")
            results.append({"endpoint": sub.endpoint, "status": "error", "detail": str(e)})
            
    return {"results": results}
