import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { promisify } from 'util';
import { AppError } from '../../../utils/AppError.js';

const execFileAsync = promisify(execFile);

/**
 * HTML -> PDF conversion (Agency Workspace A5).
 *
 * Two engines share one entry point:
 *
 * - **Remote** (`AGENCY_PDF_RENDERER_URL`): the HTML is posted to a Gotenberg
 *   sidecar, which owns the Chromium process. Hosts whose runtime ships no
 *   browser (Render's free tier) use this; a crashed render cannot take the
 *   API down with it.
 * - **Local**: a system Chrome/Chromium is driven in headless mode instead of
 *   embedding a browser in the API process (`AGENCY_CHROME_PATH` and friends).
 *   Used in development and CI.
 *
 * If neither is configured the job fails cleanly and can be retried after
 * configuration. The document's own CSP blocks scripts and remote asset
 * fetches either way.
 */

const CHROME_ENV_KEYS = [
  'AGENCY_CHROME_PATH',
  'CHROME_EXECUTABLE_PATH',
  'PUPPETEER_EXECUTABLE_PATH',
] as const;

export const PDF_RENDER_TIMEOUT_MS = 45_000;

/** Free hosts cold-start in tens of seconds; the render itself is CPU-bound. */
const DEFAULT_REMOTE_TIMEOUT_MS = 120_000;
/** One retry absorbs a 502/503 while a sleeping renderer spins back up. */
const REMOTE_RETRY_DELAY_MS = 1_000;

export type PdfRendererMode = 'remote' | 'chrome' | 'none';

export interface RemotePdfRenderer {
  url: string;
  username?: string;
  password?: string;
}

function candidatePaths(platform: NodeJS.Platform): string[] {
  if (platform === 'win32') {
    const programFiles = process.env.PROGRAMFILES ?? 'C:\\Program Files';
    const programFilesX86 =
      process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA ?? '';
    return [
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      localAppData
        ? path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')
        : '',
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ].filter(Boolean);
  }
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
  ];
}

/**
 * Resolves the browser binary from an explicit environment override first,
 * then from well-known install locations. Returning `null` is a first-class
 * state: export creation stays available and the job reports a retryable
 * configuration error.
 */
