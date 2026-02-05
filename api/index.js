import admin from 'firebase-admin';

// إعداد Firebase Admin للوصول لقاعدة البيانات سراً
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
  } catch (error) {
    console.error('Firebase initialization error:', error);
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  // --- 1. حل مشكلة CORS (هذا الجزء هو الذي يحل الخطأ) ---
  res.setHeader('Access-Control-Allow-Origin', '*'); // السماح لجميع المواقع (أو حدد رابط موقعك)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // معالجة طلب الـ Preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "يرجى استخدام طلب POST" });
  }

  // --- 2. التحقق من مفتاح الـ API المرسل في الهيدر ---
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Missing or invalid API key format" });
  }

  const userKey = authHeader.replace('Bearer ', '').trim();

  try {
    // البحث عن المفتاح في مجموعة api_keys التي صنعناها في manager.html
    const keysRef = db.collection('api_keys');
    const snapshot = await keysRef.where('key', '==', userKey).limit(1).get();

    if (snapshot.empty) {
      return res.status(403).json({ error: "هذا المفتاح غير صالح أو تم حذفه" });
    }

    const keyDoc = snapshot.docs[0];
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "يرجى إرسال الـ prompt" });
    }

    // --- 3. استدعاء الوركر الخاص بك (Cloudflare Worker) ---
    const workerUrl = 'https://lxd.morttzia-me-3600.workers.dev/';
    const aiResponse = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "@cf/openai/gpt-oss-120b",
        input: prompt,
        reasoning: { effort: "high" } // تثبيت التفكير العالي دائماً
      })
    });

    const data = await aiResponse.json();

    // --- 4. تحديث عدد الطلبات (Calls) للمفتاح ---
    await keyDoc.ref.update({
      calls: admin.firestore.FieldValue.increment(1)
    });

    // --- 5. إرسال الرد النهائي للمستخدم ---
    return res.status(200).json({
      success: true,
      model_info: "LXD-Reasoning-v1",
      result: data.result || data
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: "حدث خطأ داخلي في السيرفر", details: error.message });
  }
}
