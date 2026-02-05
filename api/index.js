import admin from 'firebase-admin';

/**
 * تهيئة Firebase Admin بنظام التنظيف الشامل
 */
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
  } catch (err) { return null; }
}

export default async function handler(req, res) {
  // إعدادات CORS الشاملة للسماح بالوصول من المتصفح والـ CLI
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getFirestoreDB();
  if (!db) return res.status(500).json({ error: 'Database Connection Failed' });

  try {
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;
    if (!userKey) return res.status(401).json({ error: 'API Key Missing' });

    const snapshot = await db.collection('api_keys').where('key', '==', userKey).limit(1).get();
    if (snapshot.empty) return res.status(403).json({ error: 'Invalid API Key' });

    const keyDoc = snapshot.docs[0];
    const { prompt, messages, stream, effort } = req.body;

    // دعم كلا الصيغتين: OpenAI (messages) و LXD (prompt)
    let finalInput = prompt;
    if (messages && Array.isArray(messages)) {
      finalInput = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    }

    if (!finalInput) return res.status(400).json({ error: 'No prompt provided' });

    const workerUrl = 'https://lxd.morttzia-me-3600.workers.dev';

    // --- حالة البث (Streaming Mode) ---
    if (stream === true) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const aiRes = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          model: "@cf/openai/gpt-oss-120b",
          input: finalInput,
          stream: true, // طلب البث من الوركر
          reasoning: { effort: effort || "medium" }
        })
      });

      if (!aiRes.ok) throw new Error('AI Stream Error');

      const reader = aiRes.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        
        // تحويل النص الخام إلى تنسيق OpenAI SSE ليقرأه الـ CLI
        const sseData = {
          id: 'chatcmpl-' + Date.now(),
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-oss-120b',
          choices: [{ delta: { content: chunk }, index: 0, finish_reason: null }]
        };
        
        res.write(`data: ${JSON.stringify(sseData)}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      await keyDoc.ref.update({ calls: (keyDoc.data().calls || 0) + 1 });
      return res.end();
    }

    // --- الحالة العادية (Non-Streaming) ---
    const aiRes = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model: "@cf/openai/gpt-oss-120b",
        input: finalInput,
        reasoning: { effort: effort || "medium" }
      })
    });

    const aiData = await aiRes.json();
    let textResult = "";

    // استخراج النص حسب هيكلية رد الموديل
    if (aiData.output && Array.isArray(aiData.output)) {
      const msg = aiData.output.find(o => o.type === 'message');
      textResult = msg?.content?.[0]?.text || "";
    } else {
      textResult = aiData.result?.response || aiData.response || aiData.result || "";
    }

    await keyDoc.ref.update({ calls: (keyDoc.data().calls || 0) + 1 });

    // رد متوافق مع صيغة OpenAI
    if (messages) {
      return res.status(200).json({
        id: 'chatcmpl-' + Date.now(),
        choices: [{ message: { role: 'assistant', content: textResult }, finish_reason: 'stop' }]
      });
    }

    return res.status(200).json({ success: true, result: textResult });

  } catch (error) {
    console.error("API Global Error:", error.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
