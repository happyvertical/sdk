export type MediaBundleFileRole =
  | 'primary'
  | 'support'
  | 'metadata'
  | 'unknown';

export type MediaSupportFileVisibility =
  | 'visible'
  | 'hidden-retained'
  | 'drop-after-extract';

export type MediaFormatFamily =
  | 'generic-image'
  | 'generic-video'
  | 'insta360'
  | 'unknown';

export type MediaBundleCapability =
  | 'gps-track'
  | 'image-metadata'
  | 'sidecar-binding'
  | 'stitch-export'
  | 'stream-info'
  | (string & {});

export interface MediaFileDescriptor {
  path: string;
  relativePath?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  modifiedAt?: Date | string;
  role?: MediaBundleFileRole;
  metadata?: Record<string, unknown>;
}

export interface NormalizedMediaDevice {
  make?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
}

export interface NormalizedMediaStream {
  kind: 'video' | 'audio' | 'data' | 'unknown';
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  durationMs?: number;
  bitrate?: number;
  metadata?: Record<string, unknown>;
}

export interface NormalizedGpsTrackPoint {
  tSeconds: number;
  recordedAt?: Date | string | null;
  latitude: number;
  longitude: number;
  altitude?: number | null;
  heading?: number | null;
  speedMps?: number | null;
  sourceFilePath?: string;
}

export interface NormalizedMediaMetadata {
  captureTime?: Date | string | null;
  device?: NormalizedMediaDevice;
  width?: number;
  height?: number;
  durationMs?: number;
  mimeType?: string;
  streams?: NormalizedMediaStream[];
  gpsTrack?: NormalizedGpsTrackPoint[];
  raw?: Record<string, unknown>;
  private?: Record<string, unknown>;
}

export interface MediaBundleSupportFile {
  file: MediaFileDescriptor;
  role: MediaBundleFileRole;
  relationship: string;
  visibility: MediaSupportFileVisibility;
  metadata?: NormalizedMediaMetadata;
}

export interface MediaBundleInspection {
  handlerId: string;
  handlerVersion: string;
  formatFamily: MediaFormatFamily;
  primary: MediaFileDescriptor;
  supportFiles: MediaBundleSupportFile[];
  metadata: NormalizedMediaMetadata;
  capabilities: MediaBundleCapability[];
  warnings: string[];
  errors: string[];
  raw?: Record<string, unknown>;
}

export interface MediaBundleInspectTools {
  ffprobePath?: string;
  exiftoolPath?: string;
}

export interface MediaBundleInspectContext {
  tools?: MediaBundleInspectTools;
  probe?: boolean;
  defaultSupportFileVisibility?: MediaSupportFileVisibility;
}

export interface MediaBundleHandler {
  id: string;
  version: string;
  priority: number;
  capabilities?: MediaBundleCapability[];
  supports(
    files: MediaFileDescriptor[],
    context: MediaBundleInspectContext,
  ): boolean | Promise<boolean>;
  inspect(
    files: MediaFileDescriptor[],
    context: MediaBundleInspectContext,
  ): Promise<MediaBundleInspection>;
  validate?(
    inspection: MediaBundleInspection,
    context: MediaBundleInspectContext,
  ): Promise<string[]> | string[];
  deriveArtifacts?(
    inspection: MediaBundleInspection,
    context: MediaBundleInspectContext,
  ): Promise<unknown[]> | unknown[];
}

export interface InspectMediaBundleOptions extends MediaBundleInspectContext {
  handlers?: MediaBundleHandler[];
}
