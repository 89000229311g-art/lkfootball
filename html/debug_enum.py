from app.models.message import ChatType
from sqlalchemy import Enum as SQLEnum

print(f"ChatType.SUPPORT value: '{ChatType.SUPPORT.value}'")
print(f"ChatType.SUPPORT type: {type(ChatType.SUPPORT)}")
print(f"str(ChatType.SUPPORT): '{str(ChatType.SUPPORT)}'")
