// models/Subscription.js
const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  // Token của thiết bị
  pushToken: {
    type: String,
    required: true,
    unique: true,
  },
  
  // (Module 2.2) Ngưỡng AQI
  alertThreshold: {
    type: Number,
    default: 150,
  },
  
  // (Module 2.2) Vị trí để kiểm tra AQI
  defaultLocation: {
    type: String,
    required: true,
  },

  // (MỚI) DÀNH CHO MODULE 6.2 (Nhắc rác)
  recycleReminderEnabled: {
    type: Boolean,
    default: false,
  },
  recycleReminderDay: {
    type: String, // Sẽ lưu 'T2', 'T3', 'T6', v.v.
    default: null,
  },
  
  lastNotified: {
    type: Date,
    default: null,
  }
});

module.exports = mongoose.model('Subscription', subscriptionSchema);