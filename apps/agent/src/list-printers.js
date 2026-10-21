// Prints the exact Windows printer names to paste into Admin → Printers.
import { listWindowsPrinters } from './windows.js';

for (const p of await listWindowsPrinters()) console.log(`${p.status.padEnd(12)} ${p.name}`);
