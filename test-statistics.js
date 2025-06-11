const axios = require('axios');

async function testStatistics() {
  try {
    console.log('Testing statistics endpoints...');
    
    const endpoints = [
      'http://localhost:5002/api/statistics/dashboard',
      'http://localhost:5002/api/statistics/timeline',
      'http://localhost:5002/api/statistics/staff-performance',
      'http://localhost:5002/api/statistics/kpi'
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`\nTesting: ${endpoint}`);
        const response = await axios.get(endpoint, {
          headers: {
            'Content-Type': 'application/json'
          }
        });
        console.log(`✅ Success: ${response.status}`);
        console.log('Data keys:', Object.keys(response.data));
      } catch (error) {
        console.log(`❌ Error: ${error.response?.status || error.message}`);
        if (error.response?.data) {
          console.log('Error details:', error.response.data);
        }
      }
    }
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testStatistics();