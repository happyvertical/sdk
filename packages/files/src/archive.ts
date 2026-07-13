/**
 * Bounded, zero-decompression ZIP manifest inspection.
 *
 * The inspector reads ZIP metadata only. It never inflates or materializes an
 * entry body, and it rejects archive features that would make the classic ZIP
 * metadata ambiguous (ZIP64, encryption, and multi-disk archives).
 */

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06064b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EXTRA_FIELD_ID = 0x0001;
const PKWARE_EXTENDED_LANGUAGE_ENCODING_EXTRA_FIELD_ID = 0x0008;
const PKWARE_UNIX_EXTRA_FIELD_ID = 0x000d;
const STRONG_ENCRYPTION_EXTRA_FIELD_ID = 0x0017;
const XCEED_UNICODE_PATH_EXTRA_FIELD_ID = 0x554e;
const LIBARCHIVE_EXTRA_FIELD_ID = 0x6c78;
const UNICODE_PATH_EXTRA_FIELD_ID = 0x7075;
const ASI_UNIX_EXTRA_FIELD_ID = 0x756e;
const WINZIP_AES_EXTRA_FIELD_ID = 0x9901;
const WINZIP_AES_COMPRESSION_METHOD = 99;

const END_OF_CENTRAL_DIRECTORY_SIZE = 22;
const MAX_ZIP_COMMENT_BYTES = 0xffff;
const CENTRAL_DIRECTORY_ENTRY_SIZE = 46;
const LOCAL_FILE_HEADER_SIZE = 30;

const ENCRYPTED_FLAG = 0x0001;
const STRONG_ENCRYPTION_FLAG = 0x0040;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const MASKED_LOCAL_HEADER_FLAG = 0x2000;

const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_DIRECTORY_TYPE = 0o040000;
const UNIX_REGULAR_FILE_TYPE = 0o100000;
const UNIX_SYMLINK_TYPE = 0o120000;
const DOS_DIRECTORY_ATTRIBUTE = 0x10;
const WINDOWS_REPARSE_POINT_ATTRIBUTE = 0x400;
const UNIX_CREATOR_SYSTEM = 3;
const DARWIN_CREATOR_SYSTEM = 19;
const WINDOWS_RESERVED_DEVICE_BASENAME =
  /^(?:aux|con|conin\$|conout\$|nul|prn|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])$/iu;

const utf8Decoder = new TextDecoder('utf-8', {
  fatal: true,
  ignoreBOM: true,
});

/** Limits applied while inspecting ZIP metadata. */
export interface ZipManifestLimits {
  /** Maximum number of central-directory entries, including directories. */
  maxEntries?: number;
  /** Maximum declared uncompressed size of one entry. */
  maxEntryUncompressedBytes?: number;
  /** Maximum aggregate declared uncompressed size across all entries. */
  maxTotalUncompressedBytes?: number;
  /** Maximum encoded byte length of one entry path. */
  maxPathBytes?: number;
}

/** Conservative defaults suitable for rejecting untrusted uploads. */
export const DEFAULT_ZIP_MANIFEST_LIMITS: Readonly<
  Required<ZipManifestLimits>
> = Object.freeze({
  maxEntries: 10_000,
  maxEntryUncompressedBytes: 200 * 1024 * 1024,
  maxTotalUncompressedBytes: 2 * 1024 * 1024 * 1024,
  maxPathBytes: 1024,
});

/** One normalized entry from a ZIP archive. */
export interface ZipManifestEntry {
  /** Normalized relative path using `/` separators and no `.` segments. */
  path: string;
  /** Whether the entry represents a file or directory. */
  type: 'file' | 'directory';
  /** Declared uncompressed size in bytes. */
  size: number;
  /** Declared compressed size in bytes. */
  compressedSize: number;
  /** ZIP compression method identifier. Entry bodies are not decompressed. */
  compressionMethod: number;
}

/** A bounded metadata-only view of a ZIP archive. */
export interface ZipManifest {
  entries: ZipManifestEntry[];
  entryCount: number;
  fileCount: number;
  directoryCount: number;
  totalUncompressedBytes: number;
}

export type ZipManifestErrorCode =
  | 'ZIP_INVALID'
  | 'ZIP_LIMIT_EXCEEDED'
  | 'ZIP_UNSAFE_ENTRY'
  | 'ZIP_UNSUPPORTED_FEATURE';

