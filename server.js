const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const SensorReading = require('./models/SensorReading');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory fallback buffer (holds up to 500 recent readings if MongoDB is not connected)
const memoryReadings = [];
const MAX_MEMORY_READINGS = 500;

let isMongoConnected = false;

// ================= MONGODB ATLAS CONNECTION =================
if (MONGODB_URI && MONGODB_URI.trim() !== '' && !MONGODB_URI.includes('<password>')) {
  mongoose
    .connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    })
    .then(() => {
      isMongoConnected = true;
      console.log('✅ [DATABASE] Successfully connected to MongoDB Atlas');
    })
    .catch((err) => {
      isMongoConnected = false;
      console.warn('⚠️  [DATABASE] MongoDB Atlas connection warning:', err.message);
      console.log('💡 [DATABASE] Operating with in-memory buffer until database is reached.');
    });

  mongoose.connection.on('connected', () => {
    isMongoConnected = true;
  });

  mongoose.connection.on('disconnected', () => {
    isMongoConnected = false;
    console.warn('⚠️  [DATABASE] Disconnected from MongoDB Atlas');
  });
} else {
  console.log('ℹ️  [DATABASE] No valid MONGODB_URI found in .env.');
  console.log('💡 [DATABASE] Operating in In-Memory mode. Readings will be stored in RAM.');
  console.log('👉 [DATABASE] To connect MongoDB Atlas, set MONGODB_URI in your .env file.');
}

// Helper to sanitize IP
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// =========================================================================
// ENDPOINT: POST /tempstore
// Called directly by the ESP8266 / ESP8255 microcontroller
// =========================================================================
app.post('/tempstore', async (req, res) => {
  try {
    const { leftTemperature, rightTemperature, frequency } = req.body;

    // Validate payload
    if (
      leftTemperature === undefined ||
      rightTemperature === undefined ||
      frequency === undefined
    ) {
      return res.status(400).json({
        success: false,
        error: 'Missing required telemetry fields: leftTemperature, rightTemperature, or frequency.'
      });
    }

    const left = parseFloat(leftTemperature);
    const right = parseFloat(rightTemperature);
    const freq = parseFloat(frequency);

    if (isNaN(left) || isNaN(right) || isNaN(freq)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid numeric data received in telemetry payload.'
      });
    }

    const deviceIp = getClientIp(req);
    const now = new Date();

    const readingData = {
      leftTemperature: parseFloat(left.toFixed(2)),
      rightTemperature: parseFloat(right.toFixed(2)),
      isRightEstimated: true,
      frequency: parseFloat(freq.toFixed(2)),
      deviceIp,
      timestamp: now
    };

    let savedDoc = null;
    let storageTarget = 'memory';

    // Store in MongoDB if available
    if (isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        savedDoc = await SensorReading.create(readingData);
        storageTarget = 'mongodb';
      } catch (dbErr) {
        console.error('Error saving to MongoDB, falling back to memory:', dbErr.message);
      }
    }

    // Always maintain in-memory buffer for ultra-fast dashboard queries
    const memEntry = savedDoc ? savedDoc.toObject() : { ...readingData, _id: 'mem_' + Date.now() };
    memoryReadings.unshift(memEntry);
    if (memoryReadings.length > MAX_MEMORY_READINGS) {
      memoryReadings.pop();
    }

    console.log(
      `📡 [ESP8266] Telemetry Saved (${storageTarget.toUpperCase()}): Left: ${readingData.leftTemperature}°C | Right: ${readingData.rightTemperature}°C (Est) | Freq: ${readingData.frequency}Hz | IP: ${deviceIp}`
    );

    return res.status(200).json({
      success: true,
      message: 'Telemetry received and recorded successfully.',
      storage: storageTarget,
      data: memEntry
    });
  } catch (error) {
    console.error('Server error in /tempstore:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error while processing sensor packet.'
    });
  }
});

// =========================================================================
// API: GET /api/readings
// Fetch historical sensor data with limit parameter (default: 50)
// =========================================================================
app.get('/api/readings', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);

    if (isMongoConnected && mongoose.connection.readyState === 1) {
      const readings = await SensorReading.find()
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      return res.json({
        success: true,
        count: readings.length,
        storage: 'mongodb',
        data: readings
      });
    }

    // Return in-memory data
    const sliced = memoryReadings.slice(0, limit);
    return res.json({
      success: true,
      count: sliced.length,
      storage: 'memory',
      data: sliced
    });
  } catch (error) {
    console.error('Error fetching readings:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch readings.' });
  }
});

// =========================================================================
// API: GET /api/readings/latest
// Fetch single most recent telemetry packet
// =========================================================================
app.get('/api/readings/latest', async (req, res) => {
  try {
    if (isMongoConnected && mongoose.connection.readyState === 1) {
      const latest = await SensorReading.findOne().sort({ timestamp: -1 }).lean();
      if (latest) {
        return res.json({ success: true, data: latest, storage: 'mongodb' });
      }
    }

    if (memoryReadings.length > 0) {
      return res.json({ success: true, data: memoryReadings[0], storage: 'memory' });
    }

    return res.json({ success: true, data: null, storage: 'none' });
  } catch (error) {
    console.error('Error fetching latest reading:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch latest reading.' });
  }
});

