// qa-reader.mjs — P12: archive script + lab open in reader.
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const index = 'file:///' + path.join(root, 'index.html').replace(/\\/g, '/');
let fail = 0;
const ok = (n, p, note = '') => {
  if (!p) fail += 1;
  console.log(`${p ? 'PASS' : 'FAIL'} ${n}${note ? ' — ' + note : ''}`);
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(index + '#/archive', { waitUntil: 'load' });
  await page.waitForSelector('.cards .card', { timeout: 15000 });
  // Scripts tab, open first script
  await page.getByRole('button', { name: /^Scripts / }).click();
  await page.waitForTimeout(400);
  const first = await page.$('.cards .card a');
  ok('script card present', !!first);
  if (first) {
    const href = await first.getAttribute('href');
    console.log('script href:', href);
    await first.click();
    await page.waitForSelector('.reader', { timeout: 15000 });
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => {
      const R = window.NTI.require('core/router');
      const Cat = window.NTI.require('core/catalog');
      const id = R.current.params.id;
      const w = Cat.get(id);
      return {
        hash: location.hash,
        route: R.current,
        id,
        kind: w && w.kind,
        formats: w && w.formats,
        doc: !!(window.NTI.docs && window.NTI.docs[id]),
        reader: document.querySelector('.reader') &&
          document.querySelector('.reader').textContent.slice(0, 500),
      };
    });
    console.log('script state:', JSON.stringify(state));
    const body = await page.textContent('body');
    ok('script reader renders', /Copy|Download|lines|#!/i.test(body),
      (await page.title()));
    await page.screenshot({ path: 'qa/script-read.png' });
  }
  // Labs tab, open first lab
  await page.goto(index + '#/archive', { waitUntil: 'load' });
  await page.waitForSelector('.cards .card', { timeout: 15000 });
  await page.getByRole('button', { name: /^Labs / }).click();
  await page.waitForTimeout(400);
  const lab = await page.$('.cards .card a');
  if (lab) {
    await lab.click();
    await page.waitForTimeout(1500);
    const t = await page.textContent('.reader h1, h1');
    ok('lab reader renders', t.trim().length > 2, t.trim().slice(0, 50));
  }
  ok('zero page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  // P12 archive chrome on the lab opened from archive
  const labBody = await page.textContent('body');
  ok('archive breadcrumb', /Archive/.test(labBody) &&
    /Back to Archive/.test(labBody));
  ok('archive cache line', /Cached locally/.test(labBody));
  // P05 course view
  await page.goto(index + '#/course/ext-terraform', { waitUntil: 'load' });
  await page.waitForSelector('.hero-display', { timeout: 15000 });
  const courseBody = await page.textContent('body');
  ok('course sandbox state', /Demo sandbox state/.test(courseBody));
  ok('course blocked embed note', /may block embedding/.test(courseBody));
  ok('course syllabus', /Curriculum syllabus/.test(courseBody));
  ok('course snapshots', /Cached offline snapshots/.test(courseBody));
  ok('course finish toggle', /I finished this course/.test(courseBody));
  await page.screenshot({ path: 'qa/course-lg-light.png' });
} finally {
  await browser.close();
}
process.exit(fail ? 1 : 0);
