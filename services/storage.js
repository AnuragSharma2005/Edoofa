const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const AUDIO_DIR = path.resolve(process.env.AUDIO_DIR || './data/audio');
const MOCK_SHEET_PATH = path.resolve(process.env.MOCK_SHEET_PATH || './data/mock_sheets.json');

// Ensure directories exist
function initStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[Storage] Created data directory: ${DATA_DIR}`);
  }
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    console.log(`[Storage] Created audio directory: ${AUDIO_DIR}`);
  }
  if (!fs.existsSync(MOCK_SHEET_PATH)) {
    fs.writeFileSync(MOCK_SHEET_PATH, JSON.stringify([], null, 2), 'utf8');
    console.log(`[Storage] Created mock sheets JSON file: ${MOCK_SHEET_PATH}`);
  }
}

// Get all records in mock sheet
function getRecords() {
  initStorage();
  try {
    const data = fs.readFileSync(MOCK_SHEET_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[Storage] Error reading mock sheet:', error);
    return [];
  }
}

// Save records to mock sheet
function saveRecords(records) {
  initStorage();
  try {
    fs.writeFileSync(MOCK_SHEET_PATH, JSON.stringify(records, null, 2), 'utf8');
  } catch (error) {
    console.error('[Storage] Error saving mock sheet:', error);
  }
}

// Generate sequential ID for a student on a specific date
// Format: StudentName_YYYY-MM-DD_001
function generateSequentialId(studentName, dateStr) {
  const records = getRecords();
  
  // Normalize date and student name
  const targetDate = dateStr || new Date().toISOString().split('T')[0];
  const normalizedStudent = (studentName || 'Unknown_Student').trim();
  
  // Filter records for the same student and date
  const todaysStudentRecords = records.filter(r => {
    // Check if record date matches and student matches (case-insensitive)
    const recDate = r.Date || (r.Timestamp ? r.Timestamp.split('T')[0] : '');
    return recDate === targetDate && r.Student.toLowerCase() === normalizedStudent.toLowerCase();
  });
  
  // Find highest index
  let maxIdx = 0;
  todaysStudentRecords.forEach(r => {
    if (r.SequentialId) {
      const parts = r.SequentialId.split('_');
      const idxStr = parts[parts.length - 1];
      const idx = parseInt(idxStr, 10);
      if (!isNaN(idx) && idx > maxIdx) {
        maxIdx = idx;
      }
    }
  });
  
  const nextIdx = maxIdx + 1;
  const seqStr = String(nextIdx).padStart(3, '0');
  
  // Return clean ID (replace spaces and special chars in student name with underscores if needed, or keep it readable)
  const cleanStudentName = normalizedStudent.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
  return `${cleanStudentName}_${targetDate}_${seqStr}`;
}

// Add a new row/record
function addRecord(record) {
  initStorage();
  const records = getRecords();
  
  const dateStr = record.Date || new Date().toISOString().split('T')[0];
  const seqId = generateSequentialId(record.Student, dateStr);
  
  const newRecord = {
    id: seqId,
    SequentialId: seqId,
    Date: dateStr,
    Student: record.Student || 'Unknown Student',
    Sender: record.Sender || 'Student', // 'Student', 'Parent', or 'Mentor'
    Transcript: record.Transcript || '',
    Summary: record.Summary || '',
    ActionItem: record.ActionItem || '',
    Priority: record.Priority || 'Medium', // 'Low', 'Medium', 'High'
    Sentiment: record.Sentiment || 'Neutral', // 'Positive', 'Neutral', 'Negative'
    AudioPath: record.AudioPath || '',
    AudioUrl: record.AudioUrl || '',
    Timestamp: record.Timestamp || new Date().toISOString(),
    Notes: record.Notes || ''
  };
  
  records.unshift(newRecord); // Add to beginning so it displays newest first on dashboard
  saveRecords(records);
  console.log(`[Storage] Added new record for ${newRecord.Student} with ID ${newRecord.SequentialId}`);
  return newRecord;
}

// Save raw audio buffer or temp file to permanent local storage
function saveAudioFile(fileBuffer, fileName) {
  initStorage();
  const filePath = path.join(AUDIO_DIR, fileName);
  fs.writeFileSync(filePath, fileBuffer);
  console.log(`[Storage] Saved audio file to ${filePath}`);
  return filePath;
}

// Save file from an existing path
function saveAudioFromPath(tempPath, fileName) {
  initStorage();
  const destPath = path.join(AUDIO_DIR, fileName);
  fs.copyFileSync(tempPath, destPath);
  console.log(`[Storage] Saved audio from ${tempPath} to ${destPath}`);
  return destPath;
}

module.exports = {
  initStorage,
  getRecords,
  addRecord,
  saveAudioFile,
  saveAudioFromPath,
  generateSequentialId,
  AUDIO_DIR,
  DATA_DIR
};
