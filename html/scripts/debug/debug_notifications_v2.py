from app.core.database import SessionLocal
from app.models import Message, Event, Group, Student, StudentGuardian, User
from sqlalchemy import desc

db = SessionLocal()

group_id = 22
print(f"=== Checking Group {group_id} ===")
u5_group = db.query(Group).filter(Group.id == group_id).first()
if u5_group:
    print(f"Found Group: {u5_group.name}")
else:
    print("Group not found")

print(f"\n=== Checking Students in Group {group_id} ===")
students = db.query(Student).filter(Student.group_id == group_id).all()
print(f"Found {len(students)} students")
for s in students:
    print(f"Student: {s.id} {s.first_name} {s.last_name}")
    guardians = db.query(StudentGuardian).filter(StudentGuardian.student_id == s.id).all()
    if not guardians:
        print("  - No guardians linked")
    for g in guardians:
        parent = db.query(User).filter(User.id == g.user_id).first()
        if parent:
            print(f"  - Parent: {parent.id} {parent.full_name} ({parent.phone})")
        else:
            print(f"  - Guardian link found but user {g.user_id} not found")

print("\n=== Checking Recent Messages for Group ===")
messages = db.query(Message).filter(
    Message.group_id == group_id
).order_by(desc(Message.created_at)).limit(5).all()

for m in messages:
    print(f"Msg {m.id}: Type={m.chat_type}, Content={m.content[:50]}...")

print("\n=== Checking Recent Events for Group ===")
events = db.query(Event).filter(
    Event.group_id == group_id
).order_by(desc(Event.created_at)).limit(5).all()

for e in events:
    print(f"Event {e.id}: Type={e.type}, Start={e.start_time}")

db.close()
