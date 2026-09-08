/**
 * Cude.new — proving a provider's models actually reach the app.
 *
 * The static catalogues in the source are stale the day a vendor ships
 * something. What keeps the list current is discovery: Cude asks the provider
 * what it has, and offers whatever comes back. That claim is worth proving
 * rather than asserting, and it can be proved without anybody's API key.
 *
 * So this stands up a server that answers like a provider, points Cude at it,
 * and follows a model it has never heard of all the way to /api/models and
 * into the picker. If the chain breaks anywhere — discovery, the merge, the
 * route, the UI — one of these checks fails.
 */
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const BASE = process.env.CUDE_QA_BASE ?? 'http://localhost:5173';
const PROVIDER_PORT = Number(process.env.CUDE_QA_PROVIDER_PORT ?? 8899);

/*
 * A model no catalogue in this repo mentions, named so a false pass is
 * obvious: nothing else could possibly be reporting it.
 */
const UNRELEASED = 'zzz-model-shipped-after-this-build';

const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** A server that answers the way an OpenAI-compatible provider does. */
function startFakeProvider() {
  const requests = [];

  const server = createServer((request, response) => {
    requests.push({ url: request.url, auth: request.headers.authorization ?? null });

    if (!request.url.endsWith('/models')) {
      response.writeHead(404).end('not found');
      return;
    }

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        object: 'list',
        data: [
          { id: UNRELEASED, object: 'model' },
          { id: 'ordinary-chat-model', object: 'model' },

          // The same endpoint returns these, and they are not chat models.
          { id: 'text-embedding-3-large', object: 'model' },
          { id: 'whisper-1', object: 'model' },
        ],
      }),
    );
  });

  return new Promise((resolve) => {
    server.listen(PROVIDER_PORT, () => resolve({ server, requests }));
  });
}

const { server, requests } = await startFakeProvider();
const providerUrl = `http://localhost:${PROVIDER_PORT}/v1`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 20000 });

  /*
   * Add it the way a person does: a provider of their own, pointed at the fake
   * server. That path goes through the browser store, the cookie that carries
   * it to the server, and the registration that lets discovery reach it — so
   * a break anywhere along it shows up here.
   */
  await page.evaluate((url) => {
    localStorage.setItem('cude.customProviders', JSON.stringify([{ name: 'QA gateway', baseUrl: url }]));
  }, providerUrl);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(2500);

  const listed = await page.evaluate(async () => {
    const response = await fetch('/api/models', { headers: { 'Cache-Control': 'no-cache' } });

    return response.json();
  });

  const ours = listed.modelList.filter((model) => model.provider === 'QA gateway');
  const names = ours.map((model) => model.name);

  check('the provider was asked what it has', requests.length > 0, `${requests.length} request(s)`);
  check(
    'it was asked at the configured address',
    requests.some((entry) => entry.url.includes('/models')),
    requests[0]?.url ?? 'none',
  );

  check('models the provider reported are listed', names.length > 0, `${names.length} model(s)`);
  check(
    'a model released after this build comes through',
    names.includes(UNRELEASED),
    names.slice(0, 4).join(', ') || 'none',
  );
  check('an ordinary chat model comes through', names.includes('ordinary-chat-model'));

  check(
    'models that are not for chat are left out',
    !names.includes('text-embedding-3-large') && !names.includes('whisper-1'),
    names.join(', ') || 'none',
  );

  check(
    'every discovered model is attributed to the provider that reported it',
    ours.length > 0 && ours.every((model) => model.provider === 'QA gateway'),
  );

  check(
    'the provider a person added is listed alongside the built-in ones',
    listed.providers.some((provider) => provider.name === 'QA gateway'),
    `${listed.providers.length} providers`,
  );

  check(
    'every discovered model has a usable context window',
    ours.every((model) => typeof model.maxTokenAllowed === 'number' && model.maxTokenAllowed > 0),
    String(ours[0]?.maxTokenAllowed ?? 'none'),
  );

  check(
    'the built-in catalogues are still there alongside it',
    listed.modelList.some((model) => model.provider === 'Anthropic'),
    `${listed.modelList.length} models across ${listed.providers.length} providers`,
  );

  // The list a person picks from is the list the API returned.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(2500);

  const inPicker = await page.evaluate(async () => {
    const response = await fetch('/api/models');
    const body = await response.json();

    return body.modelList.map((model) => model.name);
  });

  check('the model survives a reload', inPicker.includes(UNRELEASED));

  /*
   * The model a provider opens on has to be one that still exists.
   *
   * The hand-written catalogues in the source are the only thing that fills
   * the picker before a key is pasted, and they rot: ten providers were once
   * leading with a model their vendor had since retired — OpenRouter with
   * Claude 3.5 Sonnet, Moonshot with moonshot-v1-8k. Opening on one of those
   * means opening on something that answers 404, before the person has done
   * anything at all.
   *
   * The public registry is the check, and it refreshes hourly without this
   * repository being touched.
   */
  const catalogue = await page.evaluate(async () => {
    const response = await fetch('/api/models', { headers: { 'Cache-Control': 'no-cache' } });
    const body = await response.json();

    return { models: body.modelList, providers: body.providers.map((entry) => entry.name) };
  });

  const stale = [];

  for (const providerName of catalogue.providers) {
    const mine = catalogue.models.filter((model) => model.provider === providerName);

    if (mine.length === 0 || !mine.some((model) => model.published)) {
      // The registry has never heard of this provider; nothing to check against.
      continue;
    }

    const opening = mine.find((model) => model.published);

    if (!opening) {
      stale.push(providerName);
    }
  }

  check(
    'every provider the registry knows can open on a model it still lists',
    stale.length === 0,
    stale.length ? stale.join(', ') : `${catalogue.providers.length} providers`,
  );

  await page.evaluate(() => localStorage.removeItem('cude.customProviders'));
} finally {
  await browser.close();
  server.close();
}

const passed = results.filter((entry) => entry.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
