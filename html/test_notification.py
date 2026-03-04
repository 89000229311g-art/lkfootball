import asyncio
from app.core.background_tasks import notify_event_created
from app.core.database import SessionLocal
from app.models import Event

# Need to run async function
async def main():
    print("Running notification test for Event 4320...")
    # 114 is likely the sender (admin/owner)
    await notify_event_created(4320, 114) 
    print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
