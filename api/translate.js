// api/translate.js
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { text } = req.query;
  if (!text) {
    return res.status(400).json({ error: 'Missing text parameter' });
  }

  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;

  if (!secretId || !secretKey) {
    console.error('Missing Tencent credentials in environment variables');
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
      SourceText: text
    };

    // 腾讯签名（标准方式）
    const canonicalQuery = Object.keys(params)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    const stringToSign = `GET\ntmt.tencentcloudapi.com\n/?${canonicalQuery}\n`;

    const signature = crypto
      .createHmac('sha1', secretKey + '&')
      .update(stringToSign)
      .digest('base64');

    params.Signature = signature;

    const query = new URLSearchParams(params).toString();
    const url = `https://tmt.tencentcloudapi.com/?${query}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.Response && data.Response.TargetText) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).json({ translated: data.Response.TargetText.trim() });
    } else {
      console.error('Tencent API error:', data);
      return res.status(500).json({ error: 'Translation failed', details: data });
    }
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
