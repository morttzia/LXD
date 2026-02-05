import admin from 'firebase-admin';

// تهيئة Firebase Admin
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
      });
    }
  } catch (error) {
    console.error('Firebase Admin Error:', error);
  }
}

const db = admin.apps.length ? admin.firestore() : null;

export default async function handler(req, res) {
  // 1. إعدادات CORS (يجب أن تكون في البداية)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // التعامل مع طلب OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;

    if (!userKey) {
      return res.status(401).json({ success: false, error: 'API Key missing' });
    }

    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not initialized. Check Environment Variables.' });
    }

    // البحث عن المفتاح في مجموعة api_keys
    const keysRef = db.collection('api_keys');
    const snapshot = await keysRef.where('key', '==', userKey).limit(1).get();

    if (snapshot.empty) {
      return res.status(403).json({ success: false, error: 'Invalid API Key' });
    }

    const keyDoc = snapshot.docs[0];
    const keyData = keyDoc.data();
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    // استدعاء الوركر
    const workerResponse = await fetch('https://lxd.morttzia-me-3600.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "@cf/openai/gpt-oss-120b",
        input: prompt,
        reasoning: { effort: "high" }
      })
    });

    const aiData = await workerResponse.json();

    // تحديث العداد
    await keyDoc.ref.update({
      calls: (keyData.calls || 0) + 1
    });

    return res.status(200).json({
      success: true,
      result: aiData.result || aiData
    });

  } catch (error) {
    console.error("API Crash Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}