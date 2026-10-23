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
 * A system Chrome/Chromium is driven in headless mode instead of embedding a
 * browser in the API process. In production this points at the render
 * worker/sidecar binary (`AGENCY_CHROME_PATH`); if no browser is installed the
 * job fails cleanly and can be retried after configuration. The document's own
 * CSP blocks scripts and remote asset fetches.
 */

const CHROME_ENV_KEYS = [
  'AGENCY_CHROME_PATH',
  'CHROME_EXECUTABLE_PATH',
  'PUPPETEER_EXECUTABLE_PATH',
] as const;

export const PDF_RENDER_TIMEOUT_MS = 45_000;

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

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const chrome = await findChromeExecutable();
  if (!chrome) {
    throw new AppError(
      'PDF rendering is not configured on this server. Ask an administrator to install Chrome or set AGENCY_CHROME_PATH.',
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
