/**
 * Cude.new — finding the programs already on this machine.
 *
 * Cloning is only pleasant if the person can point at the thing instead of
 * describing it. So when Cude is running on someone's own machine, this reads
 * the two places that say what they use: the Start Menu, and the browser
 * profiles' extension folders.
 *
 * Two limits are deliberate and worth stating.
 *
 * The first is the guard: this reads the filesystem of whatever host it runs
 * on, which is a fine thing to do on a laptop and an unpleasant thing to do on
 * a deployed server. `isLocalRequest` decides, and everything here is behind
 * it. On a Cloudflare deploy there is no filesystem at all and the import fails
 * closed.
 *
 * The second is that a browser will not tell a web page what extensions are
 * installed — no API exposes it, by design. Reading the profile folders is the
 * honest way round, and it is why the extension list carries the profile it
 * came from: it is what is on disk, not what the current tab has loaded.
 */

export interface LocalProgram {
  name: string;
  publisher?: string;
  version?: string;

  /** Where we found it, shown so the person can tell two similar entries apart. */
  source: string;
}

export interface LocalExtension {
  id: string;
  name: string;
  version?: string;
  description?: string;

  /** "Chrome — Person 1", so a person with several profiles can tell which. */
  profile: string;
  browser: string;
  storeUrl?: string;
}

export interface LocalDiscovery {
  available: boolean;

  /** Why the list is empty, when it is empty for a reason worth showing. */
  reason?: string;
  programs: LocalProgram[];
  extensions: LocalExtension[];
}

const EMPTY: LocalDiscovery = { available: false, programs: [], extensions: [] };

/*
 * Whether the last scan actually reached a directory.
 *
 * `node:fs` can import successfully somewhere that has no real filesystem — a
 * Workers deploy with the node compatibility flag does exactly that, and every
 * read then fails quietly. Without this the dialog reported an empty machine
 * instead of an unreadable one, and told people their apps did not match.
 */
let reachedFilesystem = false;

/**
 * True when the request came from the machine running the server.
 *
 * A remote deploy must never answer this route: the answer describes somebody's
 * computer. Hostname is what the browser connected to, so a public deployment
 * fails this check no matter what a caller puts in a header.
 */
export function isLocalRequest(request: Request): boolean {
  try {
    const { hostname } = new URL(request.url);

    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  } catch {
    return false;
  }
}

/** The node modules we need, or null where there is no filesystem. */
async function nodeFs() {
  try {
    const [fs, path, os] = await Promise.all([import('node:fs/promises'), import('node:path'), import('node:os')]);

    return { fs, path, os };
  } catch {
    return null;
  }
}

