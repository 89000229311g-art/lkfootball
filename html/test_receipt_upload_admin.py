#!/usr/bin/env python3
"""
Test receipt upload with admin permissions
"""

import requests
import json

# API Configuration
API_BASE = "http://localhost:8000/api/v1"
ADMIN_LOGIN_URL = f"{API_BASE}/auth/login"

# Test credentials
ADMIN_CREDENTIALS = {
    "username": "admin",
    "password": "123"
}

def test_receipt_upload_with_admin():
    """Test receipt upload with admin permissions"""
    print("🧪 Testing receipt upload with admin permissions...")
    
    # Login as admin
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Get student
    students_response = requests.get(f"{API_BASE}/students?search=Миша", headers=admin_headers)
    if students_response.status_code != 200:
        print(f"❌ Failed to get students: {students_response.status_code}")
        return False
    
    students_data = students_response.json()
    students = students_data.get('data', [])
    
    if not students:
        print("❌ Student not found")
        return False
    
    student = students[0]
    student_id = student['id']
    
    print(f"📋 Student: {student['first_name']} {student['last_name']} (ID: {student_id})")
    
    # Create a minimal PNG file content
    png_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd4c\x00\x00\x00\x00IEND\xaeB`\x82'
    
    files = {
        'receipt': ('receipt.png', png_content, 'image/png')
    }
    
    data = {
        'amount': '500',
        'payment_period': '2024-01-01',  # Correct format: YYYY-MM-DD
        'student_id': str(student_id)
    }
    
    print(f"Uploading receipt...")
    print(f"Data: {json.dumps(data, indent=2)}")
    
    upload_response = requests.post(f"{API_BASE}/payments/upload-receipt", 
                                    files=files, 
                                    data=data, 
                                    headers=admin_headers)
    
    print(f"Upload response status: {upload_response.status_code}")
    print(f"Upload response: {upload_response.text}")
    
    if upload_response.status_code != 200:
        print(f"❌ Receipt upload failed: {upload_response.status_code}")
        return False
    
    upload_result = upload_response.json()
    payment_id = upload_result['payment_id']
    print(f"✅ Receipt uploaded successfully. Payment ID: {payment_id}")
    
    return True

if __name__ == "__main__":
    test_receipt_upload_with_admin()