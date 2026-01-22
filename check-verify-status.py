#!/usr/bin/env python3
"""
Simple BaseScan verification tool using API directly
"""
import requests
import json
import sys

BASESCAN_API = "https://api-sepolia.basescan.org/api"
API_KEY = "Y8FSM4KAIQW5NSYUT2K7YXRJ8SYHHWPSAI"

CONTRACTS = {
    "BantahPoints": "0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB",
    "ChallengeEscrow": "0xC107f8328712998abBB2cCf559f83EACF476AE82",
    "ChallengeFactory": "0xcE1D04A1830035Aa117A910f285818FF1AFca621",
    "PointsEscrow": "0xCfAa7FCE305c26F2429251e5c27a743E1a0C3FAf",
}

def check_verification_status(address):
    """Check if contract is already verified"""
    try:
        params = {
            "module": "contract",
            "action": "getsourcecode",
            "address": address,
            "apikey": API_KEY
        }
        resp = requests.get(BASESCAN_API, params=params, timeout=10)
        data = resp.json()
        
        if data["status"] == "1" and data["result"]:
            source = data["result"][0].get("SourceCode", "")
            return bool(source), source[:100] if source else None
        return False, None
    except Exception as e:
        print(f"Error checking status: {e}")
        return None, None

print("🔍 Checking verification status on Base Sepolia...\n")
print("=" * 60)

for name, address in CONTRACTS.items():
    is_verified, source = check_verification_status(address)
    
    if is_verified is None:
        status = "❓ Error checking"
    elif is_verified:
        status = "✅ VERIFIED"
    else:
        status = "⏳ Not verified"
    
    print(f"\n{name}")
    print(f"  Address: {address}")
    print(f"  Status: {status}")
    if source:
        print(f"  Source (truncated): {source}...")

print("\n" + "=" * 60)
print("\n📊 View contracts at:")
for name, address in CONTRACTS.items():
    print(f"  https://sepolia.basescan.org/address/{address}#code")
