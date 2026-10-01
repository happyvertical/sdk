/**
 * Registry for opt-in transcriber adapters that live behind subpath exports
 * (e.g. `@happyvertical/speech/local`).
 *
 * The core entry never imports those adapters, so their heavy optional peer
 * dependencies are never resolved by bundlers or loaded at runtime unless the
 * caller imports the subpath, which registers its factory here.
 */

import type { SpeechFactoryContext } from './factory.js';
import type {
  GetTranscriberOptions,
  Transcriber,
  TranscriberType,
} from './types.js';

export type OptionalTranscriberFactory = (
  options: GetTranscriberOptions,
  context: SpeechFactoryContext,
) => Transcriber | Promise<Transcriber>;

/** Adapter types that are only available after importing a subpath. */
const OPTIONAL_TRANSCRIBER_ENTRIES: Partial<Record<TranscriberType, string>> = {
  local: '@happyvertical/speech/local',
};

const registered = new Map<TranscriberType, OptionalTranscriberFactory>();

export function registerOptionalTranscriber(
  type: TranscriberType,
  factory: OptionalTranscriberFactory,
): void {
  registered.set(type, factory);
}

export function getOptionalTranscriberFactory(
  type: string,
): OptionalTranscriberFactory | undefined {
  return registered.get(type as TranscriberType);
}

/** Subpath that registers `type`, when it is an opt-in adapter. */
export function optionalTranscriberEntry(type: string): string | undefined {
  return OPTIONAL_TRANSCRIBER_ENTRIES[type as TranscriberType];
}

export function registeredOptionalTranscribers(): TranscriberType[] {
  return [...registered.keys()];
}
