#!/usr/bin/env python3
"""
Find existing students in the database
"""

import requests
import json

# Login first
print("🔑 Logging in as super admin...")
login_response = requests.post(
    "http://localhost:8000/api/v1/auth/login",
    data={
        "username": "owner",
        "password": "123"
    },
    headers={"Content-Type": "application/x-www-form-urlencoded"}
)

if login_response.status_code != 200:
    print(f"❌ Login failed: {login_response.status_code}")
    print(login_response.text)
    exit(1)

token = login_response.json()["access_token"]
print(f"✅ Got access token: {token[:20]}...")

# Get students
print("\n📋 Getting students...")
students_response = requests.get(
    "http://localhost:8000/api/v1/students",
    headers={"Authorization": f"Bearer {token}"}
)

if students_response.status_code != 200:
    print(f"❌ Failed to get students: {students_response.status_code}")
    print(students_response.text)
    exit(1)

students = students_response.json()
print(f"✅ Response type: {type(students)}")
print(f"✅ Response data: {students}")

# Handle different response formats
if isinstance(students, dict):
    # If it's a dict, look for students in a key
    students_list = students.get('students', students.get('data', []))
elif isinstance(students, list):
    students_list = students
else:
    students_list = []

print(f"✅ Found {len(students_list)} students")

if students_list:
    print("\n👥 First few students:")
    for student in students_list[:5]:
        print(f"  ID: {student['id']}, Name: {student['first_name']} {student['last_name']}, Group: {student.get('group_name', 'No group')}")
else:
    print("\n❌ No students found in database")
    print("You may need to create some students first")