// Builds a gallery page of the design captures (`pnpm --filter @plp/e2e visual:capture`), so the
// screens can be looked at outside the machine that ran them: a cloud session publishes it as an
// Artifact (AGENTS.md, "Cloud sessions"). Usage: node scripts/ui-gallery.mjs
//
// Writes tests/e2e/visual-captures/index.html beside the PNGs it shows, and artifact-files.json,
// the `files` map that publishes those PNGs with the page. Both stay gitignored with the captures.
import { execFileSync } from 'node:child_process';
import { openSync, readSync, closeSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const capturesPath = 'tests/e2e/visual-captures';
const captures = join(root, capturesPath);

let files;
try {
  files = readdirSync(captures)
    .filter((name) => name.endsWith('.png'))
    .sort();
} catch (error) {
  throw new Error(`No captures in ${capturesPath}: run pnpm --filter @plp/e2e visual:capture`, {
    cause: error,
  });
}
if (files.length === 0) {
  throw new Error(`No PNG in ${capturesPath}: run pnpm --filter @plp/e2e visual:capture`);
}

/** Width and height from a PNG's IHDR chunk, which always follows the 8-byte signature. */
function pngSize(path) {
  const header = Buffer.alloc(24);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, header, 0, 24, 0);
  } finally {
    closeSync(fd);
  }
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

const shots = files.map((file) => {
  const stem = file.slice(0, -'.png'.length);
  const [screen = stem, ...rest] = stem.split('-');
  return {
    file,
    screen,
    variant: rest.join('-'),
    ...pngSize(join(captures, file)),
    capturedAt: statSync(join(captures, file)).mtimeMs,
  };
});

