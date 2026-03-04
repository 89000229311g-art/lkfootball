import re

file_path = 'app/routers/payments.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
import_marker = "from app.core.audit_service import log_create, log_update, log_delete, entity_to_dict"
new_import = "from app.core.audit_service import log_create, log_update, log_delete, entity_to_dict\nfrom app.core.localization import get_month_name_ru"

if import_marker in content and "from app.core.localization import get_month_name_ru" not in content:
    content = content.replace(import_marker, new_import)
    print("Added import to routers/payments.py")

# Remove function definition
func_pattern = r'# Helper for Russian month names\s+def get_month_name_ru\(month_num: int\) -> str:\s+months = \{[^}]+\}\s+return months\.get\(month_num, ""\)'
content = re.sub(func_pattern, '', content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Patched routers/payments.py")
