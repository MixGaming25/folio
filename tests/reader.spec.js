const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#content h1')).toContainText('Your words.');
}
async function importMarkdown(page, name, content) {
  await page.locator('#file-input').setInputFiles({ name, mimeType: 'text/markdown', buffer: Buffer.from(content) });
  await expect(page.locator('#current-filename')).toHaveText(name);
}

test('polished welcome, outline, code and table render offline', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await expect(page.locator('#toc a')).toHaveCount(5);
  await expect(page.locator('.prose table')).toBeVisible();
  await expect(page.locator('.prose pre .hljs-keyword').first()).toBeVisible();
  await page.locator('#toc a').filter({ hasText: 'Make it yours' }).click();
  await expect(page.locator('#toc a.active')).toHaveText('Make it yours');
  await page.locator('#reading-scroll').evaluate(el => { el.style.scrollBehavior = 'auto'; el.scrollTop = 0; });
  await expect(page.locator('#toc a.active')).toHaveText('Welcome to your reading room');
  await page.screenshot({ path: 'artifacts/folio-light.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('opens files, sanitizes unsafe HTML, and searches literal text', async ({ page }) => {
  await ready(page);
  await importMarkdown(page, 'My notes.md', '# My notes\n\nA meaningful needle. Another needle.\n\n<script>window.pwned=true</script>\n<img src=x onerror="window.pwned=true">\n<a href="javascript:alert(1)">bad</a>\n\n- [x] Done\n\n## Repeat\n## Repeat\n\n```js\nconst answer = 42;\n```');
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  await expect(page.locator('#content script,#content [onerror],#content a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.locator('#content input[type=checkbox]')).toBeChecked();
  await expect(page.locator('#content input[type=checkbox]')).toBeDisabled();
  expect(await page.locator('#content h2').evaluateAll(nodes => nodes.map(n => n.id))).toEqual(['repeat', 'repeat-1']);
  await page.keyboard.press('Control+f');
  await page.locator('#find-input').fill('needle');
  await expect(page.locator('#find-count')).toHaveText('1 / 2');
  await page.keyboard.press('Enter');
  await expect(page.locator('#find-count')).toHaveText('2 / 2');
  await page.keyboard.press('Escape');
  await expect(page.locator('mark.search-match')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#content h1')).toHaveText('My notes');
  await page.locator('#library-filter').fill('absent');
  await expect(page.getByText('No matching documents.')).toBeVisible();
});

test('appearance, focus mode, source view and remembered reading position', async ({ page }) => {
  await ready(page);
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#appearance-toggle').click();
  await page.locator('#size-plus').click();
  await page.locator('#font-select').selectOption('serif');
  await page.locator('#width-select').selectOption('wide');
  await page.locator('#focus-toggle').click();
  await expect(page.locator('body')).toHaveClass(/focus-mode/);
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/focus-mode/);
  await page.locator('#more-toggle').click();
  await page.locator('#source-toggle').click();
  await expect(page.locator('#source-view')).toBeVisible();
  await expect(page.locator('#content')).toBeHidden();
  await page.locator('#more-toggle').click();
  await page.locator('#source-toggle').click();
  await page.locator('#reading-scroll').evaluate(el => { el.style.scrollBehavior = 'auto'; el.scrollTop = 400; });
  await expect.poll(() => page.locator('#reading-scroll').evaluate(el => el.scrollTop)).toBeGreaterThan(350);
  await page.waitForTimeout(650);
  await page.reload();
  await expect(page.locator('#content h1')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.locator('#reading-scroll').evaluate(el => el.scrollTop)).toBeGreaterThan(350);
  await expect(page.locator('#size-value')).toHaveText('18');
  await page.screenshot({ path: 'artifacts/folio-dark.png', fullPage: true });
});

test('native disk files update live and resolve neighboring images and links', async ({ page, request }) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-test-'));
  try {
    const filename = path.join(temp, 'disk.md');
    await fs.writeFile(filename, '# From disk\n\n![local](leaf.svg)\n\n[Next document](next.md)');
    await fs.writeFile(path.join(temp, 'next.md'), '# Next document');
    await fs.writeFile(path.join(temp, 'leaf.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>');
    await ready(page);
    const token = await page.evaluate(() => window.FOLIO_TOKEN);
    await request.post('/api/queue', { headers: { 'X-Folio-Token': token }, data: { files: [filename] } });
    await expect(page.locator('#content h1')).toHaveText('From disk', { timeout: 7000 });
    await expect.poll(() => page.locator('#content img').evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
    await fs.writeFile(filename, '# Updated on disk\n\n[Next document](next.md)');
    await expect(page.locator('#content h1')).toHaveText('Updated on disk', { timeout: 7000 });
    await page.locator('#content a').click();
    await expect(page.locator('#content h1')).toHaveText('Next document');
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});

test('mobile layout and file drop work without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.locator('#toggle-sidebar').click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await page.locator('.document-select').click();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.evaluate(() => {
    const transfer = new DataTransfer(); transfer.items.add(new File(['# A dropped idea\n\nLovely.'], 'drop.md', { type: 'text/markdown' }));
    document.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  });
  await expect(page.locator('#content h1')).toHaveText('A dropped idea');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/folio-mobile.png', fullPage: true });
});
