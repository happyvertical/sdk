/**
 * SMRT Template Standalone Application
 * 
 * Complete standalone application demonstrating triple-purpose architecture:
 * 1. Full standalone app (this file)
 * 2. NPM library components (src/lib/)  
 * 3. Module federation provider (federation config)
 */

import './app.css';
import App from './App.svelte';

const app = new App({
  target: document.getElementById('app')!,
});

export default app;