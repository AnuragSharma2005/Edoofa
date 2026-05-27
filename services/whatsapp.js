const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Global WhatsApp State
let client = null;
let connectionStatus = 'Disconnected'; // 'Disconnected', 'Scanning', 'Connecting', 'Ready', 'Error'
let qrCodeUrl = null;
let sseBroadcastCallback = null;

/**
 * Registers a callback function to broadcast real-time events to the dashboard
 * @param {Function} callback 
 */
function registerBroadcastCallback(callback) {
  sseBroadcastCallback = callback;
}

/**
 * Helper to trigger dashboard status updates
 */
function broadcastStatus() {
  if (sseBroadcastCallback) {
    sseBroadcastCallback('status_update', {
      status: connectionStatus,
      qrUrl: qrCodeUrl
    });
  }
}

async function initWhatsAppClient() {
  console.log('[WhatsApp Bot] Initializing WhatsApp Web Client...');
  connectionStatus = 'Connecting';
  broadcastStatus();

  try {
    // If a client already exists, let's try to destroy it to release Puppeteer folder locks
    if (client) {
      try {
        console.log('[WhatsApp Bot] Destroying existing client to release session locks...');
        await client.destroy();
      } catch (err) {
        console.log('[WhatsApp Bot] Non-critical error destroying previous client:', err.message);
      }
      client = null;
    }

    // Determine session path
    const sessionDir = path.resolve(process.env.WHATSAPP_SESSION_PATH || './.wwebjs_auth');
    
    // Puppeteer arguments to ensure compatibility in standard, headless, and sandbox environments
    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: sessionDir
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    // QR Code Event
    client.on('qr', async (qr) => {
      console.log('[WhatsApp Bot] QR Code received. Scan this QR on WhatsApp Web.');
      connectionStatus = 'Scanning';
      try {
        // Convert text QR code into a base64 Data URL for easy rendering in our HTML dashboard
        qrCodeUrl = await QRCode.toDataURL(qr);
        broadcastStatus();
      } catch (err) {
        console.error('[WhatsApp Bot] Error converting QR code to Data URL:', err);
      }
    });

    // Authenticated Event
    client.on('authenticated', () => {
      console.log('[WhatsApp Bot] WhatsApp Authenticated successfully!');
      connectionStatus = 'Connecting';
      qrCodeUrl = null;
      broadcastStatus();
    });

    // Ready Event
    client.on('ready', () => {
      console.log('[WhatsApp Bot] WhatsApp Client is READY and listening for messages!');
      connectionStatus = 'Ready';
      qrCodeUrl = null;
      broadcastStatus();
    });

    // Auth Failure Event
    client.on('auth_failure', (msg) => {
      console.error('[WhatsApp Bot] Authentication failure:', msg);
      connectionStatus = 'Disconnected';
      qrCodeUrl = null;
      broadcastStatus();
    });

    // Disconnected Event
    client.on('disconnected', (reason) => {
      console.log('[WhatsApp Bot] Client was disconnected:', reason);
      connectionStatus = 'Disconnected';
      qrCodeUrl = null;
      broadcastStatus();
    });

    // Active Message Receiver Handler (use 'message' to capture incoming messages reliably)
    client.on('message', async (message) => {
      try {
        // Determine group message robustly: group JIDs often end with @g.us or contain a hyphen,
        // and group messages set `author`. Some linked device IDs may use other suffixes.
        const fromVal = message.from || '';
        const isGroup = fromVal.endsWith('@g.us') || !!message.author || fromVal.includes('-');

        // Print a detailed diagnostic log so we can see what type of message WhatsApp is registering!
        const debugPayload = {
          from: fromVal,
          author: message.author || null,
          type: message.type,
          hasMedia: message.hasMedia,
          mimetype: message.mimetype || null,
          bodyPreview: message.body ? message.body.substring(0, 60) : null
        };
        console.log('[WhatsApp Bot] [Msg Debug]', debugPayload);

        // Emit a lightweight SSE debug event so the dashboard receives raw incoming message notices
        if (sseBroadcastCallback) {
          try {
            sseBroadcastCallback('pipeline_activity', {
              step: 'incoming_message',
              student: fromVal,
              message: `Incoming message type=${message.type} hasMedia=${message.hasMedia}`,
              debug: debugPayload
            });
          } catch (e) {
            console.log('[WhatsApp Bot] Failed to broadcast incoming_message SSE:', e.message);
          }
        }

        // Expand the isVoice check to capture 'ptt' (Push-To-Talk) or document audios
        const voiceTypes = ['voice', 'audio', 'ptt', 'document'];
        const isAudioMimetype = message.mimetype && message.mimetype.startsWith && message.mimetype.startsWith('audio');
        const isVoice = message.hasMedia && (voiceTypes.includes(message.type) || isAudioMimetype);

        if (isVoice && isGroup) {
          console.log(`[WhatsApp Bot] Incoming Voice Note detected in Group Chat: ${message.from}`);
          await handleIncomingVoiceNote(message);
        } else if (isGroup && !isVoice) {
          console.log('[WhatsApp Bot] Group message received but not identified as voice note.');
        }
      } catch (err) {
        console.error('[WhatsApp Bot] Error filtering message:', err);
      }
    });

    // Launch WhatsApp client
    client.initialize().catch(err => {
      console.error('[WhatsApp Bot] Initialization error caught during boot:', err.message);
      connectionStatus = 'Error';
      broadcastStatus();
    });

  } catch (error) {
    console.error('[WhatsApp Bot] FAILED to launch whatsapp-web.js client:', error.message);
    console.log('[WhatsApp Bot] Tip: The server is still fully running! You can still use the beautiful Dashboard Simulator to test everything without any setup.');
    connectionStatus = 'Error';
    broadcastStatus();
  }
}

