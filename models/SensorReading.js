const mongoose = require('mongoose');

const sensorReadingSchema = new mongoose.Schema(
  {
    leftTemperature: {
      type: Number,
      required: [true, 'Left temperature is required'],
      min: [-50, 'Temperature cannot be below -50°C'],
      max: [150, 'Temperature cannot exceed 150°C']
    },
    rightTemperature: {
      type: Number,
      required: [true, 'Right temperature is required'],
      min: [-50, 'Temperature cannot be below -50°C'],
      max: [150, 'Temperature cannot exceed 150°C']
    },
    isRightEstimated: {
      type: Boolean,
      default: true
    },
    frequency: {
      type: Number,
      required: [true, 'Microphone frequency is required'],
      min: [0, 'Frequency cannot be negative']
    },
    deviceIp: {
      type: String,
      default: 'unknown'
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Compound index for efficient time-series querying
sensorReadingSchema.index({ timestamp: -1 });

module.exports = mongoose.model('SensorReading', sensorReadingSchema);
