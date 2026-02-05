import admin from 'firebase-admin';

/**
 * وظيفة لتهيئة Firebase Admin بشكل آمن
 * تعالج مشاكل رموز السطر الجديد في المفتاح الخاص (Private Key)
 */
function initFirebase() {
  if (admin.apps.length > 0) return admin.firestore();

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!serviceAccount) {
    console.error('Missing FIREBASE_SERVICE_ACCOUNT environment variable');
    return null;
  }

  try {
    // معالجة البيانات: فك تشفير الـ JSON وإصلاح رموز السطر الجديد في المفتاح الخاص
    const certData = JSON.parse(serviceAccount);
    
    // إصلاح مشكلة \n الشائعة في Vercel
    if (certData.private_key) {
      certData.private_key = certData.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert(certData)
    });
    
    return admin.firestore();
  } catch (error) {
    console.error('Firebase Initialization Error:', error);
    return null;
  }
}

export default async function handler(req, res) {
  // 1. إعدادات CORS (يجب أن تسبق أي عملية أخرى)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. تفعيل قاعدة البيانات
  const db = initFirebase();

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'يرجى استخدام POST لطلب الرد' 
    });
  }

  if (!db) {
    return res.status(500).json({ 
      success: false, 
      error: 'فشل تهيئة قاعدة البيانات. تأكد من صحة محتوى FIREBASE_SERVICE_ACCOUNT في Vercel.' 
    });
  }

  try {
    // 3. التحقق من الهوية
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;

    if (!userKey) {
      return res.status(401).json({ success: false, error: 'مفتاح الـ API مفقود' });
    }

    // البحث عن المفتاح
    const keysRef = db.collection('api_keys');
    const snapshot = await keysRef.where('key', '==', userKey).limit(1).get();

    if (snapshot.empty) {
      return res.status(403).json({ success: false, error: 'مفتاح غير صالح' });
    }

    const keyDoc = snapshot.docs[0];
    const keyData = keyDoc.data();
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'يرجى إرسال نص السؤال' });
    }

    // 4. استدعاء نموذج gpt-oss-120b
    const workerRes = await fetch('https://lxd.morttzia-me-3600.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "@cf/openai/gpt-oss-120b",
        input: prompt,
        reasoning: { effort: "high" }
      })
    });

    if (!workerRes.ok) {
      throw new Error(`Cloudflare Worker error: ${workerRes.status}`);
    }

    const aiData = await workerRes.json();

    // 5. تحديث العداد
    await keyDoc.ref.update({
      calls: (keyData.calls || 0) + 1
    });

    return res.status(200).json({
      success: true,
      result: aiData.result || aiData
    });

  } catch (error) {
    console.error("Handler Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
