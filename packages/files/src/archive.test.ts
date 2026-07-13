import { describe, expect, it } from 'vitest';
import {
  InvalidZipArchiveError,
  inspectZipManifest,
  UnsafeZipEntryError,
  UnsupportedZipFeatureError,
  ZipManifestError,
  ZipManifestLimitError,
  type ZipManifestLimits,
} from './archive';

const encoder = new TextEncoder();

interface ZipFixtureEntry {
  name: string | Uint8Array;
  body?: Uint8Array;
  compressedSize?: number;
  crc32?: number;
  dataDescriptor?: 'signed' | 'unsigned' | 'missing';
  uncompressedSize?: number;
  compressionMethod?: number;
  flags?: number;
  localFlags?: number;
  localName?: string | Uint8Array;
  localExtra?: Uint8Array;
  centralExtra?: Uint8Array;
  externalAttributes?: number;
  versionMadeBy?: number;
  startingDisk?: number;
}

interface ZipFixtureOptions {
  comment?: Uint8Array;
  diskNumber?: number;
  centralDirectoryDisk?: number;
  entriesOnDisk?: number;
  totalEntries?: number;
  centralDirectorySize?: number;
  centralDirectoryOffset?: number;
  zip64Locator?: boolean;
}

function bytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? encoder.encode(value) : value;
}

function extraField(id: number, payload = new Uint8Array()): Uint8Array {
  const field = new Uint8Array(4 + payload.length);
  const view = new DataView(field.buffer);
  view.setUint16(0, id, true);
  view.setUint16(2, payload.length, true);
  field.set(payload, 4);
  return field;
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function buildZip(
  entries: ZipFixtureEntry[],
  options: ZipFixtureOptions = {},
): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const localOffsets: number[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const centralName = bytes(entry.name);
    const localName = bytes(entry.localName ?? entry.name);
    const body = entry.body ?? new Uint8Array();
    const compressedSize = entry.compressedSize ?? body.length;
    const uncompressedSize = entry.uncompressedSize ?? body.length;
    const crc32 = entry.crc32 ?? 0;
    const compressionMethod = entry.compressionMethod ?? 0;
    const flags = entry.flags ?? 0;
    const localFlags = entry.localFlags ?? flags;
    const localExtra = entry.localExtra ?? new Uint8Array();
    const centralExtra = entry.centralExtra ?? new Uint8Array();

    localOffsets.push(localOffset);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    const localUsesDataDescriptor = (localFlags & 0x0008) !== 0;
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, localFlags, true);
    localView.setUint16(8, compressionMethod, true);
    localView.setUint32(14, localUsesDataDescriptor ? 0 : crc32, true);
    localView.setUint32(18, localUsesDataDescriptor ? 0 : compressedSize, true);
    localView.setUint32(
      22,
      localUsesDataDescriptor ? 0 : uncompressedSize,
      true,
    );
    localView.setUint16(26, localName.length, true);
    localView.setUint16(28, localExtra.length, true);
    const dataDescriptor =
      (flags & 0x0008) !== 0 && entry.dataDescriptor !== 'missing'
        ? buildDataDescriptor(
            crc32,
            compressedSize,
            uncompressedSize,
            entry.dataDescriptor !== 'unsigned',
          )
        : new Uint8Array();
    localParts.push(localHeader, localName, localExtra, body, dataDescriptor);
    localOffset +=
      localHeader.length +
      localName.length +
      localExtra.length +
      body.length +
      dataDescriptor.length;

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, entry.versionMadeBy ?? 0x0314, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, flags, true);
    centralView.setUint16(10, compressionMethod, true);
    centralView.setUint32(16, crc32, true);
    centralView.setUint32(20, compressedSize, true);
    centralView.setUint32(24, uncompressedSize, true);
    centralView.setUint16(28, centralName.length, true);
    centralView.setUint16(30, centralExtra.length, true);
    centralView.setUint16(34, entry.startingDisk ?? 0, true);
    centralView.setUint32(38, entry.externalAttributes ?? 0, true);
    centralView.setUint32(42, localOffsets.at(-1) ?? 0, true);
    centralParts.push(centralHeader, centralName, centralExtra);
  }

  const localData = concatenate(localParts);
  const centralDirectory = concatenate(centralParts);
  const zip64EndRecord = options.zip64Locator
    ? new Uint8Array(56)
    : new Uint8Array();
  const locator = options.zip64Locator ? new Uint8Array(20) : new Uint8Array();
  if (options.zip64Locator) {
    const zip64View = new DataView(zip64EndRecord.buffer);
    zip64View.setUint32(0, 0x06064b50, true);
    zip64View.setUint32(4, 44, true);

    const locatorView = new DataView(locator.buffer);
    locatorView.setUint32(0, 0x07064b50, true);
    locatorView.setUint32(8, localData.length + centralDirectory.length, true);
    locatorView.setUint32(16, 1, true);
  }

  const comment = options.comment ?? new Uint8Array();
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, options.diskNumber ?? 0, true);
  endView.setUint16(6, options.centralDirectoryDisk ?? 0, true);
  endView.setUint16(8, options.entriesOnDisk ?? entries.length, true);
  endView.setUint16(10, options.totalEntries ?? entries.length, true);
  endView.setUint32(
    12,
    options.centralDirectorySize ?? centralDirectory.length,
    true,
  );
  endView.setUint32(
    16,
    options.centralDirectoryOffset ?? localData.length,
    true,
  );
  endView.setUint16(20, comment.length, true);

  return concatenate([
    localData,
    centralDirectory,
    zip64EndRecord,
    locator,
    endRecord,
    comment,
  ]);
}

