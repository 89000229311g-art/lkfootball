#!/usr/bin/env python3
"""
Manually verify password hash
"""
from app.core.security import verify_password, get_password_hash

def test_password_hash():
    """Test password hash generation and verification"""
    
    # Test with known password
    test_password = "admin"
    print(f"Testing password: '{test_password}'")
    
    # Generate new hash
    new_hash = get_password_hash(test_password)
    print(f"New hash: {new_hash}")
    
    # Verify against new hash
    if verify_password(test_password, new_hash):
        print("✅ New hash verification: PASSED")
    else:
        print("❌ New hash verification: FAILED")
    
    # Test against existing hash from database
    existing_hash = "$2b$12$V/D6IMpkr6WzfMYFzheZHuBYLqbxIWrvCWoI4ZFhyplVQjoiteqIW"
    print(f"\nTesting against existing hash: {existing_hash}")
    
    if verify_password(test_password, existing_hash):
        print("✅ Existing hash verification: PASSED")
    else:
        print("❌ Existing hash verification: FAILED")
    
    # Test other common passwords
    common_passwords = ["password", "123456", "admin123", "Admin", "ADMIN"]
    print(f"\nTesting common passwords against existing hash:")
    for pwd in common_passwords:
        if verify_password(pwd, existing_hash):
            print(f"✅ Password '{pwd}' matches!")
            break
    else:
        print("❌ No common passwords matched")

if __name__ == "__main__":
    test_password_hash()