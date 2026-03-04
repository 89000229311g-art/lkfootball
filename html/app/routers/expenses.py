from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
from datetime import date
from pydantic import BaseModel

from app.core.deps import get_db, get_current_user
from app.models import User, Expense, ExpenseCategory
from app.models.marketing import MarketingCampaign
from app.core.audit_service import log_create, log_update, log_delete, entity_to_dict

router = APIRouter()

# --- Schemas ---
class MarketingCampaignSummary(BaseModel):
    id: int
    name: str
    
    class Config:
        from_attributes = True

class ExpenseCreate(BaseModel):
    title: str
    amount: float
    category: str
    date: date
    description: Optional[str] = None
    marketing_campaign_id: Optional[int] = None

class ExpenseUpdate(BaseModel):
    title: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    date: Optional[date] = None
    description: Optional[str] = None
    marketing_campaign_id: Optional[int] = None

class ExpenseResponse(BaseModel):
    id: int
    title: str
    amount: float
    category: str
    date: date
    description: Optional[str] = None
    created_by_id: Optional[int] = None
    marketing_campaign_id: Optional[int] = None
    marketing_campaign: Optional[MarketingCampaignSummary] = None
    
    class Config:
        from_attributes = True

class CategoryResponse(BaseModel):
    id: str
    label: str

# --- Endpoints ---

@router.get("/categories", response_model=List[CategoryResponse])
async def get_categories(
    current_user: User = Depends(get_current_user)
):
    """Получить список категорий расходов"""
    # Map from Expense model
    categories_map = {
        "rent": "Аренда",
        "equipment": "Инвентарь",
        "marketing": "Маркетинг",
        "maintenance": "Обслуживание",
        "salary_extra": "Доп. выплаты",
        "event": "Мероприятия",
        "other": "Прочее"
    }
    
    return [
        {"id": cat.value, "label": categories_map.get(cat.value, cat.value)}
        for cat in ExpenseCategory
    ]

@router.get("/", response_model=List[ExpenseResponse])
async def get_expenses(
    skip: int = 0,
    limit: int = 100,
    category: Optional[str] = None,
    marketing_campaign_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role.lower() not in ["super_admin", "admin", "owner", "accountant"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = db.query(Expense)
    
    if category:
        query = query.filter(Expense.category == category)
    if marketing_campaign_id:
        query = query.filter(Expense.marketing_campaign_id == marketing_campaign_id)
    if start_date:
        query = query.filter(Expense.date >= start_date)
    if end_date:
        query = query.filter(Expense.date <= end_date)
        
    return query.options(joinedload(Expense.marketing_campaign)).order_by(desc(Expense.date)).offset(skip).limit(limit).all()

@router.post("/", response_model=ExpenseResponse)
async def create_expense(
    expense_in: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role.lower() not in ["super_admin", "admin", "owner", "accountant"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    expense = Expense(
        title=expense_in.title,
        amount=expense_in.amount,
        category=expense_in.category,
        date=expense_in.date,
        description=expense_in.description,
        created_by_id=current_user.id,
        marketing_campaign_id=expense_in.marketing_campaign_id
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    
    # Fix: Use correct audit log signature
    # log_create(db, entity_type, entity, user)
    # The error likely comes from log_create failing or missing parameters
    log_create(db, "expense", expense, user=current_user)
    return expense

@router.put("/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: int,
    expense_in: ExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role.lower() not in ["super_admin", "admin", "owner", "accountant"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
        
    old_data = entity_to_dict(expense)
    
    update_data = expense_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(expense, field, value)
        
    db.add(expense)
    db.commit()
    db.refresh(expense)
    
    log_update(db, "expense", expense, old_data, user=current_user)
    return expense

@router.delete("/{expense_id}")
async def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role.lower() not in ["super_admin", "admin", "owner", "accountant"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
        
    log_delete(db, "expense", expense, user=current_user)
    
    db.delete(expense)
    db.commit()
    return {"message": "Expense deleted"}
