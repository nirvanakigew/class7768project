#!/usr/bin/env python3
"""
BaseScan contract verification using the REST API
"""
import requests
import json
import os
from pathlib import Path

BASESCAN_API = "https://api-sepolia.basescan.org/api"
API_KEY = "Y8FSM4KAIQW5NSYUT2K7YXRJ8SYHHWPSAI"

# Read contract source files
CONTRACTS_DIR = Path("/workspaces/class7768project/contracts/src")

CONTRACTS = [
    {
        "name": "BantahPoints",
        "address": "0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB",
        "file": "BantahPoints.sol",
        "compiler": "v0.8.20+commit.a35aead5",
        "optimization": True,
        "runs": 200,
    },
    {
        "name": "ChallengeEscrow",
        "address": "0xC107f8328712998abBB2cCf559f83EACF476AE82",
        "file": "ChallengeEscrow.sol",
        "compiler": "v0.8.20+commit.a35aead5",
        "optimization": True,
        "runs": 200,
    },
    {
        "name": "ChallengeFactory",
        "address": "0xcE1D04A1830035Aa117A910f285818FF1AFca621",
        "file": "ChallengeFactory.sol",
        "compiler": "v0.8.20+commit.a35aead5",
        "optimization": True,
        "runs": 200,
    },
    {
        "name": "PointsEscrow",
        "address": "0xCfAa7FCE305c26F2429251e5c27a743E1a0C3FAf",
        "file": "PointsEscrow.sol",
        "compiler": "v0.8.20+commit.a35aead5",
        "optimization": True,
        "runs": 200,
    },
]

def read_source(filename):
    """Read contract source file"""
    path = CONTRACTS_DIR / filename
    if not path.exists():
        print(f"❌ File not found: {path}")
        return None
    with open(path, "r") as f:
        return f.read()

def verify_contract(contract):
    """Submit contract for verification"""
    print(f"\n📋 Submitting {contract['name']} for verification...")
    
    source = read_source(contract["file"])
    if not source:
        return False
    
    params = {
        "apikey": API_KEY,
        "module": "contract",
        "action": "verifysourcecode",
        "contractaddress": contract["address"],
        "sourceCode": source,
        "codeformat": "solidity-single-file",
        "contractname": contract["name"],
        "compilerversion": contract["compiler"],
        "optimizationUsed": "1" if contract["optimization"] else "0",
        "runs": contract["runs"],
        "licenseType": "12",  # MIT
    }
    
    try:
        resp = requests.post(BASESCAN_API, data=params, timeout=30)
        result = resp.json()
        
        if result.get("status") == "1":
            guid = result.get("result", "")
            print(f"✅ Submitted! GUID: {guid}")
            print(f"   Check status: https://sepolia.basescan.org/address/{contract['address']}#code")
            return True
        else:
            print(f"❌ Error: {result.get('message', 'Unknown error')}")
            print(f"   Response: {result.get('result', '')}")
            return False
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False

print("🔍 BaseScan Contract Verification")
print("=" * 60)

success_count = 0
for contract in CONTRACTS:
    if verify_contract(contract):
        success_count += 1

print("\n" + "=" * 60)
print(f"\n✅ Submitted {success_count}/{len(CONTRACTS)} contracts")
print("\n📊 BaseScan typically verifies within 1-5 minutes.")
print("   Check status at: https://sepolia.basescan.org/\n")
