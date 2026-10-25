// Copies CSS files from a package's src/ to dist/ so compiled components can import them.
// Usage: node scripts/copy-css.mjs <src> <dist> [--watch]
import { copyFileSync, mkdirSync, readdirSync, watch } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const [srcDir, distDir, flag] = process.argv.slice(2);
if (!srcDir || !distDir) {
  console.error('Usage: copy-css.mjs <src> <dist> [--watch]');
  process.exit(1);
}

function copy(file) {
  const target = join(distDir, relative(srcDir, file));
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(file, target);
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
    } else if (entry.name.endsWith('.css')) {
      copy(path);
    }
  }
}

walk(srcDir);

if (flag === '--watch') {
  watch(srcDir, { recursive: true }, (_event, name) => {
    if (name?.endsWith('.css')) {
      copy(join(srcDir, name));
    }
  });
}
