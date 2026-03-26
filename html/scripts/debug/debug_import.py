
try:
    from app.routers import payments
    print("Payments imported")
    from app.routers import students
    print("Students imported")
    from app import main
    print("Main imported")
except Exception as e:
    import traceback
    traceback.print_exc()
