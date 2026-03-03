// api/translate.js
const crypto = require('crypto');

// 严格遵守 RFC3986 的 URL 编码函数（腾讯云 V1 签名强制要求）
function rfc3986Encode(str) {
  return encodeURIComponent(str)
    .replace(/[!*'()]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

module.exports = async (req, res) => {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { text } = req.query;
  if (!text) {
    return res.status(400).json({ error: 'Missing text parameter' });
  }

  // 【关键修复 1】：使用 .trim() 和 .replace() 强行清理 Vercel 环境变量中可能存在的空格、换行或误加的引号
  const secretId = (process.env.TENCENT_SECRET_ID || '').replace(/['"]/g, '').trim();
  const secretKey = (process.env.TENCENT_SECRET_KEY || '').replace(/['"]/g, '').trim();

  if (!secretId || !secretKey) {
    return res.status(500).json({ error: 'Server configuration error: Credentials missing' });
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

    // 1. 生成签名原文字符串（必须按字典序，绝对不能被 Encode）
    const signQuery = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');

    const stringToSign = `GETtmt.tencentcloudapi.com/?${signQuery}`;

    // 2. HMAC-SHA1 加密
    const signature = crypto
      .createHmac('sha1', secretKey)
      .update(stringToSign)
      .digest('base64');

    params.Signature = signature;

    // 【关键修复 2】：废弃 URLSearchParams，自己使用严格的 RFC3986 拼接请求 URL
    // 因为 URLSearchParams 会把空格转为 "+" 号，而腾讯云要求空格必须转为 "%20"
    const finalQueryString = Object.keys(params)
      .map(key => `${key}=${rfc3986Encode(params[key])}`)
      .join('&');

    const url = `https://tmt.tencentcloudapi.com/?${finalQueryString}`;

    // 3. 发送请求
    const response = await fetch(url);
    const data = await response.json();

    if (data.Response && data.Response.Error) {
      console.error('Tencent API Error:', data.Response.Error);
      return res.status(400).json({ error: 'Translation failed', tencentError: data.Response.Error });
    }

    if (data.Response && data.Response.TargetText) {
      return res.status(200).json({ translation: data.Response.TargetText });
    } else {
      return res.status(500).json({ error: 'Unknown response format', details: data });
    }

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};
