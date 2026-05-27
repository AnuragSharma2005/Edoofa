const { appendToGoogleSheet } = require('../services/sheets');
require('dotenv').config();

async function runTest() {
  const dummy = {
    Date: new Date().toISOString().split('T')[0],
    SequentialId: `test_${Date.now()}`,
    Student: 'Test Student',
    Sender: 'Student',
    Transcript: 'This is a test transcript for verifying Sheets integration.',
    Summary: 'Test summary',
    ActionItem: 'No action required.',
    Priority: 'Low',
    Sentiment: 'Neutral',
    Timestamp: new Date().toISOString()
  };

  const ok = await appendToGoogleSheet(dummy);
  console.log('Sheets test result:', ok);
}

runTest().catch(err => console.error('Test script error:', err));
