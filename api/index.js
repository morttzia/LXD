import admin from 'firebase-admin';

/**
 * وظيفة تهيئة Firebase مع نظام تنظيف متطور للـ JSON
 */
function getFirestoreDB() {
  if (admin.apps.length > 0) return admin.firestore();

  let rawJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!rawJson) {
    console.error('DEBUG: FIREBASE_SERVICE_ACCOUNT is missing');
    return null;
  }

  try {
    // تنظيف أولي
    let cleanJson = rawJson.trim();

    // طباعة أول 50 حرف للتشخيص في Vercel Logs (سيساعدنا هذا جداً)
    console.log("DEBUG: Raw JSON starts with:", cleanJson.substring(0, 50));

    // 1. معالجة الاقتباسات الزائدة في البداية والنهاية
    if (cleanJson.startsWith("'") || cleanJson.startsWith('"')) {
      cleanJson = cleanJson.substring(1, cleanJson.length - 1);
    }

    // 2. محاولة البحث عن بداية الـ JSON الحقيقية {
    const startIdx = cleanJson.indexOf('{');
    const endIdx = cleanJson.lastIndexOf('}');
    
    if (startIdx !== -1 && endIdx !== -1) {
      cleanJson = cleanJson.substring(startIdx, endIdx + 1);
    }

    // 3. تحليل الـ JSON
    let config;
    try {
      config = JSON.parse(cleanJson);
    } catch (e) {
      // محاولة أخيرة: إصلاح الهروب المزدوج للشرطات المائلة
      cleanJson = cleanJson.replace(/\\\\n/g, '\\n');
      config = JSON.parse(cleanJson);
    }
    
    // 4. إصلاح المفتاح الخاص (السر الحقيقي للعمل)
    if (config.private_key) {
      // استبدال أسطر الهروب بأسطر حقيقية
      config.private_key = config.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert(config)
    });
    
    return admin.firestore();
  } catch (err) {
    console.error('FIREBASE_INIT_CRITICAL_ERROR:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  // --- إعدادات CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getFirestoreDB();

  // فحص الحالة عبر GET
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'online', 
      database: db ? 'ready' : 'failed_initialization' 
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  if (!db) {
    return res.status(500).json({ 
      success: false, 
      error: 'Firebase Initialization Failed. Check Vercel Logs for DEBUG info.' 
    });
  }

  try {
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;

    if (!userKey) return res.status(401).json({ success: false, error: 'API Key Missing' });

    // استعلام قاعدة البيانات
    const snapshot = await db.collection('api_keys').where('key', '==', userKey).limit(1).get();

    if (snapshot.empty) {
      return res.status(403).json({ success: false, error: 'Invalid API Key' });
    }

    const keyDoc = snapshot.docs[0];
    const { prompt } = req.body;

    if (!prompt) return res.status(400).json({ success: false, error: 'Prompt required' });

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

    // تحديث عداد الاستخدام
    await keyDoc.ref.update({ calls: (keyDoc.data().calls || 0) + 1 });

    return res.status(200).json({ success: true, result: data.result || data });

  } catch (error) {
    console.error('API_HANDLER_ERROR:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
