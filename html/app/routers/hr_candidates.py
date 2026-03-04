from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.core.deps import get_db, get_current_user
from app.models.hr_candidate import HRCandidate
from app.schemas.hr_candidate import (
    HRCandidateCreate,
    HRCandidateUpdate,
    HRCandidateResponse,
)
from app.models.user import User

router = APIRouter(prefix="/hr/candidates", tags=["HR Candidates"])

@router.get("/", response_model=List[HRCandidateResponse])
def get_candidates(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Optional: filter by stage if needed, but for now just return all
    # Or implement filters based on query params if frontend sends them
    return db.query(HRCandidate).offset(skip).limit(limit).all()

@router.post("/", response_model=HRCandidateResponse)
def create_candidate(
    candidate_in: HRCandidateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    candidate = HRCandidate(**candidate_in.model_dump())
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate

@router.get("/{candidate_id}", response_model=HRCandidateResponse)
def get_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    candidate = db.query(HRCandidate).filter(HRCandidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate

@router.put("/{candidate_id}", response_model=HRCandidateResponse)
def update_candidate(
    candidate_id: int,
    candidate_in: HRCandidateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    candidate = db.query(HRCandidate).filter(HRCandidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    update_data = candidate_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(candidate, key, value)
    
    db.commit()
    db.refresh(candidate)
    return candidate

@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    candidate = db.query(HRCandidate).filter(HRCandidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    db.delete(candidate)
    db.commit()
    return None

@router.put("/{candidate_id}/stage", response_model=HRCandidateResponse)
def update_candidate_stage(
    candidate_id: int,
    stage: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    candidate = db.query(HRCandidate).filter(HRCandidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    candidate.stage = stage
    db.commit()
    db.refresh(candidate)
    return candidate
