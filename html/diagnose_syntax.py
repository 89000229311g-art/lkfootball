import ast
import os
import sys
import traceback

def check_syntax(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            source = f.read()
        ast.parse(source)
        return True
    except SyntaxError as e:
        print(f"❌ SyntaxError in {file_path}:")
        print(f"  Line {e.lineno}, Column {e.offset}: {e.text.strip() if e.text else ''}")
        print(f"  {e.msg}")
        return False
    except Exception as e:
        print(f"❌ Error reading {file_path}: {e}")
        return False

def check_imports():
    print("\nChecking imports (runtime simulation)...")
    # Add project root to path
    sys.path.append(os.getcwd())
    
    modules_to_check = [
        "app.main",
        "app.routers.payments",
        "app.routers.students",
        "app.routers.attendance",
        "app.routers.auth",
        "app.routers.groups",
        "app.routers.messages",
    ]
    
    for module in modules_to_check:
        try:
            print(f"Importing {module}...")
            __import__(module)
            print(f"✅ {module} imported successfully")
        except Exception as e:
            print(f"❌ Error importing {module}:")
            traceback.print_exc()

def main():
    print("Starting syntax check...")
    root_dir = "app"
    has_errors = False
    
    for dirpath, dirnames, filenames in os.walk(root_dir):
        for filename in filenames:
            if filename.endswith(".py"):
                file_path = os.path.join(dirpath, filename)
                if not check_syntax(file_path):
                    has_errors = True
    
    if not has_errors:
        print("✅ No syntax errors found in app/ directory.")
        check_imports()
    else:
        print("⚠️ Syntax errors found. Fix them before checking imports.")

if __name__ == "__main__":
    main()