// A run rewrites every screen it reaches; a PNG much older than the newest one is left over from
// an earlier run, often because its test failed this time.
const newest = Math.max(...shots.map((shot) => shot.capturedAt));
const STALE_AFTER_MS = 30 * 60 * 1000;
for (const shot of shots) {
  shot.stale = newest - shot.capturedAt > STALE_AFTER_MS;
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const commit = git('rev-parse', '--short', 'HEAD');
const subject = git('log', '-1', '--format=%s');

const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const vnTime = (ms) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(ms);

const screens = new Set(shots.map((shot) => shot.screen)).size;
const staleCount = shots.filter((shot) => shot.stale).length;

const cards = shots
  .map(
    (shot, index) => `
      <li class="card" data-name="${escapeHtml(shot.file.toLowerCase())}">
        <button type="button" class="open" data-index="${index}" aria-label="Xem ${escapeHtml(shot.file)}">
          <span class="thumb"><img src="${escapeHtml(shot.file)}" alt="" loading="lazy" width="${shot.width}" height="${shot.height}"></span>
          <span class="meta">
            <span class="name">${escapeHtml(shot.screen)}${shot.variant ? `<span class="variant">${escapeHtml(shot.variant)}</span>` : ''}</span>
            <span class="facts"><span>${shot.width}×${shot.height}</span><span>${vnTime(shot.capturedAt)}</span>${shot.stale ? '<span class="stale">ảnh cũ</span>' : ''}</span>
          </span>
        </button>
      </li>`,
  )
  .join('');

const data = JSON.stringify(
  shots.map(({ file, screen, variant, width, height, stale }) => ({
    file,
    label: variant ? `${screen} · ${variant}` : screen,
    size: `${width}×${height}`,
    stale,
  })),
).replace(/</g, '\\u003c');

const html = `<title>PLP Screen Captures</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  /* Layout: a contact sheet of the admin's screens, in the admin's own palette (packages/ui). */
  :root {
    --bg: #f5f6f8;
    --surface: #ffffff;
    --fg: #15171c;
    --muted: #5e6573;
    --border: #e2e5ea;
    --accent: #4338ca;
    --accent-soft: #eef0ff;
    --warn-ink: #8a5300;
    --warn-soft: #fff1d6;
    --shade: rgb(21 23 28 / 0.55);
    --font-sans: 'Be Vietnam Pro', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme='light']) {
      --bg: #101217; --surface: #181b22; --fg: #eceef2; --muted: #9aa1ae; --border: #2a2f39;
      --accent: #a9abff; --accent-soft: #24264a; --warn-ink: #f3c46b; --warn-soft: #3a2c10;
      --shade: rgb(0 0 0 / 0.7); color-scheme: dark;
    }
  }
  :root[data-theme='dark'] {
    --bg: #101217; --surface: #181b22; --fg: #eceef2; --muted: #9aa1ae; --border: #2a2f39;
    --accent: #a9abff; --accent-soft: #24264a; --warn-ink: #f3c46b; --warn-soft: #3a2c10;
    --shade: rgb(0 0 0 / 0.7); color-scheme: dark;
  }
  * { box-sizing: border-box; }
  body {
    background: var(--bg); color: var(--fg); font-family: var(--font-sans); font-size: 14px;
    line-height: 1.5;
  }
  .page {
    max-width: 1320px; margin: 0 auto; padding-block: 28px 48px;
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
    display: grid; gap: 20px;
  }
  header { display: grid; gap: 8px; }
  h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.01em; text-wrap: balance; }
  .build { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--muted); }
  .build code {
    font-family: var(--font-mono); font-size: 12.5px; color: var(--fg); background: var(--surface);
    border: 1px solid var(--border); border-radius: 6px; padding: 1px 6px;
  }
  .subject { color: var(--fg); min-width: 0; overflow-wrap: anywhere; }
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
  .tools input {
    flex: 1 1 260px; max-width: 420px; font: inherit; color: var(--fg); background: var(--surface);
    border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px;
  }
  .tools input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .count { color: var(--muted); font-variant-numeric: tabular-nums; }
  .grid {
    list-style: none; margin: 0; padding: 0; display: grid; gap: 16px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }
  .open {
    all: unset; box-sizing: border-box; display: grid; width: 100%; height: 100%; cursor: pointer;
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    overflow: hidden;
  }
  .open:hover { border-color: var(--accent); }
  .open:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .thumb { display: block; aspect-ratio: 16 / 10; max-width: 100%; overflow: hidden; border-bottom: 1px solid var(--border); background: var(--bg); }
  .thumb img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top left; }
  .meta { display: grid; gap: 4px; padding: 10px 12px 12px; min-width: 0; }
  .name { font-weight: 600; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
  .variant {
    font-weight: 500; font-size: 12px; color: var(--accent); background: var(--accent-soft);
    border-radius: 999px; padding: 0 8px;
  }
  .facts {
    display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--muted); font-size: 12.5px;
    font-family: var(--font-mono); font-variant-numeric: tabular-nums;
  }
  .stale {
    font-family: var(--font-sans); font-weight: 600; color: var(--warn-ink);
    background: var(--warn-soft); border-radius: 999px; padding: 0 8px;
  }
  .empty { color: var(--muted); }
  dialog {
    width: min(1480px, 100vw); max-width: 100vw; height: 100vh; max-height: 100vh; margin: 0 auto;
    padding: 0; border: 0; background: var(--bg); color: var(--fg);
  }
  dialog::backdrop { background: var(--shade); }
  .viewer { display: grid; grid-template-rows: auto 1fr; height: 100%; }
  .bar {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
    padding-block: calc(10px + env(safe-area-inset-top, 0px)) 10px;
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
    background: var(--surface); border-bottom: 1px solid var(--border);
  }
  .bar h2 { margin: 0; font-size: 15px; font-weight: 600; flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
  .bar .facts { flex: 0 0 auto; }
  .bar button {
    font: inherit; font-weight: 500; color: var(--fg); background: var(--bg);
    border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; cursor: pointer;
  }
  .bar button:hover { border-color: var(--accent); }
  .bar button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .stage { overflow: auto; padding: 16px; }
  .stage img { display: block; margin: 0 auto; max-width: 100%; height: auto; box-shadow: 0 1px 3px var(--shade); }
  .stage.actual img { max-width: none; }
  @media (prefers-reduced-motion: no-preference) {
    .open { transition: border-color 120ms ease; }
  }
</style>
<div class="page">
  <header>
    <h1>PLP Screen Captures</h1>
    <div class="build">
      <span>Nhánh <code>${escapeHtml(branch)}</code></span>
      <span>Commit <code>${escapeHtml(commit)}</code></span>
      <span>Chụp lúc ${vnTime(newest)}</span>
    </div>
    ${subject ? `<div class="subject">${escapeHtml(subject)}</div>` : ''}
  </header>
  <div class="tools">
    <input id="filter" type="search" placeholder="Lọc theo tên màn hình, ví dụ Pipeline" aria-label="Lọc theo tên màn hình" autocomplete="off">
    <span class="count" id="count">${shots.length} ảnh · ${screens} màn hình${staleCount ? ` · ${staleCount} ảnh cũ` : ''}</span>
  </div>
  <ul class="grid" id="grid">${cards}
  </ul>
  <p class="empty" id="empty" hidden>Không có ảnh nào khớp.</p>
</div>
<dialog id="viewer" aria-labelledby="viewer-title">
  <div class="viewer">
    <div class="bar">
      <h2 id="viewer-title"></h2>
      <span class="facts" id="viewer-facts"></span>
      <button type="button" id="prev" aria-label="Ảnh trước">←</button>
      <button type="button" id="next" aria-label="Ảnh sau">→</button>
      <button type="button" id="scale">Kích thước thật</button>
      <button type="button" id="close">Đóng</button>
    </div>
    <div class="stage" id="stage"><img id="viewer-image" alt=""></div>
  </div>
</dialog>
<script>
  const shots = ${data};
  const viewer = document.getElementById('viewer');
  const stage = document.getElementById('stage');
  const image = document.getElementById('viewer-image');
  const title = document.getElementById('viewer-title');
  const facts = document.getElementById('viewer-facts');
  const scale = document.getElementById('scale');
  let current = 0;

  function visibleIndexes() {
    return [...document.querySelectorAll('.card:not([hidden]) .open')].map((el) => Number(el.dataset.index));
  }
  function show(index) {
    current = index;
    const shot = shots[index];
    image.src = shot.file;
    image.alt = shot.label;
    title.textContent = shot.label;
    facts.textContent = shot.size + (shot.stale ? ' · ảnh cũ' : '');
    stage.scrollTo(0, 0);
    if (!viewer.open) viewer.showModal();
  }
  function step(delta) {
    const order = visibleIndexes();
    const at = order.indexOf(current);
    if (order.length === 0) return;
    show(order[(at + delta + order.length) % order.length]);
  }
  document.getElementById('grid').addEventListener('click', (event) => {
    const button = event.target.closest('.open');
    if (button) show(Number(button.dataset.index));
  });
  document.getElementById('prev').addEventListener('click', () => step(-1));
  document.getElementById('next').addEventListener('click', () => step(1));
  document.getElementById('close').addEventListener('click', () => viewer.close());
  scale.addEventListener('click', () => {
    const actual = stage.classList.toggle('actual');
    scale.textContent = actual ? 'Vừa khung' : 'Kích thước thật';
  });
  viewer.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  });
  document.getElementById('filter').addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    let shown = 0;
    for (const card of document.querySelectorAll('.card')) {
      card.hidden = query !== '' && !card.dataset.name.includes(query);
      if (!card.hidden) shown += 1;
    }
    document.getElementById('empty').hidden = shown > 0;
  });
</script>
`;

writeFileSync(join(captures, 'index.html'), html);
writeFileSync(
  join(captures, 'artifact-files.json'),
  `${JSON.stringify(Object.fromEntries(files.map((file) => [file, `${capturesPath}/${file}`])), null, 2)}\n`,
);
console.log(
  `${capturesPath}/index.html: ${shots.length} captures of ${screens} screens` +
    (staleCount ? `, ${staleCount} left from an earlier run` : '') +
    `. Publish it with the files map in ${capturesPath}/artifact-files.json.`,
);
