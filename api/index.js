import admin from 'firebase-admin';

/**
 * تهيئة Firebase Admin مع حماية من الأخطاء
 */
function getFirestoreDB() {
  if (admin.apps.length > 0) return admin.firestore();
  const rawData = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawData) return null;

  try {
    let cleanJson = rawData.trim();
    const startChar = cleanJson.indexOf('{');
    const endChar = cleanJson.lastIndexOf('}');
    if (startChar !== -1 && endChar !== -1) {
      cleanJson = cleanJson.substring(startChar, endChar + 1);
    }
    const config = JSON.parse(cleanJson);
    if (config.private_key) {
      config.private_key = config.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({ credential: admin.credential.cert(config) });
    return admin.firestore();
  } catch (err) {
    console.error('FIREBASE_INIT_ERROR:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  // رؤوس CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getFirestoreDB();

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'online', database: db ? 'connected' : 'error' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!db) return res.status(500).json({ success: false, error: 'Firebase Connection Failed' });

  try {
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;
    if (!userKey) return res.status(401).json({ success: false, error: 'API Key Missing' });

    // البحث عن المفتاح
    const snapshot = await db.collection('api_keys').where('key', '==', userKey).limit(1).get();
    if (snapshot.empty) return res.status(403).json({ success: false, error: 'Invalid API Key' });

    const keyDoc = snapshot.docs[0];
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: 'Prompt Missing' });

    // --- الاتصال بـ Cloudflare Worker ---
    const workerUrl = 'https://lxd.morttzia-me-3600.workers.dev';
    
    const aiRes = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model: "@cf/openai/gpt-oss-120b",
        input: prompt,
        reasoning: { effort: "medium" } // تقليل الجهد قليلاً لتجنب الـ Timeout (502)
      })
    });

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      throw new Error(`Cloudflare Worker returned ${aiRes.status}: ${errorText}`);
    }

    const aiData = await aiRes.json();

    // استخراج النص حسب هيكلية gpt-oss-120b
    let responseText = '';
    if (aiData.result && aiData.result.response) {
      responseText = aiData.result.response;
    } else {
      responseText = typeof aiData.result === 'string' ? aiData.result : JSON.stringify(aiData.result || aiData);
    }

    // تحديث عداد الاستخدام
    await keyDoc.ref.update({ calls: (keyDoc.data().calls || 0) + 1 });

    return res.status(200).json({ success: true, result: responseText });

  } catch (error) {
    console.error("Handler Error:", error.message);
    return res.status(500).json({ 
      success: false, 
      error: "حدث خطأ في معالجة الطلب: " + error.message 
    });
  }
}