function buildDataDescriptor(
  crc32: number,
  compressedSize: number,
  uncompressedSize: number,
  includeSignature: boolean,
): Uint8Array {
  const descriptor = new Uint8Array(includeSignature ? 16 : 12);
  const view = new DataView(descriptor.buffer);
  const valuesOffset = includeSignature ? 4 : 0;
  if (includeSignature) {
    view.setUint32(0, 0x08074b50, true);
  }
  view.setUint32(valuesOffset, crc32, true);
  view.setUint32(valuesOffset + 4, compressedSize, true);
  view.setUint32(valuesOffset + 8, uncompressedSize, true);
  return descriptor;
}

function mutateZip(
  data: Uint8Array,
  mutate: (
    view: DataView,
    offsets: { centralDirectory: number; endRecord: number },
  ) => void,
): Uint8Array {
  const result = data.slice();
  const view = new DataView(result.buffer);
  const endRecord = result.length - 22;
  const centralDirectory = view.getUint32(endRecord + 16, true);
  mutate(view, { centralDirectory, endRecord });
  return result;
}

function removeCentralDirectoryEntry(
  data: Uint8Array,
  entryIndex: number,
): Uint8Array {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const endRecord = data.length - 22;
  const centralDirectoryOffset = view.getUint32(endRecord + 16, true);
  const entryCount = view.getUint16(endRecord + 10, true);
  if (entryIndex < 0 || entryIndex >= entryCount) {
    throw new RangeError('Central-directory entry index is out of range');
  }

  let entryStart = centralDirectoryOffset;
  for (let index = 0; index < entryIndex; index += 1) {
    entryStart +=
      46 +
      view.getUint16(entryStart + 28, true) +
      view.getUint16(entryStart + 30, true) +
      view.getUint16(entryStart + 32, true);
  }
  const entryLength =
    46 +
    view.getUint16(entryStart + 28, true) +
    view.getUint16(entryStart + 30, true) +
    view.getUint16(entryStart + 32, true);
  const result = concatenate([
    data.subarray(0, entryStart),
    data.subarray(entryStart + entryLength),
  ]);
  const resultView = new DataView(result.buffer);
  const resultEndRecord = endRecord - entryLength;
  resultView.setUint16(resultEndRecord + 8, entryCount - 1, true);
  resultView.setUint16(resultEndRecord + 10, entryCount - 1, true);
  resultView.setUint32(
    resultEndRecord + 12,
    view.getUint32(endRecord + 12, true) - entryLength,
    true,
  );
  return result;
}

