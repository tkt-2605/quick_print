import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Printers installed in Windows, with spooler status mapped to "ready" when usable. */
export async function listWindowsPrinters() {
  if (process.platform !== 'win32') return [];
  const ps = "Get-Printer | Select-Object Name, @{n='Status';e={$_.PrinterStatus.ToString()}} | ConvertTo-Json -Compress";
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 30_000, windowsHide: true });
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout);
  return (Array.isArray(parsed) ? parsed : [parsed]).map((p) => ({
    name: p.Name,
    status: ['Normal', 'Printing', 'Processing', 'WarmingUp', 'Busy'].includes(p.Status) ? 'ready' : String(p.Status).toLowerCase(),
  }));
}

export function findSumatra() {
  const candidates = [
    process.env.SUMATRA_PATH,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'SumatraPDF', 'SumatraPDF.exe'),
    'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
    'C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe',
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

/** Send a PDF to a Windows printer silently via SumatraPDF. */
export async function printPdf(sumatra, file, { printerName, color, autoDuplex }) {
  const settings = ['paper=A4', 'fit', color ? 'color' : 'monochrome', autoDuplex ? 'duplexlong' : 'simplex', '1x'].join(',');
  await run(sumatra, ['-print-to', printerName, '-print-settings', settings, '-silent', file], { timeout: 10 * 60_000, windowsHide: true });
}
