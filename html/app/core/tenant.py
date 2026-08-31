from typing import Iterable, Optional, Type

from sqlalchemy.orm import Session


def is_platform_owner(user) -> bool:
    return (getattr(user, "role", "") or "").lower() == "platform_owner"


def get_user_academy_id(user) -> Optional[int]:
    return getattr(user, "academy_id", None)


def set_tenant_context(db: Session, user) -> None:
    if is_platform_owner(user):
        db.info["bypass_tenant"] = True
        db.info.pop("academy_id", None)
        return

    academy_id = get_user_academy_id(user)
    if academy_id:
        db.info["academy_id"] = academy_id
        db.info["bypass_tenant"] = False


def tenant_models() -> Iterable[Type]:
    from app.models import (
        Academy,
        AuditLog,
        EmployeeContract,
        Event,
        FunnelStage,
        GeneratedEvent,
        Group,
        HRCandidate,
        HRFunnelStage,
        Lead,
        MarketingCampaign,
        Message,
        Payment,
        Post,
        SalaryPayment,
        ScheduleChange,
        ScheduleTemplate,
        SchoolSettings,
        Student,
        Task,
        User,
    )

    return (User, Student, Group, Event, Payment, Message, Post, SchoolSettings, AuditLog, Lead, FunnelStage, MarketingCampaign, Task, EmployeeContract, SalaryPayment, ScheduleTemplate, GeneratedEvent, ScheduleChange, HRCandidate, HRFunnelStage)