/** Base class for failures caused by untrusted ZIP input. */
export class ZipManifestError extends Error {
  constructor(
    message: string,
    public readonly code: ZipManifestErrorCode,
    public readonly entryPath?: string,
  ) {
    super(message);
    this.name = 'ZipManifestError';
  }
}

/** The archive metadata is malformed, truncated, or internally inconsistent. */
export class InvalidZipArchiveError extends ZipManifestError {
  constructor(message: string) {
    super(message, 'ZIP_INVALID');
    this.name = 'InvalidZipArchiveError';
  }
}

export type ZipUnsafeEntryReason =
  | 'absolute-path'
  | 'alternate-data-stream'
  | 'drive-qualified-path'
  | 'duplicate-path'
  | 'empty-path'
  | 'nul-byte'
  | 'path-conflict'
  | 'path-traversal'
  | 'portable-path-collision'
  | 'reparse-point'
  | 'special-file'
  | 'symlink'
  | 'windows-reserved-path';

/** An entry is unsafe to expose to an extraction workflow. */
export class UnsafeZipEntryError extends ZipManifestError {
  constructor(
    public readonly reason: ZipUnsafeEntryReason,
    entryPath: string,
    message: string,
  ) {
    super(message, 'ZIP_UNSAFE_ENTRY', entryPath);
    this.name = 'UnsafeZipEntryError';
  }
}

export type ZipLimitName =
  | 'entry-count'
  | 'entry-uncompressed-size'
  | 'path-bytes'
  | 'total-uncompressed-size';

/** A configured inspection limit was exceeded. */
export class ZipManifestLimitError extends ZipManifestError {
  constructor(
    public readonly limit: ZipLimitName,
    public readonly actual: number,
    public readonly maximum: number,
    message: string,
    entryPath?: string,
  ) {
    super(message, 'ZIP_LIMIT_EXCEEDED', entryPath);
    this.name = 'ZipManifestLimitError';
  }
}

export type UnsupportedZipFeature =
  | 'ambiguous-metadata'
  | 'encryption'
  | 'multi-disk'
  | 'zip64';

/** The archive uses a feature deliberately outside this inspector's policy. */
export class UnsupportedZipFeatureError extends ZipManifestError {
  constructor(
    public readonly feature: UnsupportedZipFeature,
    message: string,
    entryPath?: string,
  ) {
    super(message, 'ZIP_UNSUPPORTED_FEATURE', entryPath);
    this.name = 'UnsupportedZipFeatureError';
  }
}

interface EndOfCentralDirectory {
  offset: number;
  diskNumber: number;
  centralDirectoryDisk: number;
  entriesOnDisk: number;
  totalEntries: number;
  centralDirectorySize: number;
  centralDirectoryOffset: number;
}

interface ResolvedZipManifestLimits {
  maxEntries: number;
  maxEntryUncompressedBytes: number;
  maxTotalUncompressedBytes: number;
  maxPathBytes: number;
}

/**
 * Inspect a ZIP archive without decompressing entry bodies.
 *
 * ZIP64, encrypted, and multi-disk archives are rejected. Entry paths are
 * normalized and checked for traversal, absolute/drive-qualified forms, NTFS
 * alternate data streams, NUL bytes, Unix symlinks and special files, Windows
 * reparse points and reserved names, and portable case/normalization
 * collisions. Local entry ranges, declared entry sizes, and end-record
 * validation work are bounded and cross-checked before a manifest is returned.
 */
