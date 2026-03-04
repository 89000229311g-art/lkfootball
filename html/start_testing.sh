#!/bin/bash

# Football Academy - Complete Setup & Testing Script
# This script sets up test users and starts all services

echo "⚽ FOOTBALL ACADEMY - QUICK START SCRIPT"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Create test users
echo -e "${BLUE}📝 Step 1: Creating test users...${NC}"
python3 create_users.py
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Test users created successfully!${NC}"
else
    echo -e "${YELLOW}⚠️  Warning: Could not create users. Database might not be running.${NC}"
fi
echo ""

# Step 2: Show available services
echo -e "${BLUE}🚀 Step 2: Available services:${NC}"
echo ""
echo -e "  ${GREEN}1. Backend API${NC}"
echo -e "     Command: uvicorn app.main:app --reload"
echo -e "     URL: http://localhost:8000"
echo -e "     Docs: http://localhost:8000/docs"
echo ""
echo -e "  ${GREEN}2. Web Application${NC}"
echo -e "     Command: cd frontend && npm run dev"
echo -e "     URL: http://localhost:3000"
echo ""
echo -e "  ${GREEN}3. Mobile App (Flutter)${NC}"
echo -e "     Command: cd football_academy_app && flutter run"
echo -e "     Emulator: Use Android Studio or Xcode"
echo ""

# Step 3: Open quick login page
echo -e "${BLUE}🔑 Step 3: Opening Quick Login helper...${NC}"
if command -v open &> /dev/null; then
    open QUICK_LOGIN.html
elif command -v xdg-open &> /dev/null; then
    xdg-open QUICK_LOGIN.html
else
    echo "Open QUICK_LOGIN.html manually in your browser"
fi
echo ""

# Step 4: Test credentials summary
echo -e "${BLUE}🔑 TEST CREDENTIALS (all passwords are '123'):${NC}"
echo "=================================================="
echo -e "${GREEN}👔 OWNER:${NC}  Login: owner  | Password: 123"
echo -e "${GREEN}🔧 ADMIN:${NC}  Login: admin  | Password: 123"
echo -e "${GREEN}🏃 COACH:${NC}  Login: coach  | Password: 123"
echo -e "${GREEN}👨‍👩‍👧 PARENT:${NC} Login: parent | Password: 123"
echo "=================================================="
echo ""

echo -e "${YELLOW}💡 TIP: Use QUICK_LOGIN.html as a quick reference!${NC}"
echo ""

# Optional: Ask if user wants to start backend
read -p "Do you want to start the backend server now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}🚀 Starting backend server...${NC}"
    uvicorn app.main:app --reload
fi
