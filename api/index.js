import admin from 'firebase-admin';

/**
 * تهيئة Firebase Admin
 * تقوم هذه الدالة بإصلاح الـ JSON وتنسيق المفتاح الخاص تلقائياً لضمان استقرار الاتصال
 */
function getFirestoreDB() {
  if (admin.apps.length > 0) return admin.firestore();

  const rawData = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawData) return null;

  try {
    let cleanJson = rawData.trim();
    // إزالة الاقتباسات الخارجية الزائدة في حال وجودها
    if (cleanJson.startsWith('"') && cleanJson.endsWith('"')) {
      cleanJson = cleanJson.slice(1, -1);
    }

    const start = cleanJson.indexOf('{');
    const end = cleanJson.lastIndexOf('}');
    if (start !== -1 && end !== -1) cleanJson = cleanJson.substring(start, end + 1);

    const config = JSON.parse(cleanJson);
    if (config.private_key) {
      config.private_key = config.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert(config)
    });
    
    return admin.firestore();
  } catch (err) {
    console.error('Firebase Auth Error:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  // إعدادات CORS للسماح بالوصول من المتصفح والتطبيقات الخارجية
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // معالجة طلب التحقق المسبق
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getFirestoreDB();
  if (!db) return res.status(500).json({ error: 'Database Connection Error' });

  try {
    // 1. التحقق من الهوية (Bearer Token)
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;
    if (!userKey) return res.status(401).json({ error: 'Unauthorized: API Key Required' });

    // البحث عن المفتاح في قاعدة البيانات
    const snapshot = await db.collection('api_keys').where('key', '==', userKey).limit(1).get();
    if (snapshot.empty) return res.status(403).json({ error: 'Forbidden: Invalid API Key' });

    const keyDoc = snapshot.docs[0];
    const { prompt, messages, stream, effort, model } = req.body;

    // 2. معالجة المدخلات (تحويل OpenAI format إلى نص للموديل)
    let finalInput = prompt;
    if (messages && Array.isArray(messages)) {
      finalInput = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    }

    if (!finalInput) return res.status(400).json({ error: 'Bad Request: Prompt or Messages missing' });

    // الرابط الداخلي للوركر (مخفي عن المستخدم)
    const workerUrl = 'https://lxd.morttzia-me-3600.workers.dev';

    // 3. حالة البث المباشر (Streaming Mode)
    if (stream === true) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // منع التخزين المؤقت في Vercel

      const aiRes = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          model: "@cf/openai/gpt-oss-120b",
          input: finalInput,
          stream: true,
          reasoning: { effort: effort || "medium" }
        })
      });

      if (!aiRes.ok) throw new Error('AI Engine Stream Error');

      const reader = aiRes.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunkText = decoder.decode(value, { stream: true });
          
          // إرسال البيانات بصيغة متوافقة مع OpenAI
          const sseData = {
            id: 'chatcmpl-' + Date.now(),
            choices: [{ delta: { content: chunkText }, index: 0 }]
          };
          res.write(`data: ${JSON.stringify(sseData)}\n\n`);
        }
      } catch (err) {
        console.error("Stream break:", err.message);
      } finally {
        res.write('data: [DONE]\n\n');
        await keyDoc.ref.update({ calls: (keyDoc.data().calls || 0) + 1 });
        res.end();
      }
      return;
    }

    // 4. حالة الرد العادي (Normal JSON Response)
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

    // استخراج النص الصافي حسب هيكلية رد الموديل
    if (aiData.output && Array.isArray(aiData.output)) {
      const msg = aiData.output.find(o => o.type === 'message');
      textResult = msg?.content?.[0]?.text || "";
    } else {
      textResult = aiData.result?.response || aiData.response || aiData.result || "";
    }

    // تحديث العداد في قاعدة البيانات
    await keyDoc.ref.update({ calls: (keyDoc.data().calls || 0) + 1 });

    // الرد بصيغة OpenAI إذا كان الطلب الأصلي بصيغة OpenAI
    if (messages) {
      return res.status(200).json({
        id: 'chatcmpl-' + Date.now(),
        object: 'chat.completion',
        model: 'gpt-oss-120b',
        choices: [{ message: { role: 'assistant', content: textResult }, finish_reason: 'stop', index: 0 }]
      });
    }

    // الرد بصيغة LXD التقليدية
    return res.status(200).json({ success: true, result: textResult });

  } catch (error) {
    console.error("Critical API Error:", error.message);
    if (!res.writableEnded) {
      return res.status(500).json({ error: 'Internal LXD Server Error' });
    }
  }
}
