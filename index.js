// index.js
const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const axios = require('axios');
const { Expo } = require('expo-server-sdk');
require('dotenv').config(); 

const Subscription = require('./models/Subscription'); 
const app = express();
app.use(express.json()); 


let expo = new Expo();


mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Đã kết nối MongoDB'))
  .catch(err => console.error('Lỗi MongoDB:', err));




app.post('/register-push', async (req, res) => {
  
  const { 
    pushToken, 
    alertThreshold, 
    defaultLocation,
    recycleSettings 
  } = req.body;

  if (!pushToken || !defaultLocation) {
    return res.status(400).json({ error: 'Thiếu pushToken hoặc defaultLocation' });
  }

  try {
    const subscription = await Subscription.findOneAndUpdate(
      { pushToken: pushToken }, 
      { 
        pushToken: pushToken,
        alertThreshold: alertThreshold || 150, 
        defaultLocation: defaultLocation,
        
        recycleReminderEnabled: recycleSettings?.enabled || false,
        recycleReminderDay: recycleSettings?.day || null,
      },
      { 
        upsert: true, 
        new: true, 
      }
    );
    
    console.log(`Đã đăng ký/cập nhật token: ${pushToken}`);
    res.status(201).json({ message: 'Đăng ký thành công', data: subscription });

  } catch (error) {
    console.error('Lỗi đăng ký token:', error);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});


app.post('/admin/send-campaign', async (req, res) => {
  const { title, message } = req.body;

  if (!title || !message) {
    return res.status(400).json({ error: 'Thiếu tiêu đề hoặc nội dung' });
  }

  try {
    
    const subscriptions = await Subscription.find({});
    const pushTokens = subscriptions.map(sub => sub.pushToken);
    
    console.log(`📣 Đang gửi chiến dịch cho ${pushTokens.length} người dùng...`);

    
    let messages = [];
    for (let pushToken of pushTokens) {
      if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`Token không hợp lệ: ${pushToken}`);
        continue;
      }
      messages.push({
        to: pushToken,
        sound: 'default',
        title: title, 
        body: message, 
      });
    }

    
    let chunks = expo.chunkPushNotifications(messages);
    for (let chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }

    res.status(200).json({ message: `Đã gửi chiến dịch đến ${messages.length} người dùng.` });

  } catch (error) {
    console.error('Lỗi gửi chiến dịch:', error);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

async function checkAqiAndNotify() {
  console.log('Chạy tác vụ kiểm tra AQI + Thời tiết');
  
  try {
    const subscriptions = await Subscription.find({ alertThreshold: { $exists: true } });
    
    for (const sub of subscriptions) {
      try {
        
        const aqiResponse = await axios.get(
          `https://api.waqi.info/feed/${sub.defaultLocation}/?token=${process.env.AQI_API_TOKEN}`
        );

        if (aqiResponse.data.status !== 'ok') {
          console.log(`Lỗi AQI cho ${sub.defaultLocation}`);
          continue; 
        }

        const aqiData = aqiResponse.data.data;
        const currentAqi = aqiData.aqi;
        const city = aqiData.city.name;
        const [lat, lon] = aqiData.city.geo; 

        
        const weatherResponse = await axios.get(
          `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric&lang=vi`
        );
        const weatherDesc = weatherResponse.data.weather[0].description; 

        
        if (currentAqi > sub.alertThreshold) {
          if (!Expo.isExpoPushToken(sub.pushToken)) { continue; }

          
          let body = `AQI tại ${city} hiện là ${currentAqi} (ngưỡng của bạn: ${sub.alertThreshold}).`;
          
          
          if (weatherDesc.includes('sương mù')) {
            body += ` Thời tiết: ${weatherDesc}. Ô nhiễm có thể nghiêm trọng hơn.`;
          } else if (weatherDesc.includes('mưa')) {
             body += ` Thời tiết: ${weatherDesc}. Chất lượng không khí có thể sớm cải thiện.`;
          }

          
          await expo.sendPushNotificationsAsync([
            {
              to: sub.pushToken,
              sound: 'default',
              title: `Cảnh báo Chất lượng Không khí!`,
              body: body, 
            },
          ]);
          console.log(`!!! (6.3) Đã gửi cảnh báo AQI + Thời tiết cho ${city}`);
        }
      } catch (err) {
        console.error(`Lỗi khi xử lý cho ${sub.pushToken}:`, err.message);
      }
    }
  } catch (error) {
    console.error('Lỗi khi chạy tác vụ cron AQI:', error);
  }
}


async function sendRecycleReminders() {
  console.log('---Chạy tác vụ kiểm tra lịch nhắc rác ---');
  const dayMap = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const today = dayMap[new Date().getDay()]; 

  console.log(`Hôm nay là: ${today}`);

  try {
    
    const subscriptions = await Subscription.find({
      recycleReminderEnabled: true,
      recycleReminderDay: today
    });

    if (subscriptions.length === 0) {
      console.log('Không có ai cần nhắc rác hôm nay.');
      return;
    }

    console.log(`Tìm thấy ${subscriptions.length} người cần nhắc rác...`);

    
    let messages = [];
    for (const sub of subscriptions) {
      if (!Expo.isExpoPushToken(sub.pushToken)) { continue; }
      messages.push({
        to: sub.pushToken,
        sound: 'default',
        title: 'Nhắc nhở Thu gom rác',
        body: `Hôm nay là ${today}! Nhớ để rác tái chế ra ngoài nhé!`,
      });
    }

    let chunks = expo.chunkPushNotifications(messages);
    for (let chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
    
    console.log('Đã gửi thông báo nhắc rác thành công.');

  } catch (error) {
    console.error('Lỗi khi chạy tác vụ cron Nhắc rác:', error);
  }
}


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Máy chủ đang chạy ở cổng ${PORT}`);
  

  cron.schedule('*/1 * * * *', checkAqiAndNotify);
  
  
  cron.schedule('1 * * *', sendRecycleReminders, {
    timezone: "Asia/Ho_Chi_Minh" 
  });
});
