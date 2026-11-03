import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { getCached, setCached } from '@happyvertical/files';
import { Document as BaseDocument } from '../document';
import type {
  Document,
  DocumentImage,
  DocumentPart,
  DocumentProcessor,
  FetchDocumentOptions,
  UnsupportedReason,
} from '../types';
import { getTitleFromUrl } from '../utils';

/** Office formats read through Kreuzberg. */
export type OfficeFormat = 'docx' | 'pptx';

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const MIME: Record<OfficeFormat, string> = {
  docx: DOCX_MIME,
  pptx: PPTX_MIME,
};

const KREUZBERG_PACKAGE = '@kreuzberg/node';

/** Options for {@link extractOffice}. */
export interface ExtractOfficeOptions {
  /** Return embedded images (bytes in memory). @default true */
  extractImages?: boolean;
  /** Fallback title when the file carries none. */
  title?: string;
}

/** A successful extraction. */
export interface OfficeExtraction {
  status: 'ok';
  format: OfficeFormat;
  /** Document title from the file's properties, when present. */
  title?: string;
  /**
   * DOCX: one part per top-level heading section (nested by heading level),
   * `type: 'markdown'`. PPTX: one part per slide in order, `type: 'text'`,
   * with `notes` holding that slide's speaker notes.
   */
  parts: DocumentPart[];
  metadata: Record<string, unknown>;
}

/** The Kreuzberg engine is not installed; nothing was read. */
export interface OfficeUnsupported extends UnsupportedReason {
  status: 'unsupported';
  format: OfficeFormat;
}

export type OfficeResult = OfficeExtraction | OfficeUnsupported;

// Structural subset of @kreuzberg/node so the optional module is only a
// runtime concern.
interface KreuzbergImage {
  data: Uint8Array;
  format: string;
  imageIndex: number;
  pageNumber?: number | null;
  width?: number | null;
  height?: number | null;
  description?: string | null;
}
interface KreuzbergResult {
  content?: string | null;
  metadata?: Record<string, unknown> & { title?: string | null };
  images?: KreuzbergImage[] | null;
}
interface KreuzbergModule {
  extractBytes(
    data: Buffer,
    mimeType: string,
    config?: Record<string, unknown> | null,
  ): Promise<KreuzbergResult>;
}

let kreuzbergPromise: Promise<KreuzbergModule | null> | undefined;

/** Lazily load the optional engine; resolves `null` when it is absent. */
function loadKreuzberg(): Promise<KreuzbergModule | null> {
  kreuzbergPromise ??= import('@kreuzberg/node').then(
    (mod) => mod as unknown as KreuzbergModule,
    () => null,
  );
  return kreuzbergPromise;
}

/** @internal test hook: forget the cached engine lookup. */
export function resetOfficeEngineForTests(): void {
  kreuzbergPromise = undefined;
}

const SLIDE_MARKER = (n: string) => `\n<<hv-slide:${n}>>\n`;
const SLIDE_MARKER_FORMAT = SLIDE_MARKER('{page_num}');
const SLIDE_MARKER_RE = /<<hv-slide:(\d+)>>/g;
// Kreuzberg appends a slide's speaker notes after a "Notes:" paragraph.
const NOTES_RE = /(?:^|\n\n)Notes:\n\n([\s\S]*)$/;

function toImage(image: KreuzbergImage, format: OfficeFormat): DocumentImage {
  return {
    id: randomUUID(),
    url: `office-image:${format}/${image.imageIndex}`,
    data: image.data,
    altText: image.description ?? undefined,
    position: image.imageIndex,
    metadata: {
      format: image.format,
      width: image.width ?? undefined,
      height: image.height ?? undefined,
      ...(image.pageNumber ? { slide: image.pageNumber } : {}),
    },
  };
}

function splitSlides(content: string): Map<number, string> {
  const slides = new Map<number, string>();
  const matches = [...content.matchAll(SLIDE_MARKER_RE)];
  matches.forEach((match, i) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[i + 1]?.index ?? content.length;
    slides.set(Number(match[1]), content.slice(start, end).trim());
  });
  return slides;
}

