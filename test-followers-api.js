/**
 * Test the Followers System
 * Tests follow/unfollow API endpoints
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';
const TEST_USER_ID = 'test-user-1';
const TEST_FOLLOWER_ID = 'test-user-2';

async function testFollowersSystem() {
  console.log('🧪 Testing Followers System...\n');

  try {
    // Test 1: Follow a user
    console.log('Test 1: Follow a user');
    const followRes = await fetch(`${BASE_URL}/api/followers/${TEST_FOLLOWER_ID}/follow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_USER_ID}`,
      },
    });

    if (followRes.ok) {
      const data = await followRes.json();
      console.log('✅ Follow response:', data);
    } else {
      console.log('⚠️  Follow endpoint returned:', followRes.status);
    }

    // Test 2: Get followers list
    console.log('\nTest 2: Get followers list');
    const followersRes = await fetch(`${BASE_URL}/api/followers/${TEST_FOLLOWER_ID}`);

    if (followersRes.ok) {
      const data = await followersRes.json();
      console.log('✅ Followers list:', data);
    } else {
      console.log('⚠️  Followers endpoint returned:', followersRes.status);
    }

    console.log('\n✅ API route tests completed');

  } catch (error) {
    console.error('❌ Error during tests:', error.message);
  }
}

console.log('Note: Make sure the server is running on localhost:5000');
console.log('Run: npm run dev\n');

// testFollowersSystem();
console.log('(Tests commented out - uncomment to run against live server)');
