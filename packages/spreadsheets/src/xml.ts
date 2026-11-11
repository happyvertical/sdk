import {
  checkLimit,
  SpreadsheetError,
  type SpreadsheetLimits,
} from './errors.js';

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}
export function children(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((n) => n.name === name);
}
export function child(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((n) => n.name === name);
}
export function textContent(node: XmlNode): string {
  return node.text + node.children.map(textContent).join('');
}
function fail(): never {
  throw new SpreadsheetError(
    'INVALID_XML',
    'Invalid or unsafe spreadsheet XML.',
  );
}
function xmlChar(n: number): boolean {
  return (
    n === 9 ||
    n === 10 ||
    n === 13 ||
    (n >= 32 && n <= 0xd7ff) ||
    (n >= 0xe000 && n <= 0xfffd) ||
    (n >= 0x10000 && n <= 0x10ffff)
  );
}
function decode(value: string): string {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/.test(value)) fail();
  return value.replace(
    /&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g,
    (_, entity: string) => {
      const named: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
      };
      if (entity in named) return named[entity];
      const n =
        entity[1] === 'x'
          ? Number.parseInt(entity.slice(2), 16)
          : Number(entity.slice(1));
      if (!xmlChar(n)) fail();
      return String.fromCodePoint(n);
    },
  );
}

/** Deliberately small OOXML tokenizer. No declarations, DTDs or custom entities. */
export function parseXml(
  bytes: Uint8Array,
  limits: SpreadsheetLimits,
): XmlNode {
  let xml: string;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail();
  }
  xml = xml.replace(/\r\n?/g, '\n');
  for (const c of xml) if (!xmlChar(c.codePointAt(0) ?? 0)) fail();
  const root: XmlNode = { name: '', attrs: {}, children: [], text: '' };
  const stack = [root];
  const names = [''];
  let i = 0;
  let nodes = 0;
  let textSize = 0;
  const addText = (value: string, literal = false) => {
    textSize += value.length;
    checkLimit(textSize, 'maxXmlText', limits);
    if (stack.length === 1 && value.trim()) fail();
    stack[stack.length - 1].text += literal ? value : decode(value);
  };
  while (i < xml.length) {
    if (xml[i] !== '<') {
      const end = xml.indexOf('<', i);
      const stop = end < 0 ? xml.length : end;
      addText(xml.slice(i, stop));
      i = stop;
      continue;
    }
    if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i + 4);
      if (end < 0 || xml.slice(i + 4, end).includes('--')) fail();
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', i)) {
      const end = xml.indexOf(']]>', i + 9);
      if (end < 0) fail();
      addText(xml.slice(i + 9, end), true);
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<?', i)) {
      const end = xml.indexOf('?>', i + 2);
      if (end < 0) fail();
      i = end + 2;
      continue;
    }
    if (xml.startsWith('<!', i)) fail();
    const closing = xml[i + 1] === '/';
    i += closing ? 2 : 1;
    const nameMatch = /^[A-Za-z_][\w.:-]*/.exec(xml.slice(i));
    if (!nameMatch) fail();
    const fullName = nameMatch[0];
    i += fullName.length;
    if (closing) {
      while (/\s/.test(xml[i] ?? '') && i < xml.length) i++;
      if (xml[i++] !== '>' || stack.length === 1 || names.pop() !== fullName)
        fail();
      stack.pop();
      continue;
    }
    const attrs: Record<string, string> = Object.create(null);
    let selfClosing = false;
    while (true) {
      const before = i;
      while (i < xml.length && /\s/.test(xml[i])) i++;
      if (xml.startsWith('/>', i)) {
        selfClosing = true;
        i += 2;
        break;
      }
      if (xml[i] === '>') {
        i++;
        break;
      }
      if (i === before) fail();
      const match = /^([A-Za-z_][\w.:-]*)\s*=\s*(["'])/.exec(xml.slice(i));
      if (!match) fail();
      i += match[0].length;
      const end = xml.indexOf(match[2], i);
      if (end < 0) fail();
      const raw = xml.slice(i, end);
      if (raw.includes('<') || Object.hasOwn(attrs, match[1])) fail();
      textSize += raw.length;
      checkLimit(textSize, 'maxXmlText', limits);
      attrs[match[1]] = decode(raw.replace(/[\t\n]/g, ' '));
      i = end + 1;
    }
    checkLimit(++nodes, 'maxXmlNodes', limits);
    checkLimit(stack.length, 'maxXmlDepth', limits);
    const node: XmlNode = {
      name: fullName.split(':').pop() ?? fullName,
      attrs,
      children: [],
      text: '',
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) {
      stack.push(node);
      names.push(fullName);
    }
  }
  if (stack.length !== 1 || root.children.length !== 1) fail();
  return root.children[0];
}

export function escapeXml(value: string): string {
  for (const c of value)
    if (!xmlChar(c.codePointAt(0) ?? 0))
      throw new SpreadsheetError(
        'INVALID_INPUT',
        'Invalid XML character in workbook.',
      );
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\r/g, '&#13;');
}
