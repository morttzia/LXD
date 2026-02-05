import admin from 'firebase-admin';

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'استخدم طلب POST فقط' });
  }

  try {
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;

    if (!userKey) {
      return res.status(401).json({ success: false, error: 'مفتاح الـ API مفقود' });
    }

    if (!db) {
      return res.status(500).json({ success: false, error: 'فشل الاتصال بقاعدة البيانات' });
    }

    const keysRef = db.collection('api_keys');
    const snapshot = await keysRef.where('key', '==', userKey).limit(1).get();

    if (snapshot.empty) {
      return res.status(403).json({ success: false, error: 'هذا المفتاح غير صالح أو تم حذفه' });
    }

    const keyDoc = snapshot.docs[0];
    const keyData = keyDoc.data();
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'يرجى إرسال نص السؤال' });
    }

    const workerUrl = 'https://lxd.morttzia-me-3600.workers.dev/';
    const workerRes = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "@cf/openai/gpt-oss-120b",
        input: prompt,
        reasoning: { effort: "high" }
      })
    });

    const aiData = await workerRes.json();

    await keyDoc.ref.update({
      calls: (keyData.calls || 0) + 1
    });

    return res.status(200).json({
      success: true,
      result: aiData.result || aiData
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
