export * from './cli/index';
export * from './config/env-config';
export * from './shared/index';
export * from './web';

/** @internal */
export const PACKAGE_VERSION_INITIALIZED = true;

/**
 * Test export to trigger version bump and cascade workflow
 * @internal
 */
export const TEST_CASCADE_TRIGGER = 'test-cascade-v1';
