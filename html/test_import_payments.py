#!/usr/bin/env python3
"""
Test importing the payments router to check for syntax errors
"""

try:
    from app.routers.payments import router
    print("✅ Successfully imported payments router")
    
    # Check if the manual-invoice endpoint is registered
    routes = [route.path for route in router.routes]
    print(f"📋 Found {len(routes)} routes:")
    for route in sorted(routes):
        print(f"   - {route}")
    
    if "/manual-invoice" in routes:
        print("✅ manual-invoice endpoint is registered")
    else:
        print("❌ manual-invoice endpoint NOT found in registered routes")
        
        # Look for similar routes
        manual_routes = [r for r in routes if "manual" in r.lower()]
        if manual_routes:
            print(f"   Found manual-related routes: {manual_routes}")
        
        invoice_routes = [r for r in routes if "invoice" in r.lower()]
        if invoice_routes:
            print(f"   Found invoice-related routes: {invoice_routes}")
    
except Exception as e:
    print(f"❌ Error importing payments router: {e}")
    import traceback
    traceback.print_exc()