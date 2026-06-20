const admin = require('firebase-admin');
const logger = require('../../config/logger');

let _initialized = false;

function _init() {
  if (_initialized) return;
  try {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
      serviceAccount = require('../../config/firebase-service-account.json');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    _initialized = true;
  } catch (err) {
    logger.error(`[FCM] Firebase initialization failed: ${err.message}`);
  }
}

async function sendPushNotification({ fcmToken, title, body, data = {} }) {
  if (!fcmToken) return;
  try {
    _init();
    const message = {
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: 'high',
        notification: {
          channelId: 'booking_notifications',
          priority: 'high',
          sound: 'default',
        },
      },
    };
    const response = await admin.messaging().send(message);
    logger.info(`[FCM] Push sent: ${response}`);
    return response;
  } catch (err) {
    logger.error(`[FCM] Failed to send push: ${err.message}`);
  }
}

module.exports = { sendPushNotification };
