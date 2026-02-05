import admin from 'firebase-admin';

/**
 * دالة تهيئة Firebase Admin مع نظام تنظيف وحماية شامل
 * تعالج مشاكل الـ JSON والرموز الزائدة تلقائياً
 */
function getFirestoreDB() {
  if (admin.apps.length > 0) return admin.firestore();

  const rawData = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawData) {
    console.error('FIREBASE_SERVICE_ACCOUNT is missing');
    return null;
  }

  try {
    let cleanJson = rawData.trim();
    
    // تنظيف الاقتباسات الخارجية الزائدة
    while ((cleanJson.startsWith('"') && cleanJson.endsWith('"')) || 
           (cleanJson.startsWith("'") && cleanJson.endsWith("'"))) {
      cleanJson = cleanJson.slice(1, -1).trim();
    }

    // استخراج محتوى الـ JSON الحقيقي
    const start = cleanJson.indexOf('{');
    const end = cleanJson.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      cleanJson = cleanJson.substring(start, end + 1);
    }

    const config = JSON.parse(cleanJson);
    
    // إصلاح المفتاح الخاص (استبدال الهروب بأسطر حقيقية)
    if (config.private_key) {
      config.private_key = config.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert(config)
    });
    
    return admin.firestore();
  } catch (err) {
    console.error('FIREBASE_INIT_ERROR:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  // --- إعدادات CORS الشاملة ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getFirestoreDB();

  // فحص الحالة عبر GET
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'online', 
      database: db ? 'ready' : 'initialization_error' 
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!db) return res.status(500).json({ success: false, error: 'Firebase Connection Failed' });

  try {
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;
    if (!userKey) return res.status(401).json({ success: false, error: 'API Key Missing' });

    // البحث عن المفتاح في Firestore
    const snapshot = await db.collection('api_keys').where('key', '==', userKey).limit(1).get();
    if (snapshot.empty) return res.status(403).json({ success: false, error: 'Invalid API Key' });

    const keyDoc = snapshot.docs[0];
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: 'Prompt Missing' });

    // --- الرابط الصحيح والمؤكد من قبلك ---
    const workerUrl = 'https://lxd.morttzia-me-3600.workers.dev';
    
    // استدعاء الموديل gpt-oss-120b بالهيكلية المطلوبة (input + reasoning)
    const aiRes = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model: "@cf/openai/gpt-oss-120b",
        input: prompt,
        reasoning: { effort: "high" }
      })
    });

    const aiData = await aiRes.json();

    if (!aiRes.ok || aiData.errors) {
      return res.status(502).json({ 
        success: false, 
        error: "AI Worker Error: " + (aiData.errors?.[0]?.message || "Check Worker Deployment")
      });
    }

    // استخراج الرد النصي من هيكلية الـ 120b
    let finalResult = '';
    if (aiData.result && aiData.result.response) {
      finalResult = aiData.result.response;
    } else {
      finalResult = typeof aiData.result === 'string' ? aiData.result : JSON.stringify(aiData.result || aiData);
    }

    // تحديث عداد الطلبات
    await keyDoc.ref.update({ calls: (keyDoc.data().calls || 0) + 1 });

    return res.status(200).json({ success: true, result: finalResult });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
