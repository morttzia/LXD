import admin from 'firebase-admin';

function getFirestoreDB() {
  if (admin.apps.length > 0) return admin.firestore();
  const rawData = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawData) return null;

  try {
    let cleanJson = rawData.trim();
    const start = cleanJson.indexOf('{');
    const end = cleanJson.lastIndexOf('}');
    if (start !== -1 && end !== -1) cleanJson = cleanJson.substring(start, end + 1);
    
    const config = JSON.parse(cleanJson);
    if (config.private_key) config.private_key = config.private_key.replace(/\\n/g, '\n');

    admin.initializeApp({ credential: admin.credential.cert(config) });
    return admin.firestore();
  } catch (err) {
    console.error('FIREBASE_INIT_ERROR:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getFirestoreDB();
  if (req.method === 'GET') return res.status(200).json({ status: 'online', db: db ? 'ready' : 'error' });
  
  if (!db) return res.status(500).json({ success: false, error: 'Firebase Connection Failed' });

  try {
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;
    
    const snapshot = await db.collection('api_keys').where('key', '==', userKey).limit(1).get();
    if (snapshot.empty) return res.status(403).json({ success: false, error: 'Invalid API Key' });

    const keyDoc = snapshot.docs[0];
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: 'Prompt Missing' });

    // --- الرابط الصحيح (بدون أي مسارات فرعية) ---
    const workerUrl = 'https://lxd.morttzia-me-3600.workers.dev';
    
    // إرسال الطلب للوركر
    const aiRes = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model: "@cf/openai/gpt-oss-120b",
        input: prompt,
        effort: "medium"
      })
    });

    const aiData = await aiRes.json();

    if (!aiRes.ok) {
      return res.status(aiRes.status).json({ 
        success: false, 
        error: `Cloudflare Worker Error: ${JSON.stringify(aiData)}` 
      });
    }

    const finalResult = aiData.response || aiData.result?.response || aiData.result || JSON.stringify(aiData);

    await keyDoc.ref.update({ calls: (keyDoc.data().calls || 0) + 1 });

    return res.status(200).json({ success: true, result: finalResult });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
