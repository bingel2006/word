// api/translate.js 完整修正版

const crypto = require('crypto');

module.exports = async (req, res) => {
  // 处理 OPTIONS 预检
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { text } = req.query;
  if (!text || typeof text !== 'string' || text.trim() === '') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(400).json({ error: 'Missing or invalid "text" parameter' });
  }

  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;

  if (!secretId || !secretKey) {
    console.error('Missing Tencent Cloud credentials');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.floor(Math.random() * 1000000000);

    const params = {
      Action: 'TextTranslate',
      Version: '2018-03-21',
      Region: 'ap-guangzhou',
      SecretId: secretId,
      Timestamp: timestamp,
      Nonce: nonce,
      Source: 'en',
      Target: 'zh',
      ProjectId: 0,
      SourceText: text.trim()
    };

    // 先计算签名（此时 params 还没有 Signature）
    const sortedKeysForSign = Object.keys(params).sort();
    const queryParts = sortedKeysForSign.map(key => 
      `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`
    );
    const canonicalQuery = queryParts.join('&');

    const stringToSign = `GET\ntmt.tencentcloudapi.com\n/?${canonicalQuery}\n`;

    const hmac = crypto.createHmac('sha1', secretKey + '&');
    hmac.update(stringToSign);
    const signature = hmac.digest('base64');

    // 现在把 Signature 加到 params 里
    params.Signature = signature;

    // 现在再构建完整的 URL（包含 Signature）
    const apiUrl = new URL('https://tmt.tencentcloudapi.com/');
    Object.keys(params).sort().forEach(key => {
      apiUrl.searchParams.append(key, params[key]);
    });

    console.log('Requesting Tencent API:', apiUrl.toString().substring(0, 300) + '...');

    const response = await fetch(apiUrl.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Tencent HTTP error:', response.status, errorText);
      throw new Error(`Tencent returned ${response.status}`);
    }

    const data = await response.json();

    if (data.Response && data.Response.TargetText) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).json({
        translated: data.Response.TargetText.trim()
      });
    } else {
      console.error('Tencent API error:', JSON.stringify(data, null, 2));
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(500).json({
        error: 'Translation failed',
        tencentError: data.Response?.Error
      });
    }
  } catch (err) {
    console.error('translate.js error:', err.message, err.stack);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({
      error: 'Server error',
      message: err.message
    });
  }
};
