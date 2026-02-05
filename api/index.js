import admin from 'firebase-admin';

/**
 * دالة تهيئة Firebase بنظام "التنظيف العميق"
 * تعالج مشاكل الـ JSON التالف والرموز المهربة بشكل خاطئ
 */
function getFirestoreDB() {
  if (admin.apps.length > 0) return admin.firestore();

  let rawData = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!rawData) {
    console.error('DEBUG: FIREBASE_SERVICE_ACCOUNT missing');
    return null;
  }

  try {
    // 1. تنظيف أولي للفراغات والاقتباسات الزائدة
    let cleanJson = rawData.trim();
    if (cleanJson.startsWith('"') && cleanJson.endsWith('"')) {
      cleanJson = cleanJson.slice(1, -1);
    }

    // 2. إصلاح الأسطر الحقيقية (التي تسبب خطأ Bad escaped character)
    // نقوم بتحويل أي "Enter" حقيقي داخل النص إلى رمز \n
    cleanJson = cleanJson.replace(/\n/g, '\\n');

    // 3. محاولة تحليل الـ JSON
    let config;
    try {
      config = JSON.parse(cleanJson);
    } catch (parseError) {
      // إذا فشل، نحاول تنظيف الرموز المهربة بشكل مزدوج
      cleanJson = cleanJson.replace(/\\\\n/g, '\\n');
      config = JSON.parse(cleanJson);
    }
    
    // 4. التأكد من أن المفتاح الخاص يحتوي على أسطر حقيقية للـ SDK
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
  // رؤوس CORS الشاملة
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getFirestoreDB();

  // فحص الحالة عبر GET
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'online', 
      database: db ? 'ready' : 'error_initializing' 
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (!db) {
    return res.status(500).json({ 
      success: false, 
      error: 'Firebase Init Failed. يرجى مراجعة إعدادات Vercel.' 
    });
  }

  try {
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;

    if (!userKey) return res.status(401).json({ success: false, error: 'Key Missing' });

    const snapshot = await db.collection('api_keys').where('key', '==', userKey).limit(1).get();

    if (snapshot.empty) return res.status(403).json({ success: false, error: 'Invalid Key' });

    const keyDoc = snapshot.docs[0];
    const { prompt } = req.body;

    if (!prompt) return res.status(400).json({ success: false, error: 'Prompt Missing' });

    // استدعاء الذكاء الاصطناعي
    const aiRes = await fetch('https://lxd.morttzia-me-3600.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "@cf/openai/gpt-oss-120b",
        input: prompt,
        reasoning: { effort: "high" }
      })
    });

    const data = await aiRes.json();
    await keyDoc.ref.update({ calls: (keyDoc.data().calls || 0) + 1 });

    return res.status(200).json({ success: true, result: data.result || data });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
