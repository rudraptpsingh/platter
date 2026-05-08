#!/usr/bin/env node
/**
 * platter-mcp-setup
 * Registers platter as a Claude Code MCP server in one command.
 *
 * Usage:
 *   npx platter-mcp-setup
 *   npx platter-mcp-setup --dry-run    (print what would happen, don't write)
 *   npx platter-mcp-setup --uninstall  (remove platter MCP entry)
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const DRY_RUN   = process.argv.includes('--dry-run');
const UNINSTALL = process.argv.includes('--uninstall');

const APP_PATH   = '/Applications/platter.app';
const MCP_BIN    = `${APP_PATH}/Contents/MacOS/platter`;
const SERVER_KEY = 'platter';

// ── helpers ────────────────────────────────────────────────────────────────

function log(msg)  { process.stdout.write(`\x1b[0m${msg}\n`); }
function ok(msg)   { process.stdout.write(`\x1b[32m✓\x1b[0m  ${msg}\n`); }
function warn(msg) { process.stdout.write(`\x1b[33m⚠\x1b[0m  ${msg}\n`); }
function err(msg)  { process.stdout.write(`\x1b[31m✗\x1b[0m  ${msg}\n`); }
function dim(msg)  { process.stdout.write(`\x1b[2m   ${msg}\x1b[0m\n`); }
function header()  {
  log('');
  log('\x1b[1mplatter-mcp-setup\x1b[0m  ·  wire platter into Claude Code');
  log('────────────────────────────────────────────────');
}

function run(cmd, label) {
  if (DRY_RUN) {
    dim(`[dry-run] would run: ${cmd}`);
    return '';
  }
  const result = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  if (result.status !== 0) {
    err(`Failed: ${label}`);
    if (result.stderr) dim(result.stderr.trim());
    return null;
  }
  return result.stdout?.trim() ?? '';
}

function claudeAvailable() {
  const r = spawnSync('claude', ['--version'], { shell: true, encoding: 'utf8' });
  return r.status === 0;
}

// ── main ───────────────────────────────────────────────────────────────────

header();

if (process.platform !== 'darwin') {
  err('platter is currently macOS-only. Windows/Linux support is planned.');
  process.exit(1);
}

// 1 — Check platter.app is installed
if (!existsSync(APP_PATH)) {
  err(`platter.app not found at ${APP_PATH}`);
  log('');
  log('  Download it first:');
  dim('  https://github.com/rudraptpsingh/platter/releases');
  log('  or:');
  dim('  brew install --cask platter');
  log('');
  process.exit(1);
}
ok(`platter.app found  →  ${APP_PATH}`);

// 2 — Check claude CLI is available
if (!claudeAvailable()) {
  err('Claude Code CLI not found. Install it from https://claude.ai/code');
  process.exit(1);
}
ok('Claude Code CLI found');

// ── uninstall path ─────────────────────────────────────────────────────────
if (UNINSTALL) {
  log('');
  log('Removing platter MCP server...');
  const result = run(`claude mcp remove ${SERVER_KEY}`, 'remove MCP server');
  if (result !== null) ok(`Removed MCP server "${SERVER_KEY}"`);
  log('');
  process.exit(result !== null ? 0 : 1);
}

// ── install path ───────────────────────────────────────────────────────────

// 3 — Check for existing registration
const listResult = spawnSync('claude', ['mcp', 'list'], { shell: true, encoding: 'utf8' });
const alreadyRegistered = listResult.stdout?.includes(SERVER_KEY);

if (alreadyRegistered) {
  warn(`MCP server "${SERVER_KEY}" is already registered.`);
  dim(`Run with --uninstall first to re-register.`);
  log('');
  ok('Nothing to do — platter is already wired into Claude Code.');
  printUsage();
  process.exit(0);
}

// 4 — Register the MCP server
log('');
log(`Registering MCP server: ${SERVER_KEY}`);
dim(`claude mcp add ${SERVER_KEY} -- ${MCP_BIN} --mcp-stdio`);

const registerResult = run(
  `claude mcp add ${SERVER_KEY} -- "${MCP_BIN}" --mcp-stdio`,
  'register MCP server'
);

if (registerResult === null) {
  process.exit(1);
}

ok(`Added MCP server "${SERVER_KEY}"  ·  transport: stdio`);

// 5 — Verify it shows up
const verify = spawnSync('claude', ['mcp', 'list'], { shell: true, encoding: 'utf8' });
const verified = verify.stdout?.includes(SERVER_KEY);

if (!DRY_RUN && !verified) {
  warn('Registration may have failed — platter not found in `claude mcp list`');
} else {
  ok('Verified in `claude mcp list`');
}

log('');
printUsage();

function printUsage() {
  log('\x1b[1mReady.\x1b[0m  In your next Claude Code session, Claude can:');
  log('');
  dim('present_mockups()      — block and ask you to approve / reject / pick');
  dim('create_share()         — generate an async public review link');
  dim('record_decision()      — log a verdict without asking');
  dim('get_decision_history() — look up what was already approved or rejected');
  dim('list_recent()          — see what files were generated recently');
  log('');
  log('Docs: \x1b[4mhttps://platter.pages.dev\x1b[0m');
  log('');
}
