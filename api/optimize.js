/**
 * api/optimize.js — Vercel Serverless Function
 *
 * 防护策略：
 *   1. 访问密码   — 只有拿到密码的人才能调用
 *   2. 限流计数   — 优先用 Upstash Redis；无 Redis 时用内存计数（重启重置，够用）
 *
 * 必填环境变量（Vercel Dashboard → Settings → Environment Variables）：
 *   ANTHROPIC_API_KEY   必填  sk-ant-api03-xxxxx
 *   ACCESS_PASSWORD     必填  自定义密码，如 crispe2025
 *
 * 可选环境变量（填了就用 Upstash 持久化限流，不填走内存限流）：
 *   KV_REST_API_URL     Upstash Redis REST URL
 *   KV_REST_API_TOKEN   Upstash Redis REST Token
 *   DAILY_LIMIT         每天全站最多调用次数，默认 20
 */

const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || '20', 10);
const VALID_MODES = ['crispe', 'enhance', 'variants', 'critique'];

// ── 内存限流兜底（无 Redis 时使用）────────────────
// Serverless 函数实例重启会重置，但对小流量站够用
const memoryStore = new Map();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Upstash / KV REST 封装 ────────────────────────
async function kvGet(key) {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const res  = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.result ?? null;
  } catch { return null; }
}

async function kvSet(key, value, exSeconds) {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(
      `${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?ex=${exSeconds}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch { /* 忽略，不影响主流程 */ }
}

// ── 每日限流检查 ──────────────────────────────────
async function checkDailyLimit() {
  const key     = `opt:count:${todayStr()}`;
  const hasKV   = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  let current = 0;

  if (hasKV) {
    // 用 Upstash 持久化计数
    current = parseInt(await kvGet(key) || '0', 10);
    if (current >= DAILY_LIMIT) {
      return { allowed: false, used: current, limit: DAILY_LIMIT };
    }
    const now      = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    const ttlSec   = Math.ceil((tomorrow - now) / 1000);
    await kvSet(key, String(current + 1), ttlSec);
  } else {
    // 内存计数兜底
    current = memoryStore.get(key) || 0;
    if (current >= DAILY_LIMIT) {
      return { allowed: false, used: current, limit: DAILY_LIMIT };
    }
    memoryStore.set(key, current + 1);
    // 每天清一次旧 key
    for (const k of memoryStore.keys()) {
      if (!k.endsWith(todayStr())) memoryStore.delete(k);
    }
  }

  return { allowed: true, used: current + 1, limit: DAILY_LIMIT };
}

// ── 系统提示词 ────────────────────────────────────
const SYSTEM_BASE = `你是提示词工程专家，专注 CRISPE+ 框架：
C（角色）/ R（背景）/ I（任务）/ S（风格）/ P（示例）/ E+（格式）
输出规则：中文，不超过 500 字，不重复原始输入，直接给结论。`;

const MODE_INST = {
  crispe:   '将用户提示词重构为完整 CRISPE+ 结构，每维度用【C】【R】【I】【S】【P】【E+】标注，信息不足处用「⚠ 请补充：…」标出。',
  enhance:  '找出用户提示词缺失的 CRISPE+ 维度，逐条列出并给出 30 字以内的具体补充建议。',
  variants: '生成 3 个变体：【变体A·专业深度版】【变体B·简洁直达版】【变体C·多方案对比版】，每个 2-3 句话。',
  critique: '找出 3-5 个具体弱点，每条格式：❌ 问题 → 原因 → ✅ 一句话修复建议。',
};

// ── 主处理函数 ────────────────────────────────────
export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持 POST 请求' });
  }

  const body = req.body || {};

  // 密码校验
  const correctPwd = process.env.ACCESS_PASSWORD;
  if (correctPwd && body.password !== correctPwd) {
    return res.status(401).json({ error: '密码错误，请联系管理员获取访问密码' });
  }

  // 每日限流
  const quota = await checkDailyLimit();
  res.setHeader('X-Daily-Used',  quota.used);
  res.setHeader('X-Daily-Limit', quota.limit);

  if (!quota.allowed) {
    return res.status(429).json({
      error:      `今日优化次数已达上限（${quota.limit} 次/天），明天再来 🙏`,
      dailyUsed:  quota.used,
      dailyLimit: quota.limit,
    });
  }

  // 参数校验
  const { prompt, mode } = body;
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
    return res.status(400).json({ error: '提示词不能少于 3 个字符' });
  }
  const safeMode   = VALID_MODES.includes(mode) ? mode : 'crispe';
  const cleanInput = prompt.slice(0, 600).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();

  // API Key 检查
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '服务端未配置 API Key，请联系管理员' });
  }

  // 调用 Claude Haiku
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system:     `${SYSTEM_BASE}\n当前任务：${MODE_INST[safeMode]}`,
        messages:   [{ role: 'user', content: cleanInput }],
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      return res.status(502).json({ error: err?.error?.message || `上游错误 ${upstream.status}` });
    }

    const data   = await upstream.json();
    const result = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    return res.status(200).json({ result, dailyUsed: quota.used, dailyLimit: quota.limit });

  } catch (e) {
    console.error('[optimize]', e);
    return res.status(500).json({ error: '请求失败，请稍后重试' });
  }
}
