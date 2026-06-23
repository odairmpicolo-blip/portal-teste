import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const portalRoot = process.env.PORTAL_ROOT || path.resolve(scriptDir, '..');
const nodePath = process.execPath;

function gitEnv() {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: portalRoot,
    env: gitEnv(),
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`Comando falhou: ${command} ${args.join(' ')}${detail ? ` — ${detail}` : ''}`);
  }
  return result;
}

function output(command, args) {
  return spawnSync(command, args, {
    cwd: portalRoot,
    env: gitEnv(),
    encoding: 'utf8',
    stdio: 'pipe',
  }).stdout.trim();
}

function parseGithubRepo(remote) {
  const match = String(remote).match(/github\.com[/:]([^/]+\/[^/.]+)/);
  return match ? match[1] : '';
}

function gitPush() {
  const token = (process.env.CIOP_GITHUB_TOKEN || '').trim();
  const branch = output('git', ['branch', '--show-current']) || 'main';

  if (token) {
    const remote = output('git', ['remote', 'get-url', 'origin']);
    const repo = parseGithubRepo(remote);
    if (!repo) throw new Error('Nao foi possivel identificar o repositorio GitHub em origin.');
    const pushUrl = `https://x-access-token:${token}@github.com/${repo}.git`;
    run('git', ['push', pushUrl, `HEAD:${branch}`]);
    return;
  }

  run('git', ['push']);
}

run(nodePath, [path.join(portalRoot, 'scripts', 'atualizar-incidentes-tcgl.mjs')]);

run('git', ['add', 'assets/data/incidentes-tcgl.json']);
const changed = output('git', ['status', '--short', '--', 'assets/data/incidentes-tcgl.json']);

if (!changed) {
  console.log('GitHub: sem alteracoes nos dados de incidentes.');
  process.exit(0);
}

const stamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
run('git', ['commit', '-m', `Atualiza incidentes TCGL - ${stamp}`]);
gitPush();
console.log('GitHub: dados de incidentes enviados.');