export async function findChromeExecutable(
  platform: NodeJS.Platform = process.platform
): Promise<string | null> {
  const overrides = CHROME_ENV_KEYS.map((key) => process.env[key]).filter(
    (value): value is string => Boolean(value?.trim())
  );
  for (const candidate of [...overrides, ...candidatePaths(platform)]) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/**
 * The remote renderer is opt-in through one URL. Credentials are optional so a
 * private-network sidecar can run without auth, but a public URL must set them:
 * the service accepts arbitrary HTML and burns CPU.
 */
export function remotePdfRenderer(): RemotePdfRenderer | null {
  const url = (process.env.AGENCY_PDF_RENDERER_URL ?? '').trim();
  if (!url) return null;
  const username = (process.env.AGENCY_PDF_RENDERER_USERNAME ?? '').trim();
  const password = process.env.AGENCY_PDF_RENDERER_PASSWORD ?? '';
  return {
    url: url.replace(/\/+$/, ''),
    ...(username && password ? { username, password } : {}),
  };
}

export function remoteRendererTimeoutMs(): number {
  const configured = Number(process.env.AGENCY_PDF_RENDERER_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 5_000
    ? configured
    : DEFAULT_REMOTE_TIMEOUT_MS;
}

/**
 * How long a render may legitimately run. Crash recovery uses twice this to
 * decide that a `rendering` row can no longer belong to a live process.
 */
export function pdfRenderDeadlineMs(): number {
  return remotePdfRenderer() ? remoteRendererTimeoutMs() : PDF_RENDER_TIMEOUT_MS;
}

/** Reported by `/api/health` so a missing renderer is visible before an export. */
export async function pdfRendererMode(): Promise<PdfRendererMode> {
  if (remotePdfRenderer()) return 'remote';
  return (await findChromeExecutable()) ? 'chrome' : 'none';
}

function chromeArgs(outputPath: string, htmlPath: string): string[] {
  return [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--run-all-compositor-stages-before-draw',
    '--no-pdf-header-footer',
    '--print-to-pdf-no-header',
    '--virtual-time-budget=3000',
    `--print-to-pdf=${outputPath}`,
    pathToFileURL(htmlPath).href,
  ];
}

function pdfPageCountFromMarker(buffer: Buffer): number | null {
  const text = buffer.toString('latin1');
  const pagesObject = /\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/.exec(text);
  if (pagesObject) {
    const count = Number(pagesObject[1]);
    if (Number.isInteger(count) && count > 0) return count;
  }
  const pageObjects = text.match(/\/Type\s*\/Page(?!\s*s)/g);
  return pageObjects?.length ?? null;
}

/** Page count without a PDF parser dependency; used by tests and job logs. */
export function countPdfPages(buffer: Buffer): number {
  const count = pdfPageCountFromMarker(buffer);
  if (!count) {
    throw new AppError('The generated PDF could not be read.', 500);
  }
  return count;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function basicAuthHeader(renderer: RemotePdfRenderer): Record<string, string> {
  if (!renderer.username) return {};
  const token = Buffer.from(
    `${renderer.username}:${renderer.password ?? ''}`
  ).toString('base64');
  return { Authorization: `Basic ${token}` };
}

function isTimeoutError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

/**
 * Posts the self-contained document to Gotenberg's HTML route. The field names
 * are part of that API: the document must be `index.html`, and the print
 * options mirror the local Chrome flags (backgrounds on, CSS page size,
 * print media). Margins are zeroed because the wrapper already sets
 * `@page { margin: 0 }`; Gotenberg's default is 0.39in.
 */
async function renderWithRemote(
  html: string,
  renderer: RemotePdfRenderer
): Promise<Buffer> {
  const endpoint = `${renderer.url}/forms/chromium/convert/html`;
  const timeoutMs = remoteRendererTimeoutMs();
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    // Rebuilt per attempt: a consumed multipart body is not resent portably.
    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('printBackground', 'true');
    form.append('preferCssPageSize', 'true');
    form.append('marginTop', '0');
    form.append('marginBottom', '0');
    form.append('marginLeft', '0');
    form.append('marginRight', '0');
    form.append('emulatedMediaType', 'print');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: basicAuthHeader(renderer),
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 502 || response.status === 503) {
        lastError = new Error(`renderer returned ${response.status}`);
        if (attempt === 1) {
          await delay(REMOTE_RETRY_DELAY_MS);
          continue;
        }
        break;
      }

      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 200);
        console.warn(
          'Remote PDF renderer rejected the request:',
          response.status,
          detail
        );
        throw new AppError(
          'The PDF could not be rendered right now. Please retry the export.',
          503
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0) {
        throw new AppError(
          'The PDF renderer returned an empty file. Please retry.',
          503
        );
      }
      if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
        throw new AppError(
          'The PDF renderer returned an invalid file. Please retry.',
          503
        );
      }
      return buffer;
    } catch (error) {
      if (error instanceof AppError) throw error;
      lastError = error;
      // A timeout already spent the whole budget; only a refused or spun-down
      // connection is worth a second attempt.
      if (attempt === 1 && !isTimeoutError(error)) {
        await delay(REMOTE_RETRY_DELAY_MS);
        continue;
      }
      break;
    }
  }

  const reason = String(
    (lastError as { message?: string } | null)?.message ?? lastError ?? ''
  ).slice(0, 200);
  console.warn('Remote PDF renderer failed:', reason);
  throw new AppError(
    'The PDF could not be rendered right now. Please retry the export.',
    503
  );
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const remote = remotePdfRenderer();
  if (remote) {
    return renderWithRemote(html, remote);
  }

  const chrome = await findChromeExecutable();
  if (!chrome) {
    throw new AppError(
      'PDF rendering is not configured on this server. Ask an administrator to install Chrome, set AGENCY_CHROME_PATH, or point AGENCY_PDF_RENDERER_URL at a renderer.',
      503
    );
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'travelai-export-'));
  const htmlPath = path.join(dir, 'document.html');
  const outputPath = path.join(dir, 'document.pdf');
  try {
    await fs.writeFile(htmlPath, html, { encoding: 'utf8', mode: 0o600 });
    try {
      await execFileAsync(chrome, chromeArgs(outputPath, htmlPath), {
        timeout: PDF_RENDER_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      });
    } catch (error: any) {
      const reason = String(error?.killed ? 'timed out' : error?.message ?? '').slice(0, 200);
      console.warn('Headless Chrome PDF render failed:', reason);
      throw new AppError(
        'The PDF could not be rendered right now. Please retry the export.',
        503
      );
    }

    const stat = await fs.stat(outputPath).catch(() => null);
    if (!stat || stat.size === 0) {
      throw new AppError('The PDF renderer returned an empty file. Please retry.', 503);
    }
    const buffer = await fs.readFile(outputPath);
    if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new AppError('The PDF renderer returned an invalid file. Please retry.', 503);
    }
    return buffer;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
