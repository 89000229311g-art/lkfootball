from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.core.deps import get_db, get_current_user
from app.models.marketing import MarketingCampaign
from app.schemas.marketing import (
    MarketingCampaignCreate,
    MarketingCampaignUpdate,
    MarketingCampaignResponse,
)
from app.models.user import User

router = APIRouter(prefix="/marketing/campaigns", tags=["Marketing"])

@router.get("/", response_model=List[MarketingCampaignResponse])
def get_campaigns(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role.lower() if current_user.role else ""
    if not current_user.can_view_marketing and role not in ["super_admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Eager load expenses to calculate total_spend efficiently
    campaigns = db.query(MarketingCampaign).options(joinedload(MarketingCampaign.expenses)).all()
    
    return campaigns

@router.post("/", response_model=MarketingCampaignResponse)
def create_campaign(
    campaign_in: MarketingCampaignCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role.lower() if current_user.role else ""
    if not current_user.can_view_marketing and role not in ["super_admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    campaign = MarketingCampaign(**campaign_in.model_dump())
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign

@router.put("/{campaign_id}", response_model=MarketingCampaignResponse)
def update_campaign(
    campaign_id: int,
    campaign_in: MarketingCampaignUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role.lower() if current_user.role else ""
    if not current_user.can_view_marketing and role not in ["super_admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    campaign = db.query(MarketingCampaign).filter(MarketingCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    update_data = campaign_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(campaign, field, value)
    
    db.commit()
    db.refresh(campaign)
    return campaign

@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role.lower() if current_user.role else ""
    if not current_user.can_view_marketing and role not in ["super_admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    campaign = db.query(MarketingCampaign).filter(MarketingCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    db.delete(campaign)
    db.commit()
    return None
