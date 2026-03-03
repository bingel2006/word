// api/translate.js - 最终修复版（Nonce int + 严格 stringToSign）

const crypto = require('crypto');

module.exports = async (req, res) => {
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
  if (!text) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(400).json({ error: 'Missing text' });
  }

  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;

  if (!secretId || !secretKey) {
    console.error('Missing credentials');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: 'Credentials missing' });
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.floor(1000000000 + Math.random() * 9000000000); // 10位 int

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

    // 排序
    const sortedKeys = Object.keys(params).sort();

    // canonicalQuery（签名用）
    const canonicalQuery = sortedKeys
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    // stringToSign - 腾讯官方严格格式（注意换行和空行）
    const stringToSign = [
      'GET',
      'tmt.tencentcloudapi.com',
      `/?${canonicalQuery}`,
      ''  // 必须空行
    ].join('\n');

    console.log('stringToSign for debug:', stringToSign.replace(/\n/g, '\\n')); // 日志显示换行

    // 签名
    const hmac = crypto.createHmac('sha1', secretKey + '&');
    hmac.update(stringToSign);
    const signature = hmac.digest('base64');

    params.Signature = signature;

    // 构建 URL
    const apiUrl = new URL('https://tmt.tencentcloudapi.com/');
    sortedKeys.forEach(key => {
      apiUrl.searchParams.append(key, params[key]);
    });
    apiUrl.searchParams.append('Signature', signature);

    console.log('Final URL:', apiUrl.toString().substring(0, 400) + '...');

    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errText = await response.text();
      console.error('Tencent HTTP error:', response.status, errText);
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.Response && data.Response.TargetText) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).json({ translated: data.Response.TargetText.trim() });
    }

    console.error('Tencent error:', JSON.stringify(data));
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({
      error: 'Translation failed',
      tencentError: data.Response?.Error
    });
  } catch (err) {
    console.error('translate error:', err.message, err.stack);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