/**
 * Process a real incoming WhatsApp voice note
 * @param {Object} message - whatsapp-web.js Message object
 */
async function handleIncomingVoiceNote(message) {
  try {
    if (sseBroadcastCallback) {
      sseBroadcastCallback('pipeline_activity', {
        step: 'capture',
        student: 'Detecting...',
        message: 'Voice note captured from WhatsApp Group'
      });
    }

    // 1. Get chat details (Group Name usually represents the Student group)
    const chat = await message.getChat();
    const groupName = (chat && chat.name) ? chat.name : null;

    // 2. Get sender contact details (Identify Mentor vs. Student/Parent)
    const contact = await message.getContact();
    const senderContactName = contact && (contact.pushname || contact.name) ? (contact.pushname || contact.name) : (message.author || message.from);
    const senderPhoneNumber = message.author ? message.author.split('@')[0] : message.from.split('@')[0];

    // If this is a group message, we want to preserve both GroupName and SenderName.
    // Build a combined label for the Student column like: "GroupName / SenderName" when group is meaningful.
    const genericGroupRegex = /edoofa|voice|group|general|batch/i;
    let studentName;
    if (groupName && !genericGroupRegex.test(groupName)) {
      studentName = `${groupName} / ${senderContactName}`;
    } else {
      // Fallback to sender name when group name is missing or generic
      studentName = senderContactName;
    }

    console.log(`[WhatsApp Bot] Processing Voice Note from: ${senderContactName} (${senderPhoneNumber}) in Group: ${groupName || 'N/A'} -> Stored Student: ${studentName}`);

    if (sseBroadcastCallback) {
      sseBroadcastCallback('pipeline_activity', {
        step: 'download',
        student: studentName,
        message: `Downloading audio note from ${senderContactName}...`
      });
    }

    // 3. Download the media
    const media = await message.downloadMedia();
    if (!media || !media.data) {
      throw new Error('Downloaded media was empty');
    }

    // Convert media to a local buffer
    const audioBuffer = Buffer.from(media.data, 'base64');
    
    // Generate distinct file name
    const timestampStr = new Date().toISOString().replace(/[^a-zA-Z0-9]/g, '_');
    const audioFileName = `wa_${studentName.replace(/\s+/g, '_')}_${timestampStr}.ogg`;
    
    // Save locally
    const storage = require('./storage');
    const savedPath = storage.saveAudioFile(audioBuffer, audioFileName);

    // 4. Run through processing pipeline
    const pipeline = require('./pipeline');
    
    // Pass to pipeline
    // Let's assume declaredSender is resolved dynamically inside pipeline using prompt engineering, 
    // but we can pass the sender's phone and nickname as context!
    await pipeline.processVoicePipeline({
      audioPath: savedPath,
      studentName: studentName,
      declaredSender: null, // Let GPT determine based on transcript, but we pass metadata
      metadata: {
        senderContactName,
        senderPhoneNumber,
        groupName: groupName || null,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[WhatsApp Bot] Error handling voice note:', error);
    if (sseBroadcastCallback) {
      sseBroadcastCallback('pipeline_activity', {
        step: 'error',
        student: 'Failed',
        message: `Error processing voice note: ${error.message}`
      });
    }
  }
}

/**
 * Returns the current status of the WhatsApp Bot client
 */
function getStatus() {
  return {
    status: connectionStatus,
    qrUrl: qrCodeUrl
  };
}

module.exports = {
  initWhatsAppClient,
  registerBroadcastCallback,
  getStatus,
  broadcastStatus
};