function buildSlideParts(
  content: string,
  images: KreuzbergImage[],
): DocumentPart[] {
  const slides = splitSlides(content);
  if (slides.size === 0) {
    // Engine did not honour page markers: still return the text, unsplit.
    const text = content.trim();
    return text
      ? [
          {
            id: randomUUID(),
            title: 'Presentation',
            content: text,
            type: 'text',
            metadata: { source: 'pptx', slidesSplit: false },
          },
        ]
      : [];
  }
  return [...slides.entries()].map(([slide, raw]) => {
    const notesMatch = NOTES_RE.exec(raw);
    const text = (notesMatch ? raw.slice(0, notesMatch.index) : raw).trim();
    const notes = notesMatch?.[1]?.trim();
    const slideImages = images
      .filter((img) => img.pageNumber === slide)
      .map((img) => toImage(img, 'pptx'));
    const part: DocumentPart = {
      id: randomUUID(),
      title:
        text
          .split('\n')
          .find((line) => line.trim())
          ?.trim() || `Slide ${slide}`,
      content: text,
      type: 'text',
      metadata: { source: 'pptx', slide },
    };
    if (notes) part.notes = notes;
    if (slideImages.length > 0) part.images = slideImages;
    return part;
  });
}

interface Section {
  level: number;
  title: string;
  lines: string[];
  children: Section[];
}

function buildDocxParts(
  markdown: string,
  fallbackTitle: string,
  images: DocumentImage[],
): DocumentPart[] {
  const root: Section = { level: 0, title: '', lines: [], children: [] };
  const stack: Section[] = [root];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const heading = inFence ? null : /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (!heading) {
      stack[stack.length - 1].lines.push(line);
      continue;
    }
    const section: Section = {
      level: heading[1].length,
      title: heading[2],
      lines: [],
      children: [],
    };
    while (stack[stack.length - 1].level >= section.level) stack.pop();
    stack[stack.length - 1].children.push(section);
    stack.push(section);
  }

  const toPart = (section: Section): DocumentPart => {
    const part: DocumentPart = {
      id: randomUUID(),
      title: section.title,
      content: section.lines.join('\n').trim(),
      type: 'markdown',
      metadata: { source: 'docx', headingLevel: section.level },
    };
    if (section.children.length > 0) part.parts = section.children.map(toPart);
    return part;
  };

  const parts: DocumentPart[] = [];
  const lead = root.lines.join('\n').trim();
  if (lead || root.children.length === 0) {
    if (lead) {
      parts.push({
        id: randomUUID(),
        title: fallbackTitle,
        content: lead,
        type: 'markdown',
        metadata: { source: 'docx', headingLevel: 0 },
      });
    }
  }
  parts.push(...root.children.map(toPart));
  if (images.length > 0) {
    // An image-only document still needs a part to carry its pictures.
    if (parts.length === 0) {
      parts.push({
        id: randomUUID(),
        title: fallbackTitle,
        content: '',
        type: 'markdown',
        metadata: { source: 'docx', headingLevel: 0 },
      });
    }
    parts[0].images = images;
  }
  return parts;
}

/**
 * Read a DOCX or PPTX from memory (or a path) through Kreuzberg.
 *
 * Returns `{ status: 'unsupported' }` -- never throws for that case -- when the
 * optional `@kreuzberg/node` dependency is not installed. Corrupt or
 * unreadable files reject with the engine's error.
 *
 * @param source - File bytes or a local file path
 * @param format - `'docx'` or `'pptx'`
 */
