from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from datetime import datetime

from app.core.deps import get_db, get_current_user
from app.models import User, Poll, PollVote, Group, Message, ChatType
from pydantic import BaseModel

router = APIRouter()

# --- Schemas ---
class PollCreate(BaseModel):
    question: str
    options: List[str]
    group_id: Optional[int] = None
    is_anonymous: bool = False
    is_multiple_choice: bool = False
    ends_at: Optional[datetime] = None

class PollVoteCreate(BaseModel):
    option_index: int

# --- Endpoints ---

@router.post("/", response_model=dict)
async def create_poll(
    poll_in: PollCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new poll."""
    if poll_in.group_id:
        group = db.query(Group).filter(Group.id == poll_in.group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        # Check permissions...
    
    poll = Poll(
        creator_id=current_user.id,
        group_id=poll_in.group_id,
        question=poll_in.question,
        options=poll_in.options,
        is_anonymous=poll_in.is_anonymous,
        is_multiple_choice=poll_in.is_multiple_choice,
        ends_at=poll_in.ends_at
    )
    db.add(poll)
    db.commit()
    db.refresh(poll)
    
    # Create a message for this poll
    message = Message(
        sender_id=current_user.id,
        group_id=poll_in.group_id,
        chat_type=ChatType.group_chat if poll_in.group_id else ChatType.announcement,
        content=f"📊 Опрос: {poll_in.question}",
        poll_id=poll.id,
        is_general=poll_in.group_id is None
    )
    db.add(message)
    db.commit()
    
    return {"id": poll.id, "message": "Poll created"}

@router.get("/", response_model=List[dict])
async def get_polls(
    group_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get active polls."""
    query = db.query(Poll).options(joinedload(Poll.votes))
    
    if group_id:
        query = query.filter(Poll.group_id == group_id)
        
    polls = query.order_by(Poll.created_at.desc()).limit(20).all()
    
    result = []
    for p in polls:
        votes_count = [0] * len(p.options)
        user_voted_index = None
        
        for v in p.votes:
            if 0 <= v.option_index < len(votes_count):
                votes_count[v.option_index] += 1
            if v.user_id == current_user.id:
                user_voted_index = v.option_index
                
        result.append({
            "id": p.id,
            "question": p.question,
            "options": p.options,
            "group_id": p.group_id,
            "created_at": p.created_at,
            "votes_count": votes_count,
            "user_voted_index": user_voted_index,
            "total_votes": len(p.votes)
        })
        
    return result

@router.post("/{poll_id}/vote")
async def vote_poll(
    poll_id: int,
    vote_in: PollVoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Vote in a poll."""
    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
        
    if vote_in.option_index < 0 or vote_in.option_index >= len(poll.options):
        raise HTTPException(status_code=400, detail="Invalid option")
        
    # Check if already voted
    existing_vote = db.query(PollVote).filter(
        PollVote.poll_id == poll_id,
        PollVote.user_id == current_user.id
    ).first()
    
    if existing_vote:
        if not poll.is_multiple_choice:
            # Update vote
            existing_vote.option_index = vote_in.option_index
            db.commit()
            return {"message": "Vote updated"}
        else:
            # Allow multiple? Simplified for now: one vote per user unless multiple choice logic handled
            pass
            
    vote = PollVote(
        poll_id=poll_id,
        user_id=current_user.id,
        option_index=vote_in.option_index
    )
    db.add(vote)
    db.commit()
    
    return {"message": "Voted successfully"}
