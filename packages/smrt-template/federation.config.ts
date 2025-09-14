/**
 * Module Federation Configuration
 * 
 * Defines what this SMRT microservice exposes and consumes via module federation.
 * This enables runtime sharing of components between microservices.
 */

import { flattenedExposes } from './src/federation/expose.config.js';
import { consumeConfig } from './src/federation/consume.config.js';
import sharedDependencies from './src/federation/shared.config.js';

export const federationConfig = {
  name: 'productService',
  filename: 'remoteEntry.js',
  
  // What this service exposes (from structured config)
  exposes: flattenedExposes,
  
  // What this service consumes (from structured config)  
  remotes: consumeConfig.remotes,
  
  // Shared dependencies (from structured config)
  shared: sharedDependencies
};

export default federationConfig;