export function inspectZipManifest(
  data: Uint8Array,
  limits: ZipManifestLimits = {},
): ZipManifest {
  if (!(data instanceof Uint8Array)) {
    throw new TypeError('inspectZipManifest data must be a Uint8Array');
  }

  const resolvedLimits = resolveLimits(limits);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const endRecord = findEndOfCentralDirectory(view, resolvedLimits.maxEntries);

  assertClassicZip(endRecord, view);

  if (endRecord.totalEntries > resolvedLimits.maxEntries) {
    throw new ZipManifestLimitError(
      'entry-count',
      endRecord.totalEntries,
      resolvedLimits.maxEntries,
      `ZIP archive contains ${endRecord.totalEntries} entries; the limit is ${resolvedLimits.maxEntries}.`,
    );
  }

  if (
    endRecord.centralDirectoryOffset > endRecord.offset ||
    endRecord.centralDirectorySize >
      endRecord.offset - endRecord.centralDirectoryOffset
  ) {
    throw new InvalidZipArchiveError(
      'ZIP central directory points outside the archive metadata bounds.',
    );
  }

  const centralDirectoryEnd =
    endRecord.centralDirectoryOffset + endRecord.centralDirectorySize;
  if (centralDirectoryEnd !== endRecord.offset) {
    throw new InvalidZipArchiveError(
      'ZIP central directory size or offset does not match the end record.',
    );
  }

  const entries: ZipManifestEntry[] = [];
  const localEntryRanges: LocalEntryRange[] = [];
  const normalizedPaths = new Set<string>();
  const portablePaths = new Map<string, string>();
  let totalUncompressedBytes = 0;
  let fileCount = 0;
  let directoryCount = 0;
  let offset = endRecord.centralDirectoryOffset;

  for (let index = 0; index < endRecord.totalEntries; index += 1) {
    assertRange(
      offset,
      CENTRAL_DIRECTORY_ENTRY_SIZE,
      centralDirectoryEnd,
      'ZIP central directory is truncated.',
    );

    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new InvalidZipArchiveError(
        `ZIP central directory entry ${index + 1} has an invalid signature.`,
      );
    }

    const versionMadeBy = view.getUint16(offset + 4, true);
    const flags = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const crc32 = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const startingDisk = view.getUint16(offset + 34, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff ||
      startingDisk === 0xffff
    ) {
      throw zip64Error();
    }
    if (startingDisk !== 0) {
      throw multiDiskError();
    }
    assertNotEncrypted(flags);
    assertNotAesCompression(compressionMethod);

    const nameStart = offset + CENTRAL_DIRECTORY_ENTRY_SIZE;
    const nameEnd = nameStart + fileNameLength;
    const extraEnd = nameEnd + extraFieldLength;
    const entryEnd = extraEnd + commentLength;
    assertRange(
      offset,
      entryEnd - offset,
      centralDirectoryEnd,
      'ZIP central directory entry metadata is truncated.',
    );

    if (fileNameLength > resolvedLimits.maxPathBytes) {
      throw new ZipManifestLimitError(
        'path-bytes',
        fileNameLength,
        resolvedLimits.maxPathBytes,
        `ZIP entry path is ${fileNameLength} bytes; the limit is ${resolvedLimits.maxPathBytes}.`,
      );
    }

    assertExtraFields(data, nameEnd, extraEnd, 'central directory');
    const rawPathBytes = data.subarray(nameStart, nameEnd);
    const rawPath = decodeEntryPath(rawPathBytes);
    const path = normalizeEntryPath(rawPath);

    const unixMode = (externalAttributes >>> 16) & 0xffff;
    const unixFileType = unixMode & UNIX_FILE_TYPE_MASK;
    const creatorSystem = versionMadeBy >>> 8;
    if ((externalAttributes & WINDOWS_REPARSE_POINT_ATTRIBUTE) !== 0) {
      throw new UnsafeZipEntryError(
        'reparse-point',
        rawPath,
        `ZIP entry "${rawPath}" is a Windows reparse point, which is not allowed.`,
      );
    }
    if (
      unixFileType !== 0 &&
      creatorSystem !== UNIX_CREATOR_SYSTEM &&
      creatorSystem !== DARWIN_CREATOR_SYSTEM
    ) {
      throw new UnsupportedZipFeatureError(
        'ambiguous-metadata',
        `ZIP entry "${rawPath}" declares Unix file-type metadata from a non-Unix creator system.`,
        rawPath,
      );
    }
    if (unixFileType === UNIX_SYMLINK_TYPE) {
      throw new UnsafeZipEntryError(
        'symlink',
        rawPath,
        `ZIP entry "${rawPath}" is a symbolic link, which is not allowed.`,
      );
    }
    if (
      unixFileType !== 0 &&
      unixFileType !== UNIX_DIRECTORY_TYPE &&
      unixFileType !== UNIX_REGULAR_FILE_TYPE
    ) {
      throw new UnsafeZipEntryError(
        'special-file',
        rawPath,
        `ZIP entry "${rawPath}" uses an unsupported Unix special file type.`,
      );
    }

    if (compressionMethod === 0 && compressedSize !== uncompressedSize) {
      throw new InvalidZipArchiveError(
        `Stored ZIP entry "${path}" declares different compressed and uncompressed sizes.`,
      );
    }

    const hasDirectoryPathMarker =
      rawPath.endsWith('/') || rawPath.endsWith('\\');
    const hasDosDirectoryAttribute =
      (externalAttributes & DOS_DIRECTORY_ATTRIBUTE) !== 0;
    if (
      unixFileType === UNIX_REGULAR_FILE_TYPE &&
      (hasDirectoryPathMarker || hasDosDirectoryAttribute)
    ) {
      throw new UnsupportedZipFeatureError(
        'ambiguous-metadata',
        `ZIP entry "${rawPath}" has contradictory Unix file and directory metadata.`,
        rawPath,
      );
    }

    const type: ZipManifestEntry['type'] =
      hasDirectoryPathMarker ||
      unixFileType === UNIX_DIRECTORY_TYPE ||
      hasDosDirectoryAttribute
        ? 'directory'
        : 'file';

    if (normalizedPaths.has(path)) {
      throw new UnsafeZipEntryError(
        'duplicate-path',
        rawPath,
        `ZIP entry "${rawPath}" collides with another normalized path ("${path}").`,
      );
    }

    const portableKey = portablePathKey(path);
    const existingPortablePath = portablePaths.get(portableKey);
    if (existingPortablePath !== undefined) {
      throw new UnsafeZipEntryError(
        'portable-path-collision',
        rawPath,
        `ZIP entry "${rawPath}" collides with "${existingPortablePath}" on a case-insensitive or Unicode-normalizing filesystem.`,
      );
    }

    normalizedPaths.add(path);
    portablePaths.set(portableKey, path);

    const localDataEnd = validateLocalHeader(data, view, {
      centralDirectoryOffset: endRecord.centralDirectoryOffset,
      centralCrc32: crc32,
      centralFlags: flags,
      centralNameStart: nameStart,
      centralNameEnd: nameEnd,
      compressedSize,
      compressionMethod,
      localHeaderOffset,
      rawPath,
      uncompressedSize,
    });
    localEntryRanges.push({
      end: localDataEnd,
      path,
      start: localHeaderOffset,
    });

    if (uncompressedSize > resolvedLimits.maxEntryUncompressedBytes) {
      throw new ZipManifestLimitError(
        'entry-uncompressed-size',
        uncompressedSize,
        resolvedLimits.maxEntryUncompressedBytes,
        `ZIP entry "${path}" declares ${uncompressedSize} uncompressed bytes; the per-entry limit is ${resolvedLimits.maxEntryUncompressedBytes}.`,
        path,
      );
    }

    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > resolvedLimits.maxTotalUncompressedBytes) {
      throw new ZipManifestLimitError(
        'total-uncompressed-size',
        totalUncompressedBytes,
        resolvedLimits.maxTotalUncompressedBytes,
        `ZIP archive declares ${totalUncompressedBytes} uncompressed bytes; the aggregate limit is ${resolvedLimits.maxTotalUncompressedBytes}.`,
        path,
      );
    }

    if (type === 'directory') {
      directoryCount += 1;
    } else {
      fileCount += 1;
    }

    entries.push({
      path,
      type,
      size: uncompressedSize,
      compressedSize,
      compressionMethod,
    });
    offset = entryEnd;
  }

  if (offset !== centralDirectoryEnd) {
    throw new InvalidZipArchiveError(
      'ZIP central directory entry count does not match its declared size.',
    );
  }

  assertLocalEntryRangesCoverArchiveData(
    localEntryRanges,
    endRecord.centralDirectoryOffset,
  );
  assertNoFileDescendantConflicts(entries);

  return {
    entries,
    entryCount: entries.length,
    fileCount,
    directoryCount,
    totalUncompressedBytes,
  };
}