async function readJson<T>(fs: typeof import('node:fs/promises'), file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function exists(fs: typeof import('node:fs/promises'), target: string): Promise<boolean> {
  try {
    await fs.access(target);

    return true;
  } catch {
    return false;
  }
}

/**
 * The Start Menu folders that hold the operating system rather than programs.
 *
 * Without this the list opens on Administrative Tools and Control Panel, and
 * the app someone actually wants is forty rows down.
 */
const SYSTEM_FOLDERS =
  /^(accessibility|accessories|administrative tools|system tools|windows (system|accessories|powershell|kits|administrative tools)|maintenance|startup|donat|başlangıç|sistem araçları|yönetimsel araçlar)$/i;

/** Shortcuts that ship beside a program but are not the program. */
const NOISE_NAMES =
  /^(uninstall|remove |readme|help$|documentation|license|website|visit |check for updates|release notes|support|report a|command prompt|file explorer|computer$|control panel|run$|task manager|registry editor|notepad$|character map|windows |microsoft edge$|internet explorer|kaldır|yardım|belgeler|çalıştır|bilgisayar$|denetim masası|komut istemi)/i;

/**
 * Documentation that installers drop next to the program.
 *
 * Matched anywhere in the name, because these arrive as "Git Release Notes"
 * and "LockHunter on the Web" — the program's name first, the giveaway second.
 */
const NOISE_SUFFIXES =
  /(release notes|on the web|frequently asked|\bfaq\b|user guide|\bmanual\b|kılavuz|readme|getting started|install additional|command line|\bhelp\b)/i;

/** True when a shortcut is part of Windows, or documentation, rather than a program. */
export function isNoise(name: string): boolean {
  const trimmed = name.trim();

  return NOISE_NAMES.test(trimmed) || NOISE_SUFFIXES.test(trimmed);
}

/**
 * Extensions the browser installs for itself.
 *
 * They sit in the same folder as everything the person chose, have no visible
 * surface, and are not a thing anyone means when they say "clone my extension".
 */
const BROWSER_COMPONENTS = new Set([
  'nmmhkkegccagdldgiimedpiccmgmieda', // Chrome Web Store Payments
  'pkedcjkdefgpdelpbcmbmeomcjbeemfm', // Chrome Media Router
  'ghbmnnjooekpmoecnnnilnnbdlolhkhi', // Google Docs Offline
  'mhjfbmdgcfjbbpaeojofohoefgiehjai', // Chrome PDF Viewer
  'jdiccldimpdaibmpdkjnbmckianbfold', // Edge relevant text changes
  'jmjflgjpcpepeafmmgdpfkogkghcpiha', // Edge relevant hyperlinks
  'ncbjelpjchkpbikbpkcchkhkblodoama', // Edge shopping
]);

/**
 * Walks a Start Menu tree, collecting shortcut names.
 *
 * The shortcut name is what the person sees in their own launcher, which makes
 * it the right label — better than the executable, which is often a codename.
 */
async function collectShortcuts(
  fs: typeof import('node:fs/promises'),
  path: typeof import('node:path'),
  root: string,
  source: string,
  maxDepth: number,
  depth = 0,
): Promise<LocalProgram[]> {
  if (depth > maxDepth) {
    return [];
  }

  let entries: { name: string; isDirectory: () => boolean }[];

  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const found: LocalProgram[] = [];

  for (const entry of entries) {
    const full = path.join(root, entry.name);

    if (entry.isDirectory()) {
      if (!SYSTEM_FOLDERS.test(entry.name)) {
        found.push(...(await collectShortcuts(fs, path, full, source, maxDepth, depth + 1)));
      }

      continue;
    }

    if (!/\.(lnk|url|desktop|app)$/i.test(entry.name)) {
      continue;
    }

    const name = entry.name.replace(/\.(lnk|url|desktop|app)$/i, '');

    if (isNoise(name)) {
      continue;
    }

    found.push({ name, source });
  }

  return found;
}

/**
 * Applications found by where they are installed rather than by a shortcut.
 *
 * Not everything that is installed puts something in the Start Menu — a
 * Squirrel or MSIX install often does not, and the app is then invisible to a
 * shortcut-only scan even though the person uses it daily. One level of
 * directory names under the usual install roots covers it, and the folder name
 * is the product name often enough to be worth showing.
 */
async function collectInstalled(
  fs: typeof import('node:fs/promises'),
  path: typeof import('node:path'),
  home: string,
): Promise<LocalProgram[]> {
  if (process.platform !== 'win32') {
    return [];
  }

  const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');

  /*
   * `AppData\Local\Programs` holds nothing but applications, so every folder
   * in it counts. Program Files also holds drivers and SDKs, so a folder there
   * has to actually contain a program before we offer it.
   */
  const roots = [
    { dir: path.join(localAppData, 'Programs'), requireExecutable: false },
    { dir: process.env.ProgramFiles ?? 'C:\Program Files', requireExecutable: true },
    { dir: process.env['ProgramFiles(x86)'] ?? 'C:\Program Files (x86)', requireExecutable: true },
  ];

  const found: LocalProgram[] = [];

  for (const { dir: root, requireExecutable } of roots) {
    let entries: { name: string; isDirectory: () => boolean }[];

    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || isNoise(entry.name)) {
        continue;
      }

      if (requireExecutable) {
        /*
         * One listing deep, and an `app-*` folder counts: Squirrel installers
         * put the executable a level down, which is most Electron apps.
         */
        const inside = await fs.readdir(path.join(root, entry.name)).catch(() => [] as string[]);

        if (!inside.some((name) => /\.exe$/i.test(name) || /^(app-|bin$|current$)/i.test(name))) {
          continue;
        }
      }

      found.push({ name: entry.name, source: 'Installed' });
    }
  }

  return found;
}