function inspectError(
  data: Uint8Array,
  limits?: ZipManifestLimits,
): ZipManifestError {
  try {
    inspectZipManifest(data, limits);
  } catch (error) {
    if (error instanceof ZipManifestError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected ZIP inspection to fail');
}

describe('inspectZipManifest', () => {
  it('accepts an empty archive with no local entry data', () => {
    const manifest = inspectZipManifest(buildZip([]));

    expect(manifest.entries).toEqual([]);
    expect(manifest.entryCount).toBe(0);
  });

  it('returns normalized file and directory metadata without rejecting spaces', () => {
    const data = buildZip([
      { name: 'project folder/' },
      {
        name: 'project folder/read me.txt',
        body: new Uint8Array([1, 2, 3, 4]),
      },
      {
        name: 'project folder\\nested\\.\\data.json',
        body: new Uint8Array([5, 6]),
        compressionMethod: 8,
      },
    ]);

    expect(inspectZipManifest(data)).toEqual({
      entries: [
        {
          path: 'project folder',
          type: 'directory',
          size: 0,
          compressedSize: 0,
          compressionMethod: 0,
        },
        {
          path: 'project folder/read me.txt',
          type: 'file',
          size: 4,
          compressedSize: 4,
          compressionMethod: 0,
        },
        {
          path: 'project folder/nested/data.json',
          type: 'file',
          size: 2,
          compressedSize: 2,
          compressionMethod: 8,
        },
      ],
      entryCount: 3,
      fileCount: 2,
      directoryCount: 1,
      totalUncompressedBytes: 6,
    });
  });

  it.each([
    '../outside.txt',
    'folder/../../outside.txt',
    'folder\\..\\outside.txt',
  ])('rejects traversal path %s', (name) => {
    const error = inspectError(buildZip([{ name }]));

    expect(error).toBeInstanceOf(UnsafeZipEntryError);
    expect((error as UnsafeZipEntryError).reason).toBe('path-traversal');
    expect(error.code).toBe('ZIP_UNSAFE_ENTRY');
  });

  it.each([
    ['/etc/passwd', 'absolute-path'],
    ['\\\\server\\share\\file.txt', 'absolute-path'],
    ['C:\\temp\\file.txt', 'drive-qualified-path'],
    ['d:relative.txt', 'drive-qualified-path'],
  ] as const)('rejects unsafe absolute or drive path %s', (name, reason) => {
    const error = inspectError(buildZip([{ name }]));

    expect(error).toBeInstanceOf(UnsafeZipEntryError);
    expect((error as UnsafeZipEntryError).reason).toBe(reason);
  });

  it.each([
    'safe.txt:payload',
    'dir/file.txt:payload',
    'dir/C:payload',
  ])('rejects NTFS alternate data stream path %s', (name) => {
    const error = inspectError(buildZip([{ name }]));

    expect(error).toBeInstanceOf(UnsafeZipEntryError);
    expect((error as UnsafeZipEntryError).reason).toBe('alternate-data-stream');
    expect(error.entryPath).toBe(name);
  });

  it.each([
    'CON',
    'con.txt',
    'dir/NUL.txt',
    'AUX.md',
    'COM1',
    'LPT9.log',
    'CONIN$',
    'dir/file.',
    'dir/file ',
  ])('rejects Windows-reserved path %s', (name) => {
    const error = inspectError(buildZip([{ name }]));

    expect(error).toBeInstanceOf(UnsafeZipEntryError);
    expect((error as UnsafeZipEntryError).reason).toBe('windows-reserved-path');
    expect(error.entryPath).toBe(name);
  });

  it('allows names that only resemble Windows device names', () => {
    const manifest = inspectZipManifest(
      buildZip([
        { name: 'COM10.txt' },
        { name: 'computer.txt' },
        { name: 'null.txt' },
      ]),
    );

    expect(manifest.entries.map((entry) => entry.path)).toEqual([
      'COM10.txt',
      'computer.txt',
      'null.txt',
    ]);
  });

  it('rejects an actual NUL byte while allowing ordinary spaces', () => {
    const error = inspectError(buildZip([{ name: 'safe name\0hidden.txt' }]));

    expect(error).toBeInstanceOf(UnsafeZipEntryError);
    expect((error as UnsafeZipEntryError).reason).toBe('nul-byte');
  });

  it('rejects Unix symbolic-link entries', () => {
    const symlinkMode = (0o120777 << 16) >>> 0;
    const error = inspectError(
      buildZip([
        {
          name: 'link',
          externalAttributes: symlinkMode,
          versionMadeBy: 0x0314,
        },
      ]),
    );

    expect(error).toBeInstanceOf(UnsafeZipEntryError);
    expect((error as UnsafeZipEntryError).reason).toBe('symlink');
  });

  it('rejects Windows reparse-point entries', () => {
    const error = inspectError(
      buildZip([
        {
          name: 'junction',
          externalAttributes: 0x400,
          versionMadeBy: 0x0a14,
        },
      ]),
    );

    expect(error).toBeInstanceOf(UnsafeZipEntryError);
    expect((error as UnsafeZipEntryError).reason).toBe('reparse-point');
    expect(error.entryPath).toBe('junction');
  });

  it.each([
    { fileType: 0o010000, label: 'FIFO' },
    { fileType: 0o020000, label: 'character device' },
    { fileType: 0o060000, label: 'block device' },
    { fileType: 0o140000, label: 'socket' },
  ] as const)('rejects Unix $label entries', ({ fileType }) => {
    const externalAttributes = ((fileType | 0o644) << 16) >>> 0;
    const error = inspectError(
      buildZip([{ name: 'special', externalAttributes }]),
    );

    expect(error).toBeInstanceOf(UnsafeZipEntryError);
    expect((error as UnsafeZipEntryError).reason).toBe('special-file');
  });

  it.each([
    {
      label: 'DOS directory attribute',
      name: 'folder',
      externalAttributes: (((0o100644 << 16) >>> 0) | 0x10) >>> 0,
    },
    {
      label: 'directory path marker',
      name: 'folder/',
      externalAttributes: (0o100644 << 16) >>> 0,
    },
  ])('rejects Unix regular files with a conflicting $label', ({
    name,
    externalAttributes,
  }) => {
    const error = inspectError(
      buildZip([
        { name, externalAttributes, versionMadeBy: 0x0314 },
        { name: 'folder/file.txt' },
      ]),
    );

    expect(error).toBeInstanceOf(UnsupportedZipFeatureError);
    expect((error as UnsupportedZipFeatureError).feature).toBe(
      'ambiguous-metadata',
    );
    expect(error.entryPath).toBe(name);
  });

  it.each([
    { creator: 'DOS', versionMadeBy: 0x0014 },
    { creator: 'NTFS', versionMadeBy: 0x0a14 },
  ])('rejects spoofed Unix file-type bits from a $creator creator', ({
    versionMadeBy,
  }) => {
    const error = inspectError(
      buildZip([
        {
          name: 'folder',
          externalAttributes: (0o040755 << 16) >>> 0,
          versionMadeBy,
        },
        { name: 'folder/file.txt' },
      ]),
    );

    expect(error).toBeInstanceOf(UnsupportedZipFeatureError);
    expect((error as UnsupportedZipFeatureError).feature).toBe(
      'ambiguous-metadata',
    );
    expect(error.entryPath).toBe('folder');
  });

  it('honors Unix file-type bits from a Darwin creator', () => {
    const manifest = inspectZipManifest(
      buildZip([
        {
          name: 'folder',
          externalAttributes: (0o040755 << 16) >>> 0,
          versionMadeBy: 0x1314,
        },
      ]),
    );

    expect(manifest.entries[0]?.type).toBe('directory');
  });

  it('rejects ASi Unix metadata that could override the entry file type', () => {
    const asiUnixExtra = extraField(0x756e, new Uint8Array(10));

    for (const data of [
      buildZip([{ name: 'link', centralExtra: asiUnixExtra }]),
      buildZip([{ name: 'link', localExtra: asiUnixExtra }]),
    ]) {
      const error = inspectError(data);
      expect(error).toBeInstanceOf(UnsupportedZipFeatureError);
      expect((error as UnsupportedZipFeatureError).feature).toBe(
        'ambiguous-metadata',
      );
    }
  });

  it('rejects PKWARE Unix metadata that could supply a link target', () => {
    const linkTarget = encoder.encode('../../outside');
    const pkwareUnixExtra = extraField(
      0x000d,
      concatenate([new Uint8Array(12), linkTarget]),
    );

    for (const data of [
      buildZip([{ name: 'safe.txt', centralExtra: pkwareUnixExtra }]),
      buildZip([{ name: 'safe.txt', localExtra: pkwareUnixExtra }]),
    ]) {
      const error = inspectError(data);
      expect(error).toBeInstanceOf(UnsupportedZipFeatureError);
      expect((error as UnsupportedZipFeatureError).feature).toBe(
        'ambiguous-metadata',
      );
    }
  });

  it('rejects libarchive metadata that could override the file type', () => {
    const attributes = new Uint8Array(7);
    const attributesView = new DataView(attributes.buffer);
    attributesView.setUint8(0, 0x05);
    attributesView.setUint16(1, 0x0314, true);
    attributesView.setUint32(3, (0o120777 << 16) >>> 0, true);
    const libarchiveExtra = extraField(0x6c78, attributes);

    for (const data of [
      buildZip([{ name: 'safe.txt', centralExtra: libarchiveExtra }]),
      buildZip([{ name: 'safe.txt', localExtra: libarchiveExtra }]),
    ]) {
      const error = inspectError(data);
      expect(error).toBeInstanceOf(UnsupportedZipFeatureError);
      expect((error as UnsupportedZipFeatureError).feature).toBe(
        'ambiguous-metadata',
      );
    }
  });

  it('rejects paths that collide after normalization', () => {
    const error = inspectError(
      buildZip([{ name: 'folder//file.txt' }, { name: 'folder/file.txt' }]),
    );

    expect(error).toBeInstanceOf(UnsafeZipEntryError);
    expect((error as UnsafeZipEntryError).reason).toBe('duplicate-path');
  });

  it.each([
    ['case-only aliases', 'Readme.md', 'readme.md'],
    ['Unicode-normalization aliases', 'caf\u00e9.txt', 'cafe\u0301.txt'],
  ])('rejects portable path collisions: %s', (_label, first, second) => {
    const error = inspectError(buildZip([{ name: first }, { name: second }]));

    expect(error).toBeInstanceOf(UnsafeZipEntryError);
    expect((error as UnsafeZipEntryError).reason).toBe(
      'portable-path-collision',
    );
    expect(error.entryPath).toBe(second);
  });

  it.each([
    [
      'file before descendant',
      [{ name: 'folder' }, { name: 'folder/file.txt' }],
    ],
    [
      'descendant before file',
      [{ name: 'folder/file.txt' }, { name: 'folder' }],
    ],
  ])('rejects file and descendant path conflicts: %s', (_label, entries) => {
    const error = inspectError(buildZip(entries));

    expect(error).toBeInstanceOf(UnsafeZipEntryError);
    expect((error as UnsafeZipEntryError).reason).toBe('path-conflict');
  });

  it('rejects case-insensitive file and descendant path conflicts', () => {
    const error = inspectError(
      buildZip([{ name: 'Folder' }, { name: 'folder/file.txt' }]),
    );

    expect(error).toBeInstanceOf(UnsafeZipEntryError);
    expect((error as UnsafeZipEntryError).reason).toBe('path-conflict');
  });

  it('accepts an explicit directory that follows its descendant', () => {
    const manifest = inspectZipManifest(
      buildZip([{ name: 'folder/file.txt' }, { name: 'folder/' }]),
    );

    expect(manifest.entries.map(({ path, type }) => ({ path, type }))).toEqual([
      { path: 'folder/file.txt', type: 'file' },
      { path: 'folder', type: 'directory' },
    ]);
  });

  it('bounds conflict inspection for many deep slash-heavy paths', () => {
    const entries = Array.from({ length: 250 }, (_, index) => ({
      name: `root-${index}/${Array.from({ length: 200 }, () => 'd').join('/')}/file.txt`,
    }));

    const manifest = inspectZipManifest(buildZip(entries));

    expect(manifest.entryCount).toBe(entries.length);
  });

  it('rejects stored entries whose declared sizes differ', () => {
    const error = inspectError(
      buildZip([
        {
          name: 'impossible.bin',
          compressedSize: 0,
          uncompressedSize: 10,
          compressionMethod: 0,
        },
      ]),
    );

    expect(error).toBeInstanceOf(InvalidZipArchiveError);
    expect(error.message).toContain('different compressed and uncompressed');
  });

  it('rejects overlapping local entry ranges', () => {
    const error = inspectError(
      buildZip([
        {
          name: 'first.bin',
          compressedSize: 48,
          uncompressedSize: 48,
        },
        {
          name: 'second.bin',
          body: new Uint8Array(96),
        },
      ]),
    );

    expect(error).toBeInstanceOf(InvalidZipArchiveError);
    expect(error.message).toContain('local entry ranges');
    expect(error.message).toContain('overlap');
  });

  it.each([
    {
      label: 'before the referenced entry',
      entries: [{ name: '../hidden.txt' }, { name: 'safe.txt' }],
      hiddenIndex: 0,
    },
    {
      label: 'between referenced entries',
      entries: [
        { name: 'first.txt' },
        { name: '../hidden.txt' },
        { name: 'last.txt' },
      ],
      hiddenIndex: 1,
    },
    {
      label: 'after the referenced entry',
      entries: [{ name: 'safe.txt' }, { name: '../hidden.txt' }],
      hiddenIndex: 1,
    },
  ])('rejects an unreferenced local entry $label', ({
    entries,
    hiddenIndex,
  }) => {
    const error = inspectError(
      removeCentralDirectoryEntry(buildZip(entries), hiddenIndex),
    );

    expect(error).toBeInstanceOf(InvalidZipArchiveError);
    expect(error.message).toContain('not described by a central-directory');
  });

  it.each([
    [
      'signed stored',
      {
        name: 'signed-stored.bin',
        body: new Uint8Array([1, 2, 3]),
        dataDescriptor: 'signed',
        flags: 0x0008,
      },
    ],
    [
      'unsigned stored',
      {
        name: 'unsigned-stored.bin',
        body: new Uint8Array([1, 2, 3]),
        dataDescriptor: 'unsigned',
        flags: 0x0008,
      },
    ],
    [
      'stored CRC/signature collision',
      {
        name: 'crc-collision.bin',
        body: new Uint8Array([1, 2, 3]),
        crc32: 0x08074b50,
        dataDescriptor: 'unsigned',
        flags: 0x0008,
      },
    ],
    [
      'missing stored',
      {
        name: 'missing-stored.bin',
        body: new Uint8Array([1, 2, 3]),
        dataDescriptor: 'missing',
        flags: 0x0008,
      },
    ],
    [
      'signed deflate',
      {
        name: 'streamed-deflate.bin',
        body: new Uint8Array([0x03, 0x00]),
        compressionMethod: 8,
        dataDescriptor: 'signed',
        flags: 0x0008,
        uncompressedSize: 0,
      },
    ],
    [
      'stored early-boundary smuggling',
      {
        name: 'smuggled-stored.bin',
        body: concatenate([
          buildDataDescriptor(0, 0, 0, true),
          new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
        ]),
        dataDescriptor: 'signed',
        flags: 0x0008,
      },
    ],
  ] satisfies Array<
    [string, ZipFixtureEntry]
  >)('rejects %s data descriptors as ambiguous metadata', (_label, entry) => {
    const error = inspectError(buildZip([entry]));

    expect(error).toBeInstanceOf(UnsupportedZipFeatureError);
    expect((error as UnsupportedZipFeatureError).feature).toBe(
      'ambiguous-metadata',
    );
    expect((error as UnsupportedZipFeatureError).entryPath).toBe(entry.name);
    expect(error.message).toContain('payload boundary');
  });

  it('enforces the configured central-directory entry-count limit', () => {
    const error = inspectError(buildZip([{ name: 'one' }, { name: 'two' }]), {
      maxEntries: 1,
    });

    expect(error).toBeInstanceOf(ZipManifestLimitError);
    expect((error as ZipManifestLimitError).limit).toBe('entry-count');
    expect((error as ZipManifestLimitError).actual).toBe(2);
  });

  it('enforces the configured per-entry uncompressed-size limit', () => {
    const error = inspectError(
      buildZip([
        {
          name: 'large.bin',
          compressedSize: 0,
          uncompressedSize: 6,
          compressionMethod: 8,
        },
      ]),
      { maxEntryUncompressedBytes: 5 },
    );

    expect(error).toBeInstanceOf(ZipManifestLimitError);
    expect((error as ZipManifestLimitError).limit).toBe(
      'entry-uncompressed-size',
    );
    expect(error.entryPath).toBe('large.bin');
  });

  it('enforces the configured aggregate uncompressed-size limit', () => {
    const error = inspectError(
      buildZip([
        {
          name: 'one.bin',
          compressedSize: 0,
          uncompressedSize: 3,
          compressionMethod: 8,
        },
        {
          name: 'two.bin',
          compressedSize: 0,
          uncompressedSize: 3,
          compressionMethod: 8,
        },
      ]),
      { maxTotalUncompressedBytes: 5 },
    );

    expect(error).toBeInstanceOf(ZipManifestLimitError);
    expect((error as ZipManifestLimitError).limit).toBe(
      'total-uncompressed-size',
    );
    expect((error as ZipManifestLimitError).actual).toBe(6);
  });

  it('rejects invalid configured limits', () => {
    const data = buildZip([]);

    expect(() => inspectZipManifest(data, { maxEntries: -1 })).toThrow(
      RangeError,
    );
    expect(() =>
      inspectZipManifest(data, { maxTotalUncompressedBytes: 1.5 }),
    ).toThrow(RangeError);
  });

  it('rejects missing and truncated central-directory metadata', () => {
    expect(inspectError(new Uint8Array([1, 2, 3]))).toBeInstanceOf(
      InvalidZipArchiveError,
    );

    const truncatedEntry = mutateZip(
      buildZip([{ name: 'file.txt' }]),
      (view, { centralDirectory }) => {
        view.setUint16(centralDirectory + 28, 0xffff, true);
      },
    );
    expect(inspectError(truncatedEntry)).toBeInstanceOf(InvalidZipArchiveError);
  });

  it('rejects corrupt central-directory signatures and size/count mismatches', () => {
    const invalidSignature = mutateZip(
      buildZip([{ name: 'file.txt' }]),
      (view, { centralDirectory }) => {
        view.setUint32(centralDirectory, 0x11111111, true);
      },
    );
    expect(inspectError(invalidSignature)).toBeInstanceOf(
      InvalidZipArchiveError,
    );

    const invalidSize = mutateZip(
      buildZip([{ name: 'file.txt' }]),
      (view, { endRecord }) => {
        const size = view.getUint32(endRecord + 12, true);
        view.setUint32(endRecord + 12, size - 1, true);
      },
    );
    expect(inspectError(invalidSize)).toBeInstanceOf(InvalidZipArchiveError);

    const invalidCount = mutateZip(
      buildZip([{ name: 'file.txt' }]),
      (view, { endRecord }) => {
        view.setUint16(endRecord + 8, 2, true);
        view.setUint16(endRecord + 10, 2, true);
      },
    );
    expect(inspectError(invalidCount)).toBeInstanceOf(InvalidZipArchiveError);
  });

  it('rejects mismatched local and central-directory paths', () => {
    const error = inspectError(
      buildZip([{ name: 'safe.txt', localName: 'evil.txt' }]),
    );

    expect(error).toBeInstanceOf(InvalidZipArchiveError);
  });

  it('ignores forged EOCD signatures inside a valid ZIP comment', () => {
    const comment = new Uint8Array(30);
    new DataView(comment.buffer).setUint32(0, 0x06054b50, true);
    const data = buildZip([{ name: 'valid.txt' }], { comment });

    expect(inspectZipManifest(data).entries[0]?.path).toBe('valid.txt');
  });

  it('falls back from an EOF-aligned forged EOCD in a valid ZIP comment', () => {
    const forgedEndRecord = new Uint8Array(22);
    new DataView(forgedEndRecord.buffer).setUint32(0, 0x06054b50, true);
    const data = buildZip([{ name: 'valid.txt' }], {
      comment: forgedEndRecord,
    });

    expect(inspectZipManifest(data).entries[0]?.path).toBe('valid.txt');
  });

  it('rejects a plausible empty EOCD smuggled in a valid ZIP comment', () => {
    const forgedEndRecord = new Uint8Array(22);
    const forgedView = new DataView(forgedEndRecord.buffer);
    const forgedOffset = buildZip([{ name: 'hidden.txt' }]).length;
    forgedView.setUint32(0, 0x06054b50, true);
    forgedView.setUint32(16, forgedOffset, true);

    const error = inspectError(
      buildZip([{ name: 'hidden.txt' }], { comment: forgedEndRecord }),
    );

    expect(error).toBeInstanceOf(InvalidZipArchiveError);
    expect(error.message).toContain('multiple structurally valid');
  });

  it('falls back from forged ZIP64 markers at the end of a valid comment', () => {
    const baseLength = buildZip([{ name: 'valid.txt' }]).length;
    const forgedSentinel = new Uint8Array(22);
    const sentinelView = new DataView(forgedSentinel.buffer);
    sentinelView.setUint32(0, 0x06054b50, true);
    sentinelView.setUint16(8, 0xffff, true);
    sentinelView.setUint16(10, 0xffff, true);
    sentinelView.setUint32(16, baseLength, true);

    const orphanLocator = new Uint8Array(42);
    const orphanView = new DataView(orphanLocator.buffer);
    orphanView.setUint32(0, 0x07064b50, true);
    orphanView.setUint32(20, 0x06054b50, true);
    orphanView.setUint16(28, 0xffff, true);
    orphanView.setUint16(30, 0xffff, true);
    orphanView.setUint32(32, 0xffffffff, true);
    orphanView.setUint32(36, 0xffffffff, true);

    for (const comment of [forgedSentinel, orphanLocator]) {
      expect(
        inspectZipManifest(buildZip([{ name: 'valid.txt' }], { comment }))
          .entries[0]?.path,
      ).toBe('valid.txt');
    }
  });

  it('bounds cumulative EOCD candidate validation by maxEntries', () => {
    const base = buildZip([{ name: 'valid.txt' }]);
    const baseView = new DataView(base.buffer);
    const realEndRecord = base.length - 22;
    const centralDirectory = baseView.getUint32(realEndRecord + 16, true);
    const comment = new Uint8Array(64);
    const commentView = new DataView(comment.buffer);

    for (const offset of [0, 32]) {
      const candidateOffset = base.length + offset;
      commentView.setUint32(offset, 0x06054b50, true);
      commentView.setUint16(offset + 8, 2, true);
      commentView.setUint16(offset + 10, 2, true);
      commentView.setUint32(
        offset + 12,
        candidateOffset - centralDirectory,
        true,
      );
      commentView.setUint32(offset + 16, centralDirectory, true);
      commentView.setUint16(offset + 20, comment.length - offset - 22, true);
    }

    const error = inspectError(buildZip([{ name: 'valid.txt' }], { comment }), {
      maxEntries: 2,
    });
    expect(error).toBeInstanceOf(InvalidZipArchiveError);
    expect(error.message).toContain('entry-check budget');
  });

  it.each([
    { flags: 0x0001, label: 'traditional encryption' },
    { flags: 0x0040, label: 'strong encryption' },
    { flags: 0x2000, label: 'masked local-header encryption' },
  ])('rejects $label explicitly', ({ flags }) => {
    const error = inspectError(buildZip([{ name: 'secret.txt', flags }]));

    expect(error).toBeInstanceOf(UnsupportedZipFeatureError);
    expect((error as UnsupportedZipFeatureError).feature).toBe('encryption');
    expect(error.code).toBe('ZIP_UNSUPPORTED_FEATURE');
  });

  it('rejects encryption markers in local flags and extra fields', () => {
    const strongEncryptionExtra = extraField(0x0017);

    for (const data of [
      buildZip([{ name: 'secret.txt', flags: 0, localFlags: 0x2000 }]),
      buildZip([{ name: 'secret.txt', centralExtra: strongEncryptionExtra }]),
      buildZip([{ name: 'secret.txt', localExtra: strongEncryptionExtra }]),
    ]) {
      const error = inspectError(data);
      expect(error).toBeInstanceOf(UnsupportedZipFeatureError);
      expect((error as UnsupportedZipFeatureError).feature).toBe('encryption');
    }
  });

  it('rejects WinZip AES metadata even when encryption flags are malformed', () => {
    const aesExtra = extraField(0x9901);

    for (const data of [
      buildZip([{ name: 'secret.txt', compressionMethod: 99 }]),
      buildZip([{ name: 'secret.txt', centralExtra: aesExtra }]),
    ]) {
      const error = inspectError(data);
      expect(error).toBeInstanceOf(UnsupportedZipFeatureError);
      expect((error as UnsupportedZipFeatureError).feature).toBe('encryption');
    }
  });

  it('rejects alternate Unicode paths but accepts strict UTF-8 raw names', () => {
    const traversalPath = encoder.encode('../outside.txt');
    const unicodePathExtras = [
      extraField(
        0x7075,
        concatenate([new Uint8Array([1, 0, 0, 0, 0]), traversalPath]),
      ),
      extraField(0x554e, traversalPath),
    ];

    for (const unicodePathExtra of unicodePathExtras) {
      for (const data of [
        buildZip([{ name: 'safe.txt', centralExtra: unicodePathExtra }]),
        buildZip([{ name: 'safe.txt', localExtra: unicodePathExtra }]),
      ]) {
        const error = inspectError(data);
        expect(error).toBeInstanceOf(UnsupportedZipFeatureError);
        expect((error as UnsupportedZipFeatureError).feature).toBe(
          'ambiguous-metadata',
        );
      }
    }

    for (const flags of [0, 0x0800]) {
      expect(
        inspectZipManifest(buildZip([{ name: 'café.txt', flags }])).entries[0]
          ?.path,
      ).toBe('café.txt');
    }
  });

  it.each([
    '\ufeffsafe.txt',
    '\ufeff../outside.txt',
    '\ufeff/etc/passwd',
  ])('rejects a leading UTF-8 BOM as ambiguous filename metadata: %s', (name) => {
    const error = inspectError(buildZip([{ name }]));

    expect(error).toBeInstanceOf(UnsupportedZipFeatureError);
    expect((error as UnsupportedZipFeatureError).feature).toBe(
      'ambiguous-metadata',
    );
    expect(error.message).toContain('UTF-8 BOM');
  });

  it('rejects PKWARE alternate filename encodings in local and central metadata', () => {
    const alternateEncodingExtra = extraField(0x0008, encoder.encode('IBM037'));

    for (const data of [
      buildZip([{ name: 'safe.txt', centralExtra: alternateEncodingExtra }]),
      buildZip([{ name: 'safe.txt', localExtra: alternateEncodingExtra }]),
    ]) {
      const error = inspectError(data);
      expect(error).toBeInstanceOf(UnsupportedZipFeatureError);
      expect((error as UnsupportedZipFeatureError).feature).toBe(
        'ambiguous-metadata',
      );
    }
  });

  it('rejects ZIP64 chains and extra fields explicitly', () => {
    const sentinel = mutateZip(buildZip([]), (view, { endRecord }) => {
      view.setUint16(endRecord + 8, 0xffff, true);
      view.setUint16(endRecord + 10, 0xffff, true);
    });
    const locator = buildZip([], { zip64Locator: true });
    const zip64Extra = extraField(0x0001);
    const extra = buildZip([{ name: 'file.txt', centralExtra: zip64Extra }]);

    expect(inspectError(sentinel)).toBeInstanceOf(InvalidZipArchiveError);

    for (const data of [locator, extra]) {
      const error = inspectError(data);
      expect(error).toBeInstanceOf(UnsupportedZipFeatureError);
      expect((error as UnsupportedZipFeatureError).feature).toBe('zip64');
    }
  });

  it('rejects multi-disk archives explicitly', () => {
    const error = inspectError(
      buildZip([{ name: 'file.txt' }], {
        diskNumber: 1,
        centralDirectoryDisk: 1,
      }),
    );

    expect(error).toBeInstanceOf(UnsupportedZipFeatureError);
    expect((error as UnsupportedZipFeatureError).feature).toBe('multi-disk');
  });
});
