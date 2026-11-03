/**
 * Tiny OOXML fixture builders for tests.
 *
 * Generates minimal but valid `.docx` and `.pptx` packages in memory (a ZIP of
 * stored entries) so tests need no committed binary fixtures.
 */
import { crc32 } from 'node:zlib';

/** A 1x1 transparent PNG. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

type Entry = { name: string; data: Buffer };

/** Build a ZIP archive using stored (uncompressed) entries. */
export function zip(files: Record<string, string | Buffer>): Buffer {
  const entries: Entry[] = Object.entries(files).map(([name, data]) => ({
    name,
    data: typeof data === 'string' ? Buffer.from(data, 'utf-8') : data,
  }));
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf-8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const OD =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export interface DocxFixture {
  /** Plain paragraphs, or `{ text, heading }` for Heading1..N styled ones. */
  paragraphs: Array<string | { text: string; heading: number }>;
  title?: string;
  /** Append a paragraph holding an inline TINY_PNG. */
  image?: boolean;
}

/** Build a minimal DOCX with one paragraph per entry. */
export function buildDocx({ paragraphs, title, image }: DocxFixture): Buffer {
  const body = paragraphs
    .map((p) => {
      const text = typeof p === 'string' ? p : p.text;
      const style =
        typeof p === 'string'
          ? ''
          : `<w:pPr><w:pStyle w:val="Heading${p.heading}"/></w:pPr>`;
      return `<w:p>${style}<w:r><w:t>${xmlEscape(text)}</w:t></w:r></w:p>`;
    })
    .join('');
  const picture = image
    ? `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="914400" cy="914400"/><wp:docPr id="1" name="Picture" descr="A tiny picture"/><a:graphic xmlns:a="${NS_A}"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="tiny.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="${OD}" r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
    : '';
  return zip({
    ...(image
      ? {
          'word/media/image1.png': TINY_PNG,
          'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"><Relationship Id="rIdImg" Type="${OD}/image" Target="media/image1.png"/></Relationships>`,
        }
      : {}),
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OD}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEscape(title ?? '')}</dc:title></cp:coreProperties>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${picture}</w:body></w:document>`,
  });
}

export interface PptxSlideFixture {
  title: string;
  body?: string;
  notes?: string;
  /** Embed TINY_PNG on this slide. */
  image?: boolean;
}

const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';

/** Build a minimal PPTX; slides may carry speaker notes and an image. */
export function buildPptx(slides: PptxSlideFixture[]): Buffer {
  const files: Record<string, string | Buffer> = {};
  const overrides: string[] = [
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`,
  ];
  const presRels: string[] = [];
  const sldIds: string[] = [];
  const shape = (id: number, name: string, text: string, ph?: string) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : ''}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${xmlEscape(text)}</a:t></a:r></a:p></p:txBody></p:sp>`;

  slides.forEach((slide, i) => {
    const n = i + 1;
    overrides.push(
      `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    );
    presRels.push(
      `<Relationship Id="rId${n}" Type="${OD}/slide" Target="slides/slide${n}.xml"/>`,
    );
    sldIds.push(`<p:sldId id="${255 + n}" r:id="rId${n}"/>`);
    const slideRels: string[] = [];
    let shapes = shape(2, 'Title', slide.title, 'title');
    if (slide.body) shapes += shape(3, 'Body', slide.body);
    if (slide.image) {
      files[`ppt/media/image${n}.png`] = TINY_PNG;
      slideRels.push(
        `<Relationship Id="rIdImg" Type="${OD}/image" Target="../media/image${n}.png"/>`,
      );
      shapes += `<p:pic><p:nvPicPr><p:cNvPr id="9" name="Picture" descr="A tiny picture"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    }
    if (slide.notes !== undefined) {
      overrides.push(
        `<Override PartName="/ppt/notesSlides/notesSlide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`,
      );
      slideRels.push(
        `<Relationship Id="rIdNotes" Type="${OD}/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/>`,
      );
      files[`ppt/notesSlides/notesSlide${n}.xml`] =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes xmlns:a="${NS_A}" xmlns:p="${NS_P}" xmlns:r="${OD}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shape(2, 'Slide Image', '', 'sldImg').replace(/<p:txBody>.*<\/p:txBody>/, '')}${shape(3, 'Notes', slide.notes, 'body')}</p:spTree></p:cSld></p:notes>`;
      files[`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`] =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OD}/slide" Target="../slides/slide${n}.xml"/></Relationships>`;
    }
    files[`ppt/slides/slide${n}.xml`] =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="${NS_A}" xmlns:p="${NS_P}" xmlns:r="${OD}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></p:sld>`;
    files[`ppt/slides/_rels/slide${n}.xml.rels`] =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}">${slideRels.join('')}</Relationships>`;
  });

  files['[Content_Types].xml'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${overrides.join('')}</Types>`;
  files['_rels/.rels'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OD}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`;
  files['ppt/presentation.xml'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="${NS_A}" xmlns:p="${NS_P}" xmlns:r="${OD}"><p:sldIdLst>${sldIds.join('')}</p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
  files['ppt/_rels/presentation.xml.rels'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}">${presRels.join('')}</Relationships>`;
  return zip(files);
}
