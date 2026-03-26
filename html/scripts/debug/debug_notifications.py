from app.core.database import SessionLocal
from app.models import Message, Event, Group, Student, StudentGuardian, User
from sqlalchemy import desc

db = SessionLocal()

print("=== Checking Groups ===")
u5_group = db.query(Group).filter(Group.name.ilike("%u5%")).first()
if u5_group:
    print(f"Found Group U5: ID={u5_group.id}, Name={u5_group.name}")
else:
    print("Group U5 not found")
    # List all groups
    groups = db.query(Group).all()
    print(f"Available groups: {[(g.id, g.name) for g in groups]}")

if u5_group:
    print(f"\n=== Checking Students in Group {u5_group.id} ===")
    students = db.query(Student).filter(Student.group_id == u5_group.id).all()
    print(f"Found {len(students)} students")
    for s in students:
        print(f"Student: {s.id} {s.first_name} {s.last_name}")
        guardians = db.query(StudentGuardian).filter(StudentGuardian.student_id == s.id).all()
        for g in guardians:
            parent = db.query(User).filter(User.id == g.user_id).first()
            if parent:
                print(f"  - Parent: {parent.id} {parent.full_name} ({parent.phone})")
            else:
                print(f"  - Guardian link found but user {g.user_id} not found")

    print("\n=== Checking Recent Messages for Group ===")
    messages = db.query(Message).filter(
        Message.group_id == u5_group.id
    ).order_by(desc(Message.created_at)).limit(5).all()
    
    for m in messages:
        print(f"Msg {m.id}: Type={m.chat_type}, Content={m.content[:50]}...")

    print("\n=== Checking Recent Events for Group ===")
    events = db.query(Event).filter(
        Event.group_id == u5_group.id
    ).order_by(desc(Event.created_at)).limit(5).all()
    
    for e in events:
        print(f"Event {e.id}: Type={e.type}, Start={e.start_time}")

db.close()