/** The applications this machine has, as a person would name them. */
async function findPrograms(): Promise<LocalProgram[]> {
  const node = await nodeFs();

  if (!node) {
    return [];
  }

  const { fs, path, os } = node;
  const home = os.homedir();
  const roots: { dir: string; source: string; depth: number }[] = [];

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    const programData = process.env.ProgramData ?? 'C:\\ProgramData';

    roots.push(
      { dir: path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), source: 'Start Menu', depth: 3 },
      { dir: path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), source: 'Start Menu', depth: 3 },
      { dir: path.join(home, 'Desktop'), source: 'Desktop', depth: 0 },
    );
  } else if (process.platform === 'darwin') {
    roots.push(
      { dir: '/Applications', source: 'Applications', depth: 1 },
      { dir: path.join(home, 'Applications'), source: 'Applications', depth: 1 },
    );
  } else {
    roots.push(
      { dir: '/usr/share/applications', source: 'Applications', depth: 1 },
      { dir: path.join(home, '.local', 'share', 'applications'), source: 'Applications', depth: 1 },
    );
  }

  const all: LocalProgram[] = [];
  let readable = false;

  for (const { dir, source, depth } of roots) {
    if (await exists(fs, dir)) {
      readable = true;
    }

    all.push(...(await collectShortcuts(fs, path, dir, source, depth)));
  }

  all.push(...(await collectInstalled(fs, path, home)));
  reachedFilesystem ||= readable;

  // The same app is usually in several of these folders.
  const byName = new Map<string, LocalProgram>();

  for (const program of all) {
    const key = program.name.toLowerCase();

    if (!byName.has(key)) {
      byName.set(key, program);
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

interface ChromiumManifest {
  name?: string;
  version?: string;
  description?: string;
  default_locale?: string;
}

/**
 * Resolves a manifest name that is a message key.
 *
 * Localised extensions store `__MSG_appName__` in the manifest and the real
 * name in `_locales`. Without this step a third of the list reads `__MSG_…__`.
 */
async function resolveName(
  fs: typeof import('node:fs/promises'),
  path: typeof import('node:path'),
  versionDir: string,
  manifest: ChromiumManifest,
  field: 'name' | 'description',
): Promise<string | undefined> {
  const raw = manifest[field];

  if (!raw) {
    return undefined;
  }

  const key = raw.match(/^__MSG_(.+)__$/)?.[1];

  if (!key) {
    return raw;
  }

  const locales = [manifest.default_locale, 'en_US', 'en'].filter(Boolean) as string[];

  for (const locale of locales) {
    const messages = await readJson<Record<string, { message?: string }>>(
      fs,
      path.join(versionDir, '_locales', locale, 'messages.json'),
    );

    const message = messages?.[key]?.message ?? messages?.[key.toLowerCase()]?.message;

    if (message) {
      return message;
    }
  }

  return undefined;
}

/** The Chromium-family browsers, and where each keeps its profiles. */
function browserRoots(path: typeof import('node:path'), home: string): { browser: string; dir: string }[] {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');

    return [
      { browser: 'Chrome', dir: path.join(localAppData, 'Google', 'Chrome', 'User Data') },
      { browser: 'Edge', dir: path.join(localAppData, 'Microsoft', 'Edge', 'User Data') },
      { browser: 'Brave', dir: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data') },
      { browser: 'Vivaldi', dir: path.join(localAppData, 'Vivaldi', 'User Data') },
      { browser: 'Opera', dir: path.join(localAppData, 'Programs', 'Opera') },
    ];
  }

  if (process.platform === 'darwin') {
    const support = path.join(home, 'Library', 'Application Support');

    return [
      { browser: 'Chrome', dir: path.join(support, 'Google', 'Chrome') },
      { browser: 'Edge', dir: path.join(support, 'Microsoft Edge') },
      { browser: 'Brave', dir: path.join(support, 'BraveSoftware', 'Brave-Browser') },
    ];
  }

  return [
    { browser: 'Chrome', dir: path.join(home, '.config', 'google-chrome') },
    { browser: 'Chromium', dir: path.join(home, '.config', 'chromium') },
    { browser: 'Brave', dir: path.join(home, '.config', 'BraveSoftware', 'Brave-Browser') },
  ];
}

/** Profile display names, so the list says "Person 1" rather than "Default". */
async function profileLabels(
  fs: typeof import('node:fs/promises'),
  path: typeof import('node:path'),
  userDataDir: string,
): Promise<Record<string, string>> {
  const state = await readJson<{ profile?: { info_cache?: Record<string, { name?: string }> } }>(
    fs,
    path.join(userDataDir, 'Local State'),
  );

  const cache = state?.profile?.info_cache ?? {};
  const labels: Record<string, string> = {};

  for (const [dir, info] of Object.entries(cache)) {
    if (info?.name) {
      labels[dir] = info.name;
    }
  }

  return labels;
}

/** Every extension installed in every Chromium profile on this machine. */
async function findExtensions(): Promise<LocalExtension[]> {
  const node = await nodeFs();

  if (!node) {
    return [];
  }

  const { fs, path, os } = node;
  const found: LocalExtension[] = [];

  for (const { browser, dir } of browserRoots(path, os.homedir())) {
    if (!(await exists(fs, dir))) {
      continue;
    }

    reachedFilesystem = true;

    const labels = await profileLabels(fs, path, dir);

    let profileDirs: string[];

    try {
      profileDirs = (await fs.readdir(dir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && (entry.name === 'Default' || entry.name.startsWith('Profile ')))
        .map((entry) => entry.name);
    } catch {
      continue;
    }

    for (const profileDir of profileDirs) {
      const extensionsDir = path.join(dir, profileDir, 'Extensions');

      let ids: string[];

      try {
        ids = (await fs.readdir(extensionsDir, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
      } catch {
        continue;
      }

      const profile = labels[profileDir] ? `${browser} — ${labels[profileDir]}` : `${browser} — ${profileDir}`;

      for (const id of ids) {
        if (BROWSER_COMPONENTS.has(id)) {
          continue;
        }

        const versionDirs = await fs.readdir(path.join(extensionsDir, id)).catch(() => [] as string[]);

        // An upgrade leaves the old version behind; the last one is current.
        const versionDir = versionDirs.sort().pop();

        if (!versionDir) {
          continue;
        }

        const full = path.join(extensionsDir, id, versionDir);
        const manifest = await readJson<ChromiumManifest>(fs, path.join(full, 'manifest.json'));

        if (!manifest) {
          continue;
        }

        const name = await resolveName(fs, path, full, manifest, 'name');

        if (!name) {
          continue;
        }

        found.push({
          id,
          name,
          version: manifest.version,
          description: await resolveName(fs, path, full, manifest, 'description'),
          profile,
          browser,
          storeUrl: `https://chromewebstore.google.com/detail/${id}`,
        });
      }
    }
  }

  /*
   * The same extension installed in five profiles is one extension. Listing it
   * five times pushes everything else off the screen and asks the person a
   * question — which copy? — that has no meaningful answer.
   */
  const byId = new Map<string, LocalExtension>();

  for (const extension of found) {
    const existing = byId.get(extension.id);

    if (!existing) {
      byId.set(extension.id, extension);
      continue;
    }

    if (!existing.profile.includes(' +')) {
      existing.profile = `${existing.profile} +1`;
      continue;
    }

    const count = Number(existing.profile.match(/ \+(\d+)$/)?.[1] ?? 1);
    existing.profile = existing.profile.replace(/ \+\d+$/, ` +${count + 1}`);
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Everything this machine can offer as a clone reference.
 *
 * Never throws: a missing folder, a locked profile or a browser that is not
 * installed all just mean fewer entries, and an empty list is a perfectly good
 * answer that the dialog handles.
 */
let lastScan: { at: number; result: LocalDiscovery } | null = null;

/**
 * How long a scan is reused.
 *
 * Walking the Start Menu, three install roots and every browser profile takes
 * long enough to notice, and the answer changes when somebody installs
 * something — which is not often. Half a minute keeps the dialog instant
 * without going stale in any way a person would see.
 */
const SCAN_TTL_MS = 30_000;

export async function discoverLocalPrograms(request: Request): Promise<LocalDiscovery> {
  if (!isLocalRequest(request)) {
    return { ...EMPTY, reason: 'Local discovery is only available when Cude runs on your own machine.' };
  }

  if (!(await nodeFs())) {
    return { ...EMPTY, reason: 'This deployment has no filesystem to read.' };
  }

  if (lastScan && Date.now() - lastScan.at < SCAN_TTL_MS) {
    return lastScan.result;
  }

  reachedFilesystem = false;

  const [programs, extensions] = await Promise.all([
    findPrograms().catch(() => [] as LocalProgram[]),
    findExtensions().catch(() => [] as LocalExtension[]),
  ]);

  if (!reachedFilesystem) {
    return { ...EMPTY, reason: 'This deployment cannot read the machine it runs on.' };
  }

  const result: LocalDiscovery = { available: true, programs, extensions };
  lastScan = { at: Date.now(), result };

  return result;
}
