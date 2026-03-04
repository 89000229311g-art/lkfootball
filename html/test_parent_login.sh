#!/bin/bash

echo "🧪 Testing Parent Login in Mobile App"
echo "====================================="
echo ""

# Check if backend is running
echo "📡 Checking backend..."
if curl -s http://localhost:8000 > /dev/null 2>&1; then
    echo "✅ Backend is running"
else
    echo "❌ Backend is NOT running!"
    echo ""
    echo "Please start backend first:"
    echo "  uvicorn app.main:app --reload"
    echo ""
    exit 1
fi

# Test login API
echo ""
echo "🔐 Testing login API with parent credentials..."
RESPONSE=$(curl -s -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=parent&password=123")

if echo "$RESPONSE" | grep -q "access_token"; then
    echo "✅ Parent login successful!"
    TOKEN=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")
    echo ""
    echo "🎫 Access Token: ${TOKEN:0:50}..."
    
    # Test getting user info
    echo ""
    echo "👤 Getting user info..."
    USER_INFO=$(curl -s -X GET "http://localhost:8000/api/v1/auth/me" \
      -H "Authorization: Bearer $TOKEN")
    
    echo "$USER_INFO" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f'  Name: {data.get(\"full_name\")}'); print(f'  Role: {data.get(\"role\")}'); print(f'  Phone: {data.get(\"phone\")}')"
    
else
    echo "❌ Login failed!"
    echo "Response: $RESPONSE"
    echo ""
    echo "Please create users first:"
    echo "  python3 create_users.py"
    exit 1
fi

echo ""
echo "================================"
echo "✅ All tests passed!"
echo ""
echo "Now you can test in mobile app:"
echo "  1. Open Android Emulator or iOS Simulator"
echo "  2. Run: cd football_academy_app && flutter run"
echo "  3. Click on '👨‍👩‍👧 Parent' button"
echo "  4. Click 'Login'"
echo ""
