file_path = 'app/services/payment_service.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_import = "from app.routers.payments import get_month_name_ru"
new_import = "from app.core.localization import get_month_name_ru"

if old_import in content:
    content = content.replace(old_import, new_import)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched services/payment_service.py")
else:
    print("Could not find import in services/payment_service.py")
