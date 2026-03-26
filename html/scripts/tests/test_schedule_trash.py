
import sys
import os
from datetime import datetime, date, time
from unittest.mock import MagicMock

# Mock dependencies
sys.modules["aiosqlite"] = MagicMock()
sys.modules["aiosqlite"].sqlite_version_info = (3, 30, 0)
sys.modules["openpyxl"] = MagicMock()
sys.modules["openpyxl.styles"] = MagicMock()
sys.modules["openpyxl.utils"] = MagicMock()
sys.modules["googleapiclient"] = MagicMock()
sys.modules["googleapiclient.discovery"] = MagicMock()
sys.modules["googleapiclient.http"] = MagicMock()
sys.modules["reportlab"] = MagicMock()
sys.modules["reportlab.pdfgen"] = MagicMock()
sys.modules["reportlab.lib"] = MagicMock()
sys.modules["reportlab.platypus"] = MagicMock()
sys.modules["pywebpush"] = MagicMock()
sys.modules["firebase_admin"] = MagicMock()
sys.modules["firebase_admin.messaging"] = MagicMock()
sys.modules["firebase_admin.credentials"] = MagicMock()

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from fastapi.testclient import TestClient
from app.main import app
from app.core.deps import get_db, get_current_user
from app.models import User, Group, ScheduleTemplate
from app.core.database import SessionLocal

# Setup TestClient
client = TestClient(app)

# Helper to get DB session
def get_db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Get a real admin user
db = SessionLocal()
admin_user = db.query(User).filter(User.role.in_(['admin', 'super_admin'])).first()

if not admin_user:
    print("❌ No admin user found.")
    sys.exit(1)

print(f"✅ Using Admin User: {admin_user.full_name} ({admin_user.role})")

# Override auth dependency
app.dependency_overrides[get_current_user] = lambda: admin_user

# 1. Create a dummy group if needed
group = db.query(Group).first()
if not group:
    group = Group(name="Test Group", age_group="U10")
    db.add(group)
    db.commit()
    db.refresh(group)

print(f"✅ Using Group: {group.name} (ID: {group.id})")

# 2. Create a Schedule Template
template_data = {
    "group_id": group.id,
    "name": "Test Template for Trash",
    "valid_from": datetime.now().isoformat(),
    "valid_until": datetime(2030, 1, 1).isoformat(),
    "is_active": True,
    "schedule_rules": [
        {"day": 0, "start_time": "10:00", "end_time": "11:00", "type": "training", "location": "Field 1"}
    ],
    "excluded_dates": []
}

print("\n📅 Creating Template...")
res = client.post("/api/v1/schedule/templates", json=template_data)
if res.status_code != 200:
    print(f"❌ Failed to create template: {res.text}")
    sys.exit(1)

template = res.json()
template_id = template['id']
print(f"✅ Template Created: ID {template_id}")

# 3. Delete the Template
print("\n🗑️ Deleting Template...")
res = client.delete(f"/api/v1/schedule/templates/{template_id}")
if res.status_code != 200:
    print(f"❌ Failed to delete template: {res.text}")
    sys.exit(1)
print("✅ Template Deleted (Soft Delete)")

# 4. Check Trash
print("\n🔍 Checking Trash...")
res = client.get("/api/v1/trash?entity_type=schedule_template")
if res.status_code != 200:
    # Try with trailing slash just in case
    res = client.get("/api/v1/trash/?entity_type=schedule_template")
    if res.status_code != 200:
        print(f"❌ Failed to fetch trash: {res.status_code} {res.text}")
        sys.exit(1)

trash_data = res.json()
print(f"Trash Response: {trash_data}")

items = trash_data.get('items', {}).get('schedule_template', [])
found = any(item['id'] == template_id for item in items)

if found:
    print("✅ SUCCESS: Deleted template found in trash.")
else:
    print("❌ FAILURE: Deleted template NOT found in trash.")

# Cleanup (Hard Delete for test)
db_template = db.query(ScheduleTemplate).filter(ScheduleTemplate.id == template_id).first()
if db_template:
    db.delete(db_template)
    db.commit()
    print("🧹 Cleanup: Template hard deleted.")

db.close()
