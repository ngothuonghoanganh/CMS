#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] ?? 'help';
const forwardedArgs = process.argv.slice(3);

const scripts = new Set(['build', 'dev', 'start', 'test', 'lint', 'typecheck', 'verify']);

function packageName(root) {
  const packagePath = join(root, 'package.json');
  if (!existsSync(packagePath)) return undefined;

  try {
    return JSON.parse(readFileSync(packagePath, 'utf8')).name;
  } catch {
    return undefined;
  }
}

function findWorkspaceRoot() {
  const configuredRoot = process.env.PAYLOAD_PLATFORM_ROOT;
  if (
    configuredRoot &&
    packageName(resolve(configuredRoot)) === 'payload-landing-page-platform'
  ) {
    return resolve(configuredRoot);
  }

  let current = resolve(process.cwd());
  while (true) {
    if (packageName(current) === 'payload-landing-page-platform') return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const linkedRoot = resolve(cliRoot, '../..');
  if (packageName(linkedRoot) === 'payload-landing-page-platform') return linkedRoot;
  return undefined;
}

function printHelp() {
  console.log(`Payload Page Platform

Usage:
  payload-platform <command>

Commands:
  build       Build contracts, API, CMS and renderer
  start       Build and start all production services
  dev         Start the development workspace
  install     Install dependencies in the current workspace
  test        Run the workspace test suite
  lint        Run workspace linting
  typecheck   Run workspace type checks
  verify      Run formatting, lint, type checks, tests and build

The command targets the nearest workspace root from the current directory. Set
PAYLOAD_PLATFORM_ROOT to override workspace discovery.
`);
}

if (command === 'help' || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

const root = findWorkspaceRoot();
if (!root) {
  console.error(
    'Could not find the Payload workspace. Run this command inside the repository or set PAYLOAD_PLATFORM_ROOT.',
  );
  process.exit(1);
}

const script = command === 'install' ? 'install' : command;
if (!scripts.has(script) && script !== 'install') {
  console.error(`Unknown command "${command}".`);
  printHelp();
  process.exit(1);
}

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const child = spawn(pnpmCommand, ['--dir', root, script, ...forwardedArgs], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`Could not start pnpm: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