interface LocalEntryRange {
  start: number;
  end: number;
  path: string;
}

function assertLocalEntryRangesCoverArchiveData(
  ranges: readonly LocalEntryRange[],
  centralDirectoryOffset: number,
): void {
  const sortedRanges = [...ranges].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  let expectedStart = 0;

  for (const range of sortedRanges) {
    if (range.start < expectedStart) {
      throw new InvalidZipArchiveError(
        `ZIP local entry ranges overlap at "${range.path}".`,
      );
    }
    if (range.start > expectedStart) {
      throw new InvalidZipArchiveError(
        'ZIP contains data before the central directory that is not described by a central-directory entry.',
      );
    }
    expectedStart = range.end;
  }

  if (expectedStart !== centralDirectoryOffset) {
    throw new InvalidZipArchiveError(
      'ZIP contains data before the central directory that is not described by a central-directory entry.',
    );
  }
}

function assertNoFileDescendantConflicts(
  entries: readonly ZipManifestEntry[],
): void {
  const sortedEntries = entries
    .map((entry) => ({ entry, portableKey: portablePathKey(entry.path) }))
    .sort((left, right) =>
      left.portableKey < right.portableKey
        ? -1
        : left.portableKey > right.portableKey
          ? 1
          : 0,
    );

  for (const { entry, portableKey } of sortedEntries) {
    if (entry.type !== 'file') {
      continue;
    }

    const descendantPrefix = `${portableKey}/`;
    let low = 0;
    let high = sortedEntries.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (sortedEntries[middle].portableKey < descendantPrefix) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    const descendant = sortedEntries[low];
    if (descendant?.portableKey.startsWith(descendantPrefix)) {
      throw new UnsafeZipEntryError(
        'path-conflict',
        entry.path,
        `ZIP file entry "${entry.path}" conflicts with descendant entry "${descendant.entry.path}".`,
      );
    }
  }
}