export async function extractOffice(
  source: Buffer | Uint8Array | string,
  format: OfficeFormat,
  options: ExtractOfficeOptions = {},
): Promise<OfficeResult> {
  const kreuzberg = await loadKreuzberg();
  if (!kreuzberg) {
    return {
      status: 'unsupported',
      code: 'dependency-missing',
      format,
      dependency: KREUZBERG_PACKAGE,
      reason: `Reading .${format} files requires the optional ${KREUZBERG_PACKAGE} package, which is not installed.`,
    };
  }

  const bytes =
    typeof source === 'string'
      ? await fs.readFile(source)
      : Buffer.isBuffer(source)
        ? source
        : Buffer.from(source);
  const wantImages = options.extractImages !== false;
  const config: Record<string, unknown> = {
    images: { extractImages: wantImages },
  };
  if (format === 'pptx') {
    config.pages = {
      extractPages: true,
      insertPageMarkers: true,
      markerFormat: SLIDE_MARKER_FORMAT,
    };
  } else {
    config.outputFormat = 'markdown';
  }

  const result = await kreuzberg.extractBytes(bytes, MIME[format], config);
  const content = result.content ?? '';
  const rawImages = wantImages ? (result.images ?? []) : [];
  const title = result.metadata?.title?.trim() || undefined;

  const parts =
    format === 'pptx'
      ? buildSlideParts(content, rawImages)
      : buildDocxParts(
          content,
          title ?? options.title ?? 'Document',
          rawImages.map((img) => toImage(img, 'docx')),
        );

  return {
    status: 'ok',
    format,
    title,
    parts,
    metadata: {
      processor: format,
      engine: 'kreuzberg',
      extractedAt: new Date().toISOString(),
      hasImages: rawImages.length > 0,
      ...(format === 'pptx'
        ? {
            slideCount: parts.filter((p) => p.metadata?.slide !== undefined)
              .length,
          }
        : {}),
      ...(title ? { title } : {}),
    },
  };
}

abstract class OfficeProcessor implements DocumentProcessor {
  protected abstract readonly format: OfficeFormat;
  protected abstract readonly label: string;

  abstract supports(type: string): boolean;

  async process(
    url: string,
    options: FetchDocumentOptions = {},
  ): Promise<Document> {
    const baseDoc = await BaseDocument.create(url, {
      ...options,
      type: options.type ?? MIME[this.format],
    });

    const cacheKey = `${baseDoc.localPath}.processed_${this.format}`;
    const wantImages = options.extractImages !== false;
    // Images are held in memory, so only text results are cached.
    const cached = wantImages ? null : await getCached(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return {
          url: baseDoc.url.toString(),
          type: baseDoc.type,
          parts: parsed.parts,
          metadata: parsed.metadata || {},
        };
      } catch (error) {
        console.warn(
          `Cached ${this.label} data corrupted, reprocessing`,
          error,
        );
      }
    }

    const result = await extractOffice(baseDoc.localPath, this.format, {
      extractImages: wantImages,
      title: getTitleFromUrl(url, this.label),
    });

    if (result.status === 'unsupported') {
      return {
        url: baseDoc.url.toString(),
        type: baseDoc.type,
        parts: [],
        metadata: { processor: this.format, unsupported: true },
        unsupported: {
          code: result.code,
          reason: result.reason,
          dependency: result.dependency,
        },
      };
    }

    const document: Document = {
      url: baseDoc.url.toString(),
      type: baseDoc.type,
      parts: result.parts,
      metadata: result.metadata,
    };
    if (!wantImages) await setCached(cacheKey, JSON.stringify(document));
    return document;
  }
}

/**
 * Word (`.docx`) processor backed by Kreuzberg.
 *
 * Splits the text into heading-delimited parts (markdown). When the optional
 * `@kreuzberg/node` package is missing, `process()` resolves with
 * `document.unsupported` set and no parts.
 */
export class DOCXProcessor extends OfficeProcessor {
  protected readonly format = 'docx' as const;
  protected readonly label = 'Word Document';

  supports(type: string): boolean {
    const t = type.toLowerCase();
    return t === DOCX_MIME || t.endsWith('.docx') || t === 'docx';
  }
}

/**
 * PowerPoint (`.pptx`) processor backed by Kreuzberg.
 *
 * One part per slide, with `notes` carrying the speaker notes and `images`
 * the pictures embedded on that slide. When the optional `@kreuzberg/node`
 * package is missing, `process()` resolves with `document.unsupported` set.
 */
export class PPTXProcessor extends OfficeProcessor {
  protected readonly format = 'pptx' as const;
  protected readonly label = 'Presentation';

  supports(type: string): boolean {
    const t = type.toLowerCase();
    return t === PPTX_MIME || t.endsWith('.pptx') || t === 'pptx';
  }
}
