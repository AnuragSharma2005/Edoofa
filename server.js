const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const storage = require('./services/storage');
const ai = require('./services/ai');
const sheets = require('./services/sheets');
const whatsapp = require('./services/whatsapp');
const pipeline = require('./services/pipeline');

// Initialize local folders
storage.initStorage();

const app = express();
const PORT = process.env.PORT || 3000;

// Setup temp folder for simulation uploads
const tempDir = path.resolve(storage.DATA_DIR, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Multer storage configuration for simulator audio uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.mp3';
      cb(null, `sim_${Date.now()}${ext}`);
    }
  })
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Dashboard static files
app.use(express.static(path.join(__dirname, 'public')));
// Serve stored voice notes
app.use('/audio', express.static(storage.AUDIO_DIR));

// SSE (Server-Sent Events) clients
let sseClients = [];

// SSE Subscription Endpoint for real-time logs and status
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  res.write('\n');
  
  sseClients.push(res);
  console.log(`[Server] New client connected to SSE. Total active clients: ${sseClients.length}`);
  
  // Immediately send current WhatsApp client status
  const currentStatus = whatsapp.getStatus();
  res.write(`event: status_update\ndata: ${JSON.stringify(currentStatus)}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
    console.log(`[Server] Client disconnected from SSE. Total active clients: ${sseClients.length}`);
  });
});

/**
 * Broadcast event to all connected SSE clients
 * @param {string} eventName 
 * @param {Object} data 
 */
function broadcastEvent(eventName, data) {
  sseClients.forEach(client => {
    client.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  });
}

// Register broadcasters in our services
whatsapp.registerBroadcastCallback(broadcastEvent);
pipeline.registerPipelineCallback(broadcastEvent);

// API: Get logs/records
app.get('/api/records', (req, res) => {
  const records = storage.getRecords();
  res.json(records);
});

// API: Get WhatsApp status
app.get('/api/status', (req, res) => {
  res.json(whatsapp.getStatus());
});

// API: Reconnect/Restart WhatsApp bot
app.post('/api/whatsapp/restart', (req, res) => {
  console.log('[Server] Reconnecting WhatsApp client...');
  whatsapp.initWhatsAppClient();
  res.json({ success: true, message: 'WhatsApp bot re-initialization triggered.' });
});

// API: Settings configuration (writes directly to .env and hot-swaps active configurations!)
app.post('/api/settings', (req, res) => {
  const { openaiKey, groqKey, spreadsheetId, sheetName } = req.body;
  
  try {
    const envPath = path.resolve('.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Update individual values or append them
    const updates = {
      'OPENAI_API_KEY': openaiKey,
      'GROQ_API_KEY': groqKey,
      'GOOGLE_SPREADSHEET_ID': spreadsheetId,
      'GOOGLE_SHEET_NAME': sheetName || 'Sheet1'
    };

    let lines = envContent.split('\n');
    Object.entries(updates).forEach(([key, val]) => {
      if (val === undefined) return;
      
      const regex = new RegExp(`^${key}=.*`);
      let found = false;
      
      lines = lines.map(line => {
        if (regex.test(line.trim())) {
          found = true;
          return `${key}=${val}`;
        }
        return line;
      });
      
      if (!found) {
        lines.push(`${key}=${val}`);
      }
    });

    fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
    console.log('[Server] .env file successfully updated via Settings API.');

    // Hot-reload env variables
    process.env.OPENAI_API_KEY = openaiKey;
    process.env.GROQ_API_KEY = groqKey;
    process.env.GOOGLE_SPREADSHEET_ID = spreadsheetId;
    process.env.GOOGLE_SHEET_NAME = sheetName || 'Sheet1';

    // Re-initialize active services with new credentials
    sheets.initGoogleSheets();
    
    // Re-init API key status inside AI service by hot-clearing module cache
    if ((openaiKey && openaiKey.trim() !== '') || (groqKey && groqKey.trim() !== '')) {
      delete require.cache[require.resolve('./services/ai')];
      require('./services/ai');
      console.log('[Server] AI service refreshed with new key credentials.');
    }

    // Broadcast reload event to the dashboard
    broadcastEvent('settings_updated', { message: 'Settings successfully applied!' });
    
    res.json({ success: true, message: 'Settings saved and applied successfully!' });
  } catch (error) {
    console.error('[Server] Failed to write settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Pipeline Simulator
// Triggers complete transcription, analysis, and spreadsheet entry manually
app.post('/api/simulate', upload.single('audio'), async (req, res) => {
  const { studentName, declaredSender } = req.body;
  const file = req.file;

  if (!studentName || studentName.trim() === '') {
    return res.status(400).json({ success: false, error: 'Student/Group name is required' });
  }

  try {
    let finalAudioPath;
    
    if (file) {
      // User uploaded a real audio file
      console.log(`[Simulator] Uploaded file received: ${file.originalname}`);
      const fileExt = path.extname(file.originalname) || '.mp3';
      const cleanStudent = studentName.trim().replace(/\s+/g, '_');
      const timestampStr = new Date().toISOString().replace(/[^a-zA-Z0-9]/g, '_');
      const targetFileName = `sim_${cleanStudent}_${timestampStr}${fileExt}`;
      
      // Move from temp folder to permanent storage
      finalAudioPath = storage.saveAudioFromPath(file.path, targetFileName);
      
      // Clean up uploaded temp file
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('[Simulator] Temp cleanup error:', err.message);
      }
    } else {
      // Use fallback pre-recorded placeholder
      console.log('[Simulator] No audio file uploaded. Using virtual voice note simulation.');
      
      // Create a small placeholder txt or copy an empty ogg file to represent it
      const timestampStr = new Date().toISOString().replace(/[^a-zA-Z0-9]/g, '_');
      const targetFileName = `sim_virtual_${studentName.trim().replace(/\s+/g, '_')}_${timestampStr}.mp3`;
      const placeholderPath = path.join(storage.AUDIO_DIR, targetFileName);
      
      // Write a tiny dummy mp3 byte structure so Whisper/fs doesn't crash on empty
      // A valid silence or a tiny file. Whisper will fail on dummy if key is active,
      // but if key is active we want real audio. If it's mock, dummy works!
      // Let's write a small buffer:
      fs.writeFileSync(placeholderPath, Buffer.from([0x24, 0x49, 0x44, 0x33])); // ID3 header
      finalAudioPath = placeholderPath;
    }

    // Launch pipeline in background and respond immediately so dashboard gets live steps!
    pipeline.processVoicePipeline({
      audioPath: finalAudioPath,
      studentName: studentName.trim(),
      declaredSender: declaredSender || 'Student',
      metadata: {
        senderContactName: 'Simulator Console',
        senderPhoneNumber: '1234567890',
        timestamp: new Date().toISOString()
      }
    }).then(record => {
      console.log('[Simulator] Background simulation pipeline succeeded.');
    }).catch(err => {
      console.error('[Simulator] Background simulation pipeline failed:', err.message);
    });

    res.json({ 
      success: true, 
      message: 'Simulation pipeline initialized in background. Track progress in the dashboard log!' 
    });

  } catch (error) {
    console.error('[Simulator] Error in simulation route:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Boot Server & Initialize WhatsApp Client
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  EDOOFA VOICE NOTE AI AUTOMATION SYSTEM STARTED      `);
  console.log(`  Dashboard: http://localhost:${PORT}                 `);
  console.log(`======================================================\n`);
  
  // Proactively start WhatsApp Web automation in the background
  // (Will try to launch chrome, fails gracefully if libraries missing)
  whatsapp.initWhatsAppClient();
});