function resolveLimits(limits: ZipManifestLimits): ResolvedZipManifestLimits {
  return {
    maxEntries: validateLimit(
      'maxEntries',
      limits.maxEntries ?? DEFAULT_ZIP_MANIFEST_LIMITS.maxEntries,
    ),
    maxEntryUncompressedBytes: validateLimit(
      'maxEntryUncompressedBytes',
      limits.maxEntryUncompressedBytes ??
        DEFAULT_ZIP_MANIFEST_LIMITS.maxEntryUncompressedBytes,
    ),
    maxTotalUncompressedBytes: validateLimit(
      'maxTotalUncompressedBytes',
      limits.maxTotalUncompressedBytes ??
        DEFAULT_ZIP_MANIFEST_LIMITS.maxTotalUncompressedBytes,
    ),
    maxPathBytes: validateLimit(
      'maxPathBytes',
      limits.maxPathBytes ?? DEFAULT_ZIP_MANIFEST_LIMITS.maxPathBytes,
    ),
  };
}

function validateLimit(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

interface EndRecordValidationBudget {
  maxEntries: number;
  remainingEntryChecks: number;
}

function findEndOfCentralDirectory(
  view: DataView,
  maxEntries: number,
): EndOfCentralDirectory {
  if (view.byteLength < END_OF_CENTRAL_DIRECTORY_SIZE) {
    throw new InvalidZipArchiveError(
      'Data is too small to contain a ZIP end-of-central-directory record.',
    );
  }

  const earliestOffset = Math.max(
    0,
    view.byteLength - END_OF_CENTRAL_DIRECTORY_SIZE - MAX_ZIP_COMMENT_BYTES,
  );
  const validationBudget: EndRecordValidationBudget = {
    maxEntries,
    remainingEntryChecks: Math.min(maxEntries, 0xfffe) + 1,
  };
  let endRecord: EndOfCentralDirectory | undefined;

  for (
    let offset = view.byteLength - END_OF_CENTRAL_DIRECTORY_SIZE;
    offset >= earliestOffset;
    offset -= 1
  ) {
    if (view.getUint32(offset, true) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      continue;
    }

    const commentLength = view.getUint16(offset + 20, true);
    if (
      offset + END_OF_CENTRAL_DIRECTORY_SIZE + commentLength !==
      view.byteLength
    ) {
      continue;
    }

    const candidate = {
      offset,
      diskNumber: view.getUint16(offset + 4, true),
      centralDirectoryDisk: view.getUint16(offset + 6, true),
      entriesOnDisk: view.getUint16(offset + 8, true),
      totalEntries: view.getUint16(offset + 10, true),
      centralDirectorySize: view.getUint32(offset + 12, true),
      centralDirectoryOffset: view.getUint32(offset + 16, true),
    };
    if (isStructurallyPlausibleEndRecord(view, candidate, validationBudget)) {
      if (endRecord) {
        throw new InvalidZipArchiveError(
          'ZIP archive contains multiple structurally valid end-of-central-directory records.',
        );
      }
      endRecord = candidate;
    }
  }

  if (endRecord) {
    return endRecord;
  }

  throw new InvalidZipArchiveError(
    'ZIP end-of-central-directory record is missing or truncated.',
  );
}

function isStructurallyPlausibleEndRecord(
  view: DataView,
  endRecord: EndOfCentralDirectory,
  budget: EndRecordValidationBudget,
): boolean {
  if (hasStructurallyValidZip64Chain(view, endRecord)) {
    return true;
  }

  if (
    endRecord.centralDirectoryOffset === 0xffffffff ||
    endRecord.centralDirectorySize === 0xffffffff
  ) {
    return false;
  }

  const centralDirectoryEnd =
    endRecord.centralDirectoryOffset + endRecord.centralDirectorySize;
  if (
    endRecord.centralDirectoryOffset > endRecord.offset ||
    centralDirectoryEnd !== endRecord.offset
  ) {
    return false;
  }

  if (endRecord.entriesOnDisk === 0xffff || endRecord.totalEntries === 0xffff) {
    return false;
  }

  if (endRecord.totalEntries > budget.maxEntries) {
    return (
      endRecord.centralDirectorySize >=
        endRecord.totalEntries * CENTRAL_DIRECTORY_ENTRY_SIZE &&
      endRecord.centralDirectoryOffset <=
        endRecord.offset - CENTRAL_DIRECTORY_ENTRY_SIZE &&
      view.getUint32(endRecord.centralDirectoryOffset, true) ===
        CENTRAL_DIRECTORY_SIGNATURE
    );
  }

  let offset = endRecord.centralDirectoryOffset;
  for (let index = 0; index < endRecord.totalEntries; index += 1) {
    if (budget.remainingEntryChecks === 0) {
      throw new InvalidZipArchiveError(
        'ZIP end-record candidate validation exceeded the configured entry-check budget.',
      );
    }
    budget.remainingEntryChecks -= 1;

    if (
      offset > endRecord.offset - CENTRAL_DIRECTORY_ENTRY_SIZE ||
      view.getUint32(offset, true) !== CENTRAL_DIRECTORY_SIGNATURE
    ) {
      return false;
    }

    const fileNameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const entryLength =
      CENTRAL_DIRECTORY_ENTRY_SIZE +
      fileNameLength +
      extraFieldLength +
      commentLength;
    if (entryLength > endRecord.offset - offset) {
      return false;
    }
    offset += entryLength;
  }

  return offset === endRecord.offset;
}

function hasStructurallyValidZip64Chain(
  view: DataView,
  endRecord: EndOfCentralDirectory,
): boolean {
  const locatorOffset = endRecord.offset - 20;
  if (
    locatorOffset < 0 ||
    view.getUint32(locatorOffset, true) !==
      ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE
  ) {
    return false;
  }

  const zip64Offset = readSafeUint64(view, locatorOffset + 8);
  if (
    zip64Offset === undefined ||
    zip64Offset > locatorOffset - 56 ||
    view.getUint32(zip64Offset, true) !==
      ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE
  ) {
    return false;
  }

  const recordSize = readSafeUint64(view, zip64Offset + 4);
  return (
    recordSize !== undefined &&
    recordSize >= 44 &&
    zip64Offset + 12 + recordSize === locatorOffset
  );
}

function readSafeUint64(view: DataView, offset: number): number | undefined {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  const value = high * 0x1_0000_0000 + low;
  return Number.isSafeInteger(value) ? value : undefined;
}

function assertClassicZip(
  endRecord: EndOfCentralDirectory,
  view: DataView,
): void {
  const hasZip64Locator = hasStructurallyValidZip64Chain(view, endRecord);

  if (
    endRecord.entriesOnDisk === 0xffff ||
    endRecord.totalEntries === 0xffff ||
    endRecord.centralDirectorySize === 0xffffffff ||
    endRecord.centralDirectoryOffset === 0xffffffff ||
    hasZip64Locator
  ) {
    throw zip64Error();
  }

  if (
    endRecord.diskNumber !== 0 ||
    endRecord.centralDirectoryDisk !== 0 ||
    endRecord.entriesOnDisk !== endRecord.totalEntries
  ) {
    throw multiDiskError();
  }
}

function validateLocalHeader(
  data: Uint8Array,
  view: DataView,
  entry: {
    centralDirectoryOffset: number;
    centralCrc32: number;
    centralFlags: number;
    centralNameStart: number;
    centralNameEnd: number;
    compressedSize: number;
    compressionMethod: number;
    localHeaderOffset: number;
    rawPath: string;
    uncompressedSize: number;
  },
): number {
  assertRange(
    entry.localHeaderOffset,
    LOCAL_FILE_HEADER_SIZE,
    entry.centralDirectoryOffset,
    'ZIP local file header is missing or truncated.',
  );

  if (
    view.getUint32(entry.localHeaderOffset, true) !==
    LOCAL_FILE_HEADER_SIGNATURE
  ) {
    throw new InvalidZipArchiveError(
      'ZIP central directory points to an invalid local file header.',
    );
  }

  const localFlags = view.getUint16(entry.localHeaderOffset + 6, true);
  const localCompressionMethod = view.getUint16(
    entry.localHeaderOffset + 8,
    true,
  );
  const localCrc32 = view.getUint32(entry.localHeaderOffset + 14, true);
  const localCompressedSize = view.getUint32(
    entry.localHeaderOffset + 18,
    true,
  );
  const localUncompressedSize = view.getUint32(
    entry.localHeaderOffset + 22,
    true,
  );
  const localNameLength = view.getUint16(entry.localHeaderOffset + 26, true);
  const localExtraLength = view.getUint16(entry.localHeaderOffset + 28, true);

  if (
    localCompressedSize === 0xffffffff ||
    localUncompressedSize === 0xffffffff
  ) {
    throw zip64Error();
  }
  assertNotEncrypted(localFlags);

  if (
    localFlags !== entry.centralFlags ||
    localCompressionMethod !== entry.compressionMethod
  ) {
    throw new InvalidZipArchiveError(
      'ZIP local file header does not match its central-directory entry.',
    );
  }

  if ((localFlags & DATA_DESCRIPTOR_FLAG) !== 0) {
    throw new UnsupportedZipFeatureError(
      'ambiguous-metadata',
      `ZIP entry "${entry.rawPath}" uses a data descriptor whose payload boundary cannot be verified without decompression or extractor-specific scanning.`,
      entry.rawPath,
    );
  }

  const localNameStart = entry.localHeaderOffset + LOCAL_FILE_HEADER_SIZE;
  const localNameEnd = localNameStart + localNameLength;
  const localExtraEnd = localNameEnd + localExtraLength;
  assertRange(
    entry.localHeaderOffset,
    localExtraEnd - entry.localHeaderOffset,
    entry.centralDirectoryOffset,
    'ZIP local file header metadata is truncated.',
  );

  const centralNameLength = entry.centralNameEnd - entry.centralNameStart;
  if (
    localNameLength !== centralNameLength ||
    !equalBytes(
      data.subarray(localNameStart, localNameEnd),
      data.subarray(entry.centralNameStart, entry.centralNameEnd),
    )
  ) {
    throw new InvalidZipArchiveError(
      'ZIP local and central-directory entry paths do not match.',
    );
  }

  assertExtraFields(data, localNameEnd, localExtraEnd, 'local file header');

  if (
    localCrc32 !== entry.centralCrc32 ||
    localCompressedSize !== entry.compressedSize ||
    localUncompressedSize !== entry.uncompressedSize
  ) {
    throw new InvalidZipArchiveError(
      'ZIP local file sizes do not match the central-directory entry.',
    );
  }

  if (entry.compressedSize > entry.centralDirectoryOffset - localExtraEnd) {
    throw new InvalidZipArchiveError(
      'ZIP entry body is truncated or overlaps the central directory.',
    );
  }

  return localExtraEnd + entry.compressedSize;
}

function assertExtraFields(
  data: Uint8Array,
  start: number,
  end: number,
  location: string,
): void {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = start;

  while (offset < end) {
    if (end - offset < 4) {
      throw new InvalidZipArchiveError(
        `ZIP ${location} contains a truncated extra field.`,
      );
    }

    const headerId = view.getUint16(offset, true);
    const dataSize = view.getUint16(offset + 2, true);
    const nextOffset = offset + 4 + dataSize;
    if (nextOffset > end) {
      throw new InvalidZipArchiveError(
        `ZIP ${location} contains a truncated extra field.`,
      );
    }
    if (headerId === ZIP64_EXTRA_FIELD_ID) {
      throw zip64Error();
    }
    if (
      headerId === STRONG_ENCRYPTION_EXTRA_FIELD_ID ||
      headerId === WINZIP_AES_EXTRA_FIELD_ID
    ) {
      throw encryptionError();
    }
    if (
      headerId === PKWARE_EXTENDED_LANGUAGE_ENCODING_EXTRA_FIELD_ID ||
      headerId === XCEED_UNICODE_PATH_EXTRA_FIELD_ID ||
      headerId === UNICODE_PATH_EXTRA_FIELD_ID
    ) {
      throw new UnsupportedZipFeatureError(
        'ambiguous-metadata',
        'ZIP alternate path-encoding extra fields are not supported because entry names must have one unambiguous representation.',
      );
    }
    if (
      headerId === PKWARE_UNIX_EXTRA_FIELD_ID ||
      headerId === ASI_UNIX_EXTRA_FIELD_ID ||
      headerId === LIBARCHIVE_EXTRA_FIELD_ID
    ) {
      throw new UnsupportedZipFeatureError(
        'ambiguous-metadata',
        'ZIP Unix link and file-type extra fields are not supported because entry type must have one unambiguous representation.',
      );
    }
    offset = nextOffset;
  }
}

function assertNotEncrypted(flags: number): void {
  if (
    (flags &
      (ENCRYPTED_FLAG | STRONG_ENCRYPTION_FLAG | MASKED_LOCAL_HEADER_FLAG)) !==
    0
  ) {
    throw encryptionError();
  }
}

function assertNotAesCompression(compressionMethod: number): void {
  if (compressionMethod === WINZIP_AES_COMPRESSION_METHOD) {
    throw encryptionError();
  }
}

function decodeEntryPath(bytes: Uint8Array): string {
  let path: string;
  try {
    path = utf8Decoder.decode(bytes);
  } catch {
    throw new InvalidZipArchiveError(
      'ZIP entry path is not valid UTF-8. Legacy non-UTF-8 names are not supported.',
    );
  }
  if (path.startsWith('\ufeff')) {
    throw new UnsupportedZipFeatureError(
      'ambiguous-metadata',
      'ZIP entry path starts with a UTF-8 BOM, which filename decoders interpret inconsistently.',
      path,
    );
  }
  return path;
}

function normalizeEntryPath(rawPath: string): string {
  if (rawPath.length === 0) {
    throw new UnsafeZipEntryError(
      'empty-path',
      rawPath,
      'ZIP entry path is empty.',
    );
  }
  if (rawPath.includes('\0')) {
    throw new UnsafeZipEntryError(
      'nul-byte',
      rawPath,
      'ZIP entry path contains a NUL byte.',
    );
  }

  const unifiedPath = rawPath.replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(unifiedPath)) {
    throw new UnsafeZipEntryError(
      'drive-qualified-path',
      rawPath,
      `ZIP entry "${rawPath}" uses a drive-qualified path.`,
    );
  }
  if (unifiedPath.includes(':')) {
    throw new UnsafeZipEntryError(
      'alternate-data-stream',
      rawPath,
      `ZIP entry "${rawPath}" contains a colon that can select an NTFS alternate data stream.`,
    );
  }
  if (unifiedPath.startsWith('/')) {
    throw new UnsafeZipEntryError(
      'absolute-path',
      rawPath,
      `ZIP entry "${rawPath}" uses an absolute path.`,
    );
  }

  const segments = unifiedPath.split('/');
  if (segments.includes('..')) {
    throw new UnsafeZipEntryError(
      'path-traversal',
      rawPath,
      `ZIP entry "${rawPath}" contains a parent-directory traversal segment.`,
    );
  }

  for (const segment of segments) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (/[. ]$/u.test(segment)) {
      throw new UnsafeZipEntryError(
        'windows-reserved-path',
        rawPath,
        `ZIP entry "${rawPath}" contains a path segment ending in a dot or space, which is not portable to Windows.`,
      );
    }

    const basename = segment.split('.', 1)[0].replace(/[. ]+$/u, '');
    if (WINDOWS_RESERVED_DEVICE_BASENAME.test(basename)) {
      throw new UnsafeZipEntryError(
        'windows-reserved-path',
        rawPath,
        `ZIP entry "${rawPath}" contains the Windows-reserved device name "${segment}".`,
      );
    }
  }

  const normalizedPath = segments
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
  if (normalizedPath.length === 0) {
    throw new UnsafeZipEntryError(
      'empty-path',
      rawPath,
      `ZIP entry "${rawPath}" normalizes to an empty path.`,
    );
  }
  return normalizedPath;
}

function portablePathKey(path: string): string {
  return path.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC');
}

function assertRange(
  offset: number,
  length: number,
  boundary: number,
  message: string,
): void {
  if (
    offset < 0 ||
    length < 0 ||
    offset > boundary ||
    length > boundary - offset
  ) {
    throw new InvalidZipArchiveError(message);
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function zip64Error(): UnsupportedZipFeatureError {
  return new UnsupportedZipFeatureError(
    'zip64',
    'ZIP64 archives are not supported; use a classic ZIP archive within the configured limits.',
  );
}

function multiDiskError(): UnsupportedZipFeatureError {
  return new UnsupportedZipFeatureError(
    'multi-disk',
    'Multi-disk ZIP archives are not supported.',
  );
}

function encryptionError(): UnsupportedZipFeatureError {
  return new UnsupportedZipFeatureError(
    'encryption',
    'Encrypted ZIP entries are not supported because their metadata cannot be safely inspected without decryption.',
  );
}
