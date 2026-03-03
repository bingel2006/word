// api/translate.js （最终严格版）

const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { text } = req.query;
  if (!text) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(400).json({ error: 'Missing text' });
  }

  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;

  if (!secretId || !secretKey) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: 'Credentials missing' });
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

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

    // 排序 key
    const sortedKeys = Object.keys(params).sort((a, b) => a.localeCompare(b));

    // canonicalQueryString（用于签名）
    const canonicalQuery = sortedKeys
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    // stringToSign（腾讯最严格格式：四行，最后空行）
    const stringToSign = `GET
tmt.tencentcloudapi.com
/?${canonicalQuery}

`;

    // 计算签名
    const hmac = crypto.createHmac('sha1', secretKey + '&');
    hmac.update(stringToSign);
    const signature = hmac.digest('base64');

    // 加到 params
    params.Signature = signature;

    // 构建 URL
    const apiUrl = new URL('https://tmt.tencentcloudapi.com/');
    sortedKeys.forEach(key => apiUrl.searchParams.append(key, params[key]));
    apiUrl.searchParams.append('Signature', signature);

    const response = await fetch(apiUrl);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`HTTP ${response.status}: ${err}`);
    }

    const data = await response.json();

    if (data.Response && data.Response.TargetText) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).json({ translated: data.Response.TargetText.trim() });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({
      error: 'Translation failed',
      tencentError: data.Response?.Error || data
    });
  } catch (err) {
    console.error('translate.js error:', err);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
