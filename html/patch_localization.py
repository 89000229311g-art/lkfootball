file_path = 'app/core/localization.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

new_code = '''DEFAULT_LANGUAGE = "ru"

def get_month_name_ru(month_num: int) -> str:
    months = {
        1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель",
        5: "Май", 6: "Июнь", 7: "Июль", 8: "Август",
        9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь"
    }
    return months.get(month_num, "")

# Словарь переводов для backend'''

old_code = '''DEFAULT_LANGUAGE = "ru"

# Словарь переводов для backend'''

if old_code in content:
    content = content.replace(old_code, new_code)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched localization.py")
else:
    print("Could not find anchor in localization.py")
