import admin from 'firebase-admin';

// دالة تهيئة Firebase مع معالجة متقدمة للأخطاء والتنسيق
function getFirestoreDB() {
  if (admin.apps.length > 0) return admin.firestore();

  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!rawJson) {
    console.error('Environment variable FIREBASE_SERVICE_ACCOUNT is missing');
    return null;
  }

  try {
    // 1. تنظيف النص من أي مسافات أو رموز غريبة
    const cleanJson = rawJson.trim();
    
    // 2. محاولة تحليل الـ JSON
    let config = JSON.parse(cleanJson);
    
    // 3. معالجة حالة "التأطير المزدوج" (إذا تم تخزين الـ JSON كسلسلة نصية داخل سلسلة أخرى)
    if (typeof config === 'string') {
      config = JSON.parse(config);
    }
    
    // 4. إصلاح مشكلة رموز السطر الجديد (\n) في المفتاح الخاص (السبب الرئيسي للخطأ 500)
    if (config.private_key) {
      config.private_key = config.private_key.replace(/\\n/g, '\n');
    }

    // 5. تهيئة التطبيق
    admin.initializeApp({
      credential: admin.credential.cert(config)
    });
    
    return admin.firestore();
  } catch (err) {
    console.error('Critical: Failed to initialize Firebase:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  // رؤوس CORS للسماح بالوصول من المتصفح
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getFirestoreDB();

  // رد الفحص السريع (GET)
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'online', 
      database: db ? 'connected' : 'connection_failed_check_logs' 
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // إذا لم نتمكن من تشغيل قاعدة البيانات
  if (!db) {
    return res.status(500).json({ 
      success: false, 
      error: 'Firebase Initialization Failed. Check Vercel Environment Variables.' 
    });
  }

  try {
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;

    if (!userKey) return res.status(401).json({ success: false, error: 'API Key Missing' });

    // التحقق من وجود المفتاح في قاعدة البيانات
    const snapshot = await db.collection('api_keys').where('key', '==', userKey).limit(1).get();

    if (snapshot.empty) {
      return res.status(403).json({ success: false, error: 'Invalid API Key' });
    }

    const keyDoc = snapshot.docs[0];
    const { prompt } = req.body;

    if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' });

    // استدعاء الذكاء الاصطناعي من Cloudflare Worker
    const aiRes = await fetch('https://lxd.morttzia-me-3600.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "@cf/openai/gpt-oss-120b",
        input: prompt,
        reasoning: { effort: "high" }
      })
    });

    if (!aiRes.ok) throw new Error('AI Provider error');

    const data = await aiRes.json();

    // تحديث عداد الاستخدام (Calls)
    await keyDoc.ref.update({ calls: (keyDoc.data().calls || 0) + 1 });

    return res.status(200).json({ 
      success: true, 
      result: data.result || data 
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
