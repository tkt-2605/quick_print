import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const docs = new Map();

/** Load (and cache) a PDF document by URL. */
export function loadPdf(url) {
  if (!docs.has(url)) {
    const task = pdfjs.getDocument({ url, isEvalSupported: false });
    const promise = task.promise.catch((e) => {
      docs.delete(url);
      throw e;
    });
    docs.set(url, promise);
  }
  return docs.get(url);
}

/** Render page `index` (0-based) into a canvas `cssWidth` CSS pixels wide. */
export async function renderPage(url, index, canvas, cssWidth) {
  const doc = await loadPdf(url);
  const page = await doc.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
  await task.promise;
  return { landscape: base.width > base.height };
}
