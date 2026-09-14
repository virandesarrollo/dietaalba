export type ExtractedPdf = {
  text: string;
  urls: string[];
  warnings: string[];
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TEXT_ITEMS = 50_000;
const MAX_TEXT_CHARACTERS = 2_000_000;
const MIN_USEFUL_TEXT_LENGTH = 20;
const PDF_LOADER_KEY = Symbol.for('diet-import-pdf.loader');

export class PdfExtractionLimitError extends Error {
  readonly code = 'pdf-needs-external-conversion' as const;

  constructor() {
    super('El PDF contiene demasiado texto para procesarlo localmente');
    this.name = 'PdfExtractionLimitError';
  }
}

type PositionedText = {
  page: number;
  x: number;
  y: number;
  width: number;
  hasEOL: boolean;
  text: string;
};

type PositionedUrl = {
  page: number;
  rect: number[] | null;
  url: string;
};

const ROW_Y_TOLERANCE = 2;
const COLUMN_GAP_THRESHOLD = 24;

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function reconstructText(items: PositionedText[], links: PositionedUrl[]): string {
  const rows: PositionedText[][] = [];
  for (const item of items) {
    const currentRow = rows.at(-1);
    const previousItem = currentRow?.at(-1);
    const startsNewRow = !currentRow
      || currentRow[0].page !== item.page
      || Math.abs(currentRow[0].y - item.y) > ROW_Y_TOLERANCE
      || previousItem?.hasEOL;
    if (startsNewRow) rows.push([item]);
    else currentRow.push(item);
  }

  const isolatedUrls = new Set<string>();
  for (const link of links) {
    if (!link.rect) {
      isolatedUrls.add(link.url);
      continue;
    }
    const [x1, y1, x2, y2] = link.rect;
    const minY = Math.min(y1, y2) - ROW_Y_TOLERANCE;
    const maxY = Math.max(y1, y2) + ROW_Y_TOLERANCE;
    const candidates = rows.filter((row) => (
      row[0].page === link.page && row[0].y >= minY && row[0].y <= maxY
    ));
    if (candidates.length !== 1) {
      isolatedUrls.add(link.url);
      continue;
    }
    const row = candidates[0];
    if (row.some((item) => item.text.includes(link.url))) continue;
    row.push({
      page: link.page,
      x: Math.min(x1, x2),
      y: row[0].y,
      width: Math.abs(x2 - x1),
      hasEOL: false,
      text: link.url,
    });
    row.sort((left, right) => left.x - right.x);
  }

  const tableText = rows.map((row) => row.map((item, index) => {
    if (index === 0) return item.text;
    const previous = row[index - 1];
    const gap = item.x - (previous.x + previous.width);
    return `${gap >= COLUMN_GAP_THRESHOLD ? '\t' : ' '}${item.text}`;
  }).join('')).join('\n').trim();
  return [tableText, ...isolatedUrls].filter(Boolean).join('\n');
}

async function loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
  const injectedLoader = (globalThis as Record<PropertyKey, unknown>)[PDF_LOADER_KEY] as
    | (() => Promise<typeof import('pdfjs-dist')>)
    | undefined;
  return injectedLoader ? injectedLoader() : import('pdfjs-dist');
}

export async function extractPdf(file: File): Promise<ExtractedPdf> {
  const mimeType = file.type.toLowerCase();
  const hasPdfMime = mimeType === 'application/pdf';
  const hasPdfExtension = /\.pdf$/i.test(file.name);
  const hasGenericMime = mimeType === '' || mimeType === 'application/octet-stream';
  if (!hasPdfMime && !(hasGenericMime && hasPdfExtension)) {
    throw new TypeError('El archivo debe ser un PDF');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new RangeError('El PDF no puede superar 10 MiB');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 5
    || bytes[0] !== 0x25
    || bytes[1] !== 0x50
    || bytes[2] !== 0x44
    || bytes[3] !== 0x46
    || bytes[4] !== 0x2d) {
    throw new TypeError('El contenido del archivo no es un PDF');
  }

  const pdfjs = await loadPdfJs();
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const documentParameters = {
    data: bytes,
    isEvalSupported: false,
  };
  const loadingTask = pdfjs.getDocument(documentParameters);
  const items: PositionedText[] = [];
  const links: PositionedUrl[] = [];
  const urls = new Set<string>();
  let contentItemCount = 0;
  let textCharacterCount = 0;

  try {
    const document = await loadingTask.promise;
    const pageCount = Math.min(document.numPages, 20);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const [textContent, annotations] = await Promise.all([
        page.getTextContent(),
        page.getAnnotations(),
      ]);

      for (const item of textContent.items) {
        contentItemCount += 1;
        if (contentItemCount > MAX_TEXT_ITEMS) throw new PdfExtractionLimitError();
        if (!('str' in item)) continue;
        textCharacterCount += item.str.length;
        if (textCharacterCount > MAX_TEXT_CHARACTERS) throw new PdfExtractionLimitError();
        if (item.str.trim() === '') continue;
        items.push({
          page: pageNumber,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          hasEOL: item.hasEOL,
          text: item.str.trim(),
        });
      }
      for (const annotation of annotations) {
        const value = httpUrl('url' in annotation ? annotation.url : null);
        if (!value) continue;
        contentItemCount += 1;
        textCharacterCount += value.length;
        if (contentItemCount > MAX_TEXT_ITEMS || textCharacterCount > MAX_TEXT_CHARACTERS) {
          throw new PdfExtractionLimitError();
        }
        urls.add(value);
        const rect = 'rect' in annotation
          && Array.isArray(annotation.rect)
          && annotation.rect.length === 4
          && annotation.rect.every(Number.isFinite)
          ? annotation.rect
          : null;
        links.push({ page: pageNumber, rect, url: value });
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  items.sort((left, right) => (
    left.page - right.page
    || right.y - left.y
    || left.x - right.x
  ));
  const text = reconstructText(items, links);

  return {
    text,
    urls: [...urls],
    warnings: text.length < MIN_USEFUL_TEXT_LENGTH ? ['pdf-needs-external-conversion'] : [],
  };
}
