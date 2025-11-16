// models/Subscription.js
const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({

  pushToken: {
    type: String,
    required: true,
    unique: true,
  },
  

  alertThreshold: {
    type: Number,
    default: 150,
  },
  

  defaultLocation: {
    type: String,
    required: true,
  },


  recycleReminderEnabled: {
    type: Boolean,
    default: false,
  },
  recycleReminderDay: {
    type: String, 
    default: null,
  },
  
  lastNotified: {
    type: Date,
    default: null,
  }
});

module.exports = mongoose.model('Subscription', subscriptionSchema);
