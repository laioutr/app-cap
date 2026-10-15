import { existsSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { signBotProtectionBypass } from '@laioutr-core/frontend-core/bot-protection';
import { BLOCKING_URL, E2E_SECRET, OPEN_URL } from '../../playwright.config';

const ACTION = 'app-cap/playground-check';
const ASSETS = '/app-cap/0.1.58';

const result = (page: Page) => page.locator('[data-result]');

test.describe('a browser that may solve', () => {
  test('passes a protected action once per proof, from the project origin only', async ({ page }) => {
    const foreign: string[] = [];
    const redeemBodies: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== OPEN_URL) foreign.push(request.url());
      if (request.url().endsWith('/api/app-cap/redeem')) redeemBodies.push(request.postData() ?? '');
    });

    await page.goto(`${OPEN_URL}/check`);
    await page.click('[data-protect]');
    await expect(result(page)).toHaveText(/^200 /, { timeout: 30_000 });

    await page.click('[data-reuse]');
    await expect(result(page)).toHaveText(/^403 .*bot-protection-rejected/);

    // The next proof was solved ahead, so this one does not wait for a solve.
    await page.click('[data-protect]');
    await expect(result(page)).toHaveText(/^200 /, { timeout: 30_000 });

    expect(foreign).toEqual([]);

    // A solved challenge redeems once. The browser already redeemed this one.
    expect(redeemBodies.length).toBeGreaterThan(0);
    const replay = await page.request.post(`${OPEN_URL}/api/app-cap/redeem`, {
      data: redeemBodies[0],
      headers: { 'content-type': 'application/json' },
    });
    expect(replay.status()).toBe(403);
    expect(await replay.json()).toEqual({ success: false });
  });

  test('serves the widget files as immutable, with the WASM type', async ({ request }) => {
    for (const file of ['solver.wasm', 'hashwx.wasm']) {
      const response = await request.get(`${OPEN_URL}${ASSETS}/${file}`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('application/wasm');
      expect(response.headers()['cache-control']).toContain('immutable');
    }
  });
});

test.describe('a headless browser with the automation check on', () => {
  test('cannot get a proof', async ({ page }) => {
    await page.goto(`${BLOCKING_URL}/check`);
    await page.click('[data-protect]');
    await expect(result(page)).toHaveText(/^prepare failed: .*redeem/, { timeout: 30_000 });
  });

  test('passes with the signed bypass that test suites use', async ({ request }) => {
    const bypass = await signBotProtectionBypass(E2E_SECRET, ACTION, Math.floor(Date.now() / 1_000));
    const response = await request.post(`${BLOCKING_URL}/api/playground-check`, {
      headers: { 'x-laioutr-bypass-bot-protection': bypass },
    });
    expect(response.status()).toBe(200);
  });
});

test('the server output carries neither esbuild nor the obfuscator, and inlines capjs-core', () => {
  for (const output of ['playground/.output', 'playground/.output-open']) {
    for (const name of ['esbuild', 'javascript-obfuscator', 'capjs-core']) {
      expect(existsSync(`${output}/server/node_modules/${name}`), `${output}: ${name}`).toBe(false);
    }
  }
});