// =========================================================================
// API: GET /api/readings/stats
// Computes summary metrics, connection status, and averages
// =========================================================================
app.get('/api/readings/stats', async (req, res) => {
  try {
    let sourceData = [];

    if (isMongoConnected && mongoose.connection.readyState === 1) {
      sourceData = await SensorReading.find().sort({ timestamp: -1 }).limit(100).lean();
    } else {
      sourceData = memoryReadings.slice(0, 100);
    }

    if (sourceData.length === 0) {
      return res.json({
        success: true,
        stats: {
          totalReadings: 0,
          deviceStatus: 'offline',
          lastSeenSecondsAgo: null,
          avgLeftTemp: null,
          minLeftTemp: null,
          maxLeftTemp: null,
          avgRightTemp: null,
          minRightTemp: null,
          maxRightTemp: null,
          avgFrequency: null,
          dbConnected: isMongoConnected
        }
      });
    }

    const latest = sourceData[0];
    const now = new Date();
    const lastSeenMs = now - new Date(latest.timestamp);
    const lastSeenSeconds = Math.floor(lastSeenMs / 1000);

    // ESP8266 sends every 2 minutes (120s).
    // Online if < 150s, Standby if < 300s, Offline if > 300s.
    let deviceStatus = 'offline';
    if (lastSeenSeconds <= 150) {
      deviceStatus = 'online';
    } else if (lastSeenSeconds <= 300) {
      deviceStatus = 'idle';
    }

    const leftTemps = sourceData.map((d) => d.leftTemperature);
    const rightTemps = sourceData.map((d) => d.rightTemperature);
    const freqs = sourceData.map((d) => d.frequency);

    const sum = (arr) => arr.reduce((a, b) => a + b, 0);

    return res.json({
      success: true,
      stats: {
        totalReadings: sourceData.length,
        deviceStatus,
        lastSeenSecondsAgo: lastSeenSeconds,
        latestReading: latest,
        avgLeftTemp: parseFloat((sum(leftTemps) / leftTemps.length).toFixed(2)),
        minLeftTemp: Math.min(...leftTemps),
        maxLeftTemp: Math.max(...leftTemps),
        avgRightTemp: parseFloat((sum(rightTemps) / rightTemps.length).toFixed(2)),
        minRightTemp: Math.min(...rightTemps),
        maxRightTemp: Math.max(...rightTemps),
        avgFrequency: parseFloat((sum(freqs) / freqs.length).toFixed(2)),
        minFrequency: Math.min(...freqs),
        maxFrequency: Math.max(...freqs),
        dbConnected: isMongoConnected
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({ success: false, error: 'Failed to compute telemetry stats.' });
  }
});

// =========================================================================
// API: POST /api/readings/simulate
// Useful testing utility to simulate ESP8266 data from dashboard
// =========================================================================
app.post('/api/readings/simulate', async (req, res) => {
  try {
    // Generate realistic neck temperature (35.8 - 37.4 °C)
    const baseTemp = req.body.leftTemperature
      ? parseFloat(req.body.leftTemperature)
      : parseFloat((36.2 + Math.random() * 0.9).toFixed(2));

    const offset = req.body.rightOffset ? parseFloat(req.body.rightOffset) : 0.2;
    const rightTemp = parseFloat((baseTemp + offset).toFixed(2));

    // Realistic throat frequency (85 - 240 Hz)
    const freq = req.body.frequency
      ? parseFloat(req.body.frequency)
      : parseFloat((110 + Math.random() * 60).toFixed(2));

    const mockReading = {
      leftTemperature: baseTemp,
      rightTemperature: rightTemp,
      isRightEstimated: true,
      frequency: freq,
      deviceIp: 'simulator.local',
      timestamp: new Date()
    };

    let savedDoc = null;
    let storageTarget = 'memory';

    if (isMongoConnected && mongoose.connection.readyState === 1) {
      savedDoc = await SensorReading.create(mockReading);
      storageTarget = 'mongodb';
    }

    const memEntry = savedDoc ? savedDoc.toObject() : { ...mockReading, _id: 'sim_' + Date.now() };
    memoryReadings.unshift(memEntry);
    if (memoryReadings.length > MAX_MEMORY_READINGS) memoryReadings.pop();

    return res.json({
      success: true,
      message: 'Simulated packet recorded successfully.',
      storage: storageTarget,
      data: memEntry
    });
  } catch (err) {
    console.error('Error creating simulated reading:', err);
    return res.status(500).json({ success: false, error: 'Simulation failed.' });
  }
});

// =========================================================================
// API: DELETE /api/readings
// Clear historical records (useful during setup/testing)
// =========================================================================
app.delete('/api/readings', async (req, res) => {
  try {
    memoryReadings.length = 0;

    let mongoDeleted = 0;
    if (isMongoConnected && mongoose.connection.readyState === 1) {
      const result = await SensorReading.deleteMany({});
      mongoDeleted = result.deletedCount;
    }

    return res.json({
      success: true,
      message: 'Telemetry records purged.',
      deletedMongoCount: mongoDeleted
    });
  } catch (err) {
    console.error('Error clearing readings:', err);
    return res.status(500).json({ success: false, error: 'Failed to clear telemetry data.' });
  }
});

// =========================================================================
// HEALTHCHECK & CATCH-ALL
// =========================================================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: isMongoConnected ? 'connected' : 'memory_fallback',
    memoryCacheCount: memoryReadings.length
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start listening on 0.0.0.0 for cloud hosting (Render) & local networks
app.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(`🚀 NeckHofis Telemetry Server running on port ${PORT}`);
  console.log(`🌐 Dashboard:    http://localhost:${PORT}`);
  console.log(`📡 ESP Endpoint: http://localhost:${PORT}/tempstore`);
  console.log(`📊 Health Check: http://localhost:${PORT}/api/health`);
  console.log('====================================================');
});
