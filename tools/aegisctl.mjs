#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';

const HELP = `
aegisctl - Aegis Ops config CLI (pull/plan/apply)

Usage:
  node tools/aegisctl.mjs <command> [options]

Commands:
  plan   Dry-run import (no write)
  apply  Import config (upsert write)

Common options:
  --api-url <url>         API base URL (default: AEGIS_API_URL or http://localhost:3002)
  --token <jwt>           Bearer token (default: AEGIS_TOKEN)
  --email <email>         Login email (fallback auth when --token is absent)
  --password <password>   Login password (fallback auth when --token is absent)
  --workspace-id <id>     Optional switch workspace after login

pull options:
  --include-secrets       Include sensitive values in export
  --out <file>            Output file path (default: stdout)

plan/apply options:
  --file <file>           Input JSON file
  --stdin                 Read input JSON from stdin
  --out <file>            Write response summary JSON

Examples:
  node tools/aegisctl.mjs pull --token <JWT> --out ops-config.json
  node tools/aegisctl.mjs plan --token <JWT> --file ops-config.json
  node tools/aegisctl.mjs apply --email owner@x.com --password '***' --file ops-config.json
`.trim();

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

async function readStdinText() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function requestJson(baseUrl, path, method, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  if (!res.ok) {
    const msg = payload?.message || payload?.error || text || `HTTP ${res.status}`;
    throw new Error(`${method} ${path} failed (${res.status}): ${msg}`);
  }
  return payload;
}

async function resolveToken(args, baseUrl) {
  if (args.token) return String(args.token);
  if (process.env.AEGIS_TOKEN) return String(process.env.AEGIS_TOKEN);
  if (args.email && args.password) {
    const login = await requestJson(baseUrl, '/api/auth/login', 'POST', null, {
      email: String(args.email),
      password: String(args.password),
    });
    let token = String(login?.accessToken || '');
    if (!token) throw new Error('Login succeeded but accessToken was not returned');
    if (args['workspace-id']) {
      const switched = await requestJson(baseUrl, '/api/auth/switch-workspace', 'POST', token, {
        workspaceId: String(args['workspace-id']),
      });
      token = String(switched?.accessToken || token);
    }
    return token;
  }
  throw new Error('Authentication required: set --token or AEGIS_TOKEN, or provide --email/--password');
}

function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || command === 'help' || args.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (!['pull', 'plan', 'apply'].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  const baseUrl = String(args['api-url'] || process.env.AEGIS_API_URL || 'http://localhost:3002').replace(/\/$/, '');
  const token = await resolveToken(args, baseUrl);

  if (command === 'pull') {
    const includeSecrets = Boolean(args['include-secrets']);
    const bundle = await requestJson(
      `/api/ops-config/export?includeSecrets=${includeSecrets ? 'true' : 'false'}`,
      'GET',
    );
    const text = pretty(bundle);
    if (args.out) {
      await fs.writeFile(String(args.out), text, 'utf8');
      console.log(`Exported to ${args.out}`);
    } else {
      console.log(text);
    }
    return;
  }

  let rawInput = '';
  if (args.file) {
    rawInput = await fs.readFile(String(args.file), 'utf8');
  } else if (args.stdin) {
    rawInput = await readStdinText();
  } else {
    throw new Error(`${command} requires --file <json> or --stdin`);
  }
  const parsed = JSON.parse(rawInput);
  const body = parsed?.version && parsed?.data ? { bundle: parsed } : { data: parsed };
  const dryRun = command === 'plan';
  const result = await requestJson(baseUrl, '/api/ops-config/import', 'POST', token, {
    ...body,
  });
  const text = pretty(result);
  if (args.out) {
    await fs.writeFile(String(args.out), text, 'utf8');
    console.log(`${command.toUpperCase()} result written to ${args.out}`);
  } else {
    console.log(text);
  }
}

main().catch((err) => {
  console.error(`[aegisctl] ${err?.message || err}`);
  process.exit(1);
});

