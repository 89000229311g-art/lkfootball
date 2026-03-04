from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, Enum, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from enum import Enum as PyEnum
from .base import Base
from app.core.timezone import now_naive


class ChatType(str, PyEnum):
    announcement = "announcement"
    group_chat = "group_chat"
    direct = "direct"
    support = "support"
    schedule_notification = "schedule_notification"
    system = "system"
    freeze_request = "freeze_request"
    
    # Legacy/Uppercase support (temporary fix for existing data)
    SYSTEM = "SYSTEM"
    GROUP_CHAT = "GROUP_CHAT"
    SUPPORT = "SUPPORT"


class PostType(str, PyEnum):
    news = "news"              # Обычная новость
    announcement = "announcement"  # Важное объявление
    schedule = "schedule"      # Изменение расписания
    match_report = "match_report"  # Отчёт с матча
    event = "event"            # Событие/турнир


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    recipient_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=True)
    chat_type = Column(Enum(ChatType), default=ChatType.announcement)
    content = Column(Text, nullable=False)
    is_general = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_read = Column(Boolean, default=False)
    
    # Новые поля для расширенного функционала
    is_pinned = Column(Boolean, default=False)  # Закрепленное сообщение
    poll_id = Column(Integer, ForeignKey("polls.id", ondelete="SET NULL"), nullable=True)  # Прикреплённый опрос

    # Relationships
    sender = relationship("User", foreign_keys=[sender_id], overlaps="sent_messages")
    recipient = relationship("User", foreign_keys=[recipient_id], overlaps="received_messages")
    group = relationship("Group", backref="messages")
    poll = relationship("Poll", back_populates="message")


class Post(Base):
    """Лента новостей - публикации с медиа, реакциями, закреплением"""
    __tablename__ = "posts"

    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=True)  # null = для всех
    
    post_type = Column(Enum(PostType), default=PostType.news)
    title = Column(String(255), nullable=True)
    content = Column(Text, nullable=False)
    
    # Медиа файлы (JSON список URL)
    media_urls = Column(JSON, default=list)  # ["/uploads/photo1.jpg", "/uploads/video.mp4"]
    attachments = Column(JSON, default=list)  # [{"name": "schedule.pdf", "url": "/uploads/schedule.pdf"}]
    
    # Статистика
    views_count = Column(Integer, default=0)
    likes_count = Column(Integer, default=0)
    
    # Флаги
    is_pinned = Column(Boolean, default=False)  # Закреплено в топе
    is_published = Column(Boolean, default=True)
    
    # НОВОЕ: Обязательное подтверждение прочтения
    requires_confirmation = Column(Boolean, default=False)  # Требует подтверждения прочтения
    confirmation_deadline = Column(DateTime, nullable=True)  # Дедлайн для подтверждения
    
    created_at = Column(DateTime, default=now_naive)
    updated_at = Column(DateTime, default=now_naive, onupdate=now_naive)

    # Relationships
    author = relationship("User", backref="posts")
    group = relationship("Group", backref="posts")
    reactions = relationship("PostReaction", back_populates="post", cascade="all, delete-orphan")
    reads = relationship("AnnouncementRead", back_populates="post", cascade="all, delete-orphan")


class PostReaction(Base):
    """Реакции на посты (лайки)"""
    __tablename__ = "post_reactions"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    reaction_type = Column(String(20), default="like")  # like, love, fire, etc.
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    post = relationship("Post", back_populates="reactions")
    user = relationship("User")


class Poll(Base):
    """Опросы в чатах (например 'Кто будет на тренировке?')"""
    __tablename__ = "polls"

    id = Column(Integer, primary_key=True, index=True)
    creator_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=True)
    
    question = Column(String(500), nullable=False)
    options = Column(JSON, nullable=False)  # ["Буду", "Не буду", "Под вопросом"]
    
    is_anonymous = Column(Boolean, default=False)
    is_multiple_choice = Column(Boolean, default=False)
    ends_at = Column(DateTime, nullable=True)  # Дата окончания опроса
    
    created_at = Column(DateTime, default=datetime.utcnow)
    is_closed = Column(Boolean, default=False)

    # Relationships
    creator = relationship("User", backref="polls")
    group = relationship("Group", backref="polls")
    votes = relationship("PollVote", back_populates="poll", cascade="all, delete-orphan")
    message = relationship("Message", back_populates="poll", uselist=False)


class PollVote(Base):
    """Голоса в опросах"""
    __tablename__ = "poll_votes"

    id = Column(Integer, primary_key=True, index=True)
    poll_id = Column(Integer, ForeignKey("polls.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    option_index = Column(Integer, nullable=False)  # Индекс выбранного варианта
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    poll = relationship("Poll", back_populates="votes")
    user = relationship("User")
