// qa-a11y.mjs — axe scan per view. Run: node qa/qa-a11y.mjs
import { chromium } from 'playwright';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const axeSource = require('fs').readFileSync(
  require.resolve('axe-core/axe.min.js'), 'utf8');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const index = 'file:///' + path.join(root, 'index.html').replace(/\\/g, '/');
const views = ['#/', '#/roadmap', '#/archive', '#/about', '#/track/docker'];
let fail = 0;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const h of views) {
    await page.goto(index + h, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await page.addScriptTag({ content: axeSource });
    const res = await page.evaluate(async () => {
      const r = await axe.run({ resultTypes: ['violations'] });
      return r.violations
        .filter((v) => ['serious', 'critical'].includes(v.impact))
        .map((v) => `${v.id}(${v.impact}) x${v.nodes.length}`);
    });
    const pass = res.length === 0;
    if (!pass) fail += 1;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${h}${res.length ? ' — ' + res.join(', ') : ''}`);
  }
} finally {
  await browser.close();
}
console.log(fail ? `${fail} views with violations` : 'all views clean');
process.exit(fail ? 1 : 0);
