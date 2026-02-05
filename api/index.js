import admin from 'firebase-admin';

// إعداد Firebase Admin (يجب إضافة FIREBASE_SERVICE_ACCOUNT في إعدادات Vercel)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
  } catch (error) {
    console.error('Firebase admin initialization error:', error);
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  // --- حل مشكلة CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // التعامل مع طلبات التحقق المسبق (Preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // السماح فقط بطلبات POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. استخراج المفتاح من الهيدر
  const authHeader = req.headers['authorization'];
  const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;

  if (!userKey) {
    return res.status(401).json({ success: false, error: 'Missing API Key' });
  }

  try {
    // 2. التحقق من وجود المفتاح في مجموعة api_keys
    const keysRef = db.collection('api_keys');
    const snapshot = await keysRef.where('key', '==', userKey).limit(1).get();

    if (snapshot.empty) {
      return res.status(403).json({ success: false, error: 'Invalid API Key' });
    }

    const keyDoc = snapshot.docs[0];
    const keyData = keyDoc.data();

    // 3. استقبال سؤال المستخدم
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Missing prompt' });
    }

    // 4. استدعاء الوركر الخاص بك (Cloudflare Worker)
    // نرسل الإعدادات سراً من هنا لضمان جودة عالية (High Reasoning)
    const workerUrl = 'https://lxd.morttzia-me-3600.workers.dev/';
    
    const aiResponse = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "@cf/openai/gpt-oss-120b",
        input: prompt,
        reasoning: { 
          effort: "high" // تثبيت الجهد العالي دائماً
        }
      })
    });

    const data = await aiResponse.json();

    // 5. زيادة عداد الطلبات (Calls) للمفتاح في قاعدة البيانات
    await keyDoc.ref.update({
      calls: (keyData.calls || 0) + 1
    });

    // 6. إرجاع النتيجة للمستخدم
    return res.status(200).json({
      success: true,
      model_info: "LXD-Reasoning-v1",
      result: data.result || data
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}
