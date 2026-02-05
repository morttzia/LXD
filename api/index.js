import admin from 'firebase-admin';

/**
 * دالة تهيئة Firebase مع نظام استخراج JSON ذكي
 * تعالج مشاكل الاقتباسات الزائدة أو النصوص الغريبة المحيطة بالمفتاح
 */
function getFirestoreDB() {
  if (admin.apps.length > 0) return admin.firestore();

  const rawData = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!rawData) {
    console.error('DEBUG: FIREBASE_SERVICE_ACCOUNT is missing in environment variables');
    return null;
  }

  try {
    let cleanJson = rawData.trim();
    
    // طباعة أول 50 حرف للتشخيص (مهمة جداً لمراقبة Logs)
    console.log("DEBUG: Raw string starts with:", cleanJson.substring(0, 50));

    // استخراج محتوى الـ JSON الحقيقي بين أول { وآخر }
    // هذا يتجاهل أي علامات اقتباس خارجية " " أو نصوص زائدة
    const start = cleanJson.indexOf('{');
    const end = cleanJson.lastIndexOf('}');
    
    if (start === -1 || end === -1) {
      throw new Error("Could not find a valid JSON object starting with { and ending with }");
    }
    
    cleanJson = cleanJson.substring(start, end + 1);

    // تحليل النص المستخرج
    let config = JSON.parse(cleanJson);
    
    // إصلاح مشكلة رموز السطر الجديد في المفتاح الخاص
    if (config.private_key) {
      config.private_key = config.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert(config)
    });
    
    console.log("DEBUG: Firebase initialized successfully!");
    return admin.firestore();
  } catch (err) {
    console.error('FIREBASE_INIT_CRITICAL_ERROR:', err.message);
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

  // فحص الحالة عبر GET (للتأكد من أن السيرفر يعمل)
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'online', 
      database: db ? 'ready' : 'failed_to_init' 
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  if (!db) {
    return res.status(500).json({ 
      success: false, 
      error: 'Firebase Init Failed. Check Vercel Logs for details.' 
    });
  }

  try {
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;

    if (!userKey) return res.status(401).json({ success: false, error: 'Missing API Key' });

    // البحث عن المفتاح في قاعدة البيانات
    const snapshot = await db.collection('api_keys').where('key', '==', userKey).limit(1).get();

    if (snapshot.empty) {
      return res.status(403).json({ success: false, error: 'Invalid API Key' });
    }

    const keyDoc = snapshot.docs[0];
    const { prompt } = req.body;

    if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is empty' });

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

    // تحديث عداد الطلبات
    await keyDoc.ref.update({ calls: (keyDoc.data().calls || 0) + 1 });

    return res.status(200).json({ success: true, result: data.result || data });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
