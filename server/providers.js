// AI 연결 방식. API 키가 아니라 '구독 로그인'을 쓰는 로컬 도구에 붙는다.
//  - openclaw  : OpenClaw Gateway의 OpenAI 호환 엔드포인트 (ChatGPT/Codex 또는 Claude CLI 로그인)
//  - hermes    : Hermes Agent API 서버 (ChatGPT/Codex 로그인 또는 Claude 플러그인)
//  - claude-cli: 설치된 Claude Code(`claude -p`)를 직접 호출 (Claude 구독 로그인)
//  - none      : AI 없이 규칙만 사용
// 토큰은 이 서버에만 있고 브라우저로 보내지 않는다.

import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const PRESETS = {
  openclaw: { baseUrl: 'http://127.0.0.1:18789/v1', model: 'openclaw/default', label: 'OpenClaw' },
  hermes: { baseUrl: 'http://127.0.0.1:8642/v1', model: 'hermes-agent', label: 'Hermes Agent' },
  'claude-cli': { label: 'Claude Code (claude -p)' },
  none: { label: '없음 (규칙만 사용)' },
};

export function providerConfig(env = process.env) {
  const name = env.AI_PROVIDER in PRESETS ? env.AI_PROVIDER : 'none';
  const p = PRESETS[name];
  return {
    name,
    label: p.label,
    baseUrl: env.AI_BASE_URL || p.baseUrl,
    model: env.AI_MODEL || p.model,
    token: env.AI_TOKEN || '',
    timeoutMs: Number(env.AI_TIMEOUT_MS) || 60000,
  };
}

async function chatCompletions(cfg, system, user) {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });
  if (!res.ok) throw new Error(`${cfg.label} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

function claudeCli(cfg, system, user) {
  return new Promise((resolve, reject) => {
    const args = ['-p', user, '--append-system-prompt', system, '--output-format', 'json'];
    if (cfg.model) args.push('--model', cfg.model);
    // 프로젝트 파일을 읽지 않도록 임시 폴더에서 실행. API 키가 있으면 구독 대신 과금되므로 제거.
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const child = spawn('claude', args, { cwd: tmpdir(), env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('claude -p 시간 초과')); }, cfg.timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`claude -p 종료 코드 ${code}: ${err.slice(0, 200)}`));
      try {
        resolve(JSON.parse(out).result ?? '');
      } catch {
        resolve(out);
      }
    });
  });
}

export async function complete(cfg, system, user) {
  if (cfg.name === 'none') throw new Error('AI_PROVIDER가 설정되지 않았어요.');
  if (cfg.name === 'claude-cli') return claudeCli(cfg, system, user);
  return chatCompletions(cfg, system, user);
}
