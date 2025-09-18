/**
 * SMRT Content Service Application
 *
 * Demonstrates auto-generated functionality from @smrt() decorated Content classes
 */

import './app.css';
import App from './App.svelte';
import { mount } from 'svelte';

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;