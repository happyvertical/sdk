/**
 * Tests for Document functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Document } from './document.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('Document', () => {
  describe('Construction and Initialization', () => {
    it('should create a document from a local file URL', () => {
      const filePath = '/tmp/test.txt';
      const doc = new Document({
        url: `file://${filePath}`,
        type: 'text/plain'
      });

      expect(doc).toBeInstanceOf(Document);
      expect(doc.url.protocol).toBe('file:');
      expect(doc['localPath']).toBe(filePath);
      expect(doc.type).toBe('text/plain');
    });

    it('should create a document from a remote URL', () => {
      const doc = new Document({
        url: 'https://example.com/document.pdf',
        type: 'application/pdf'
      });

      expect(doc).toBeInstanceOf(Document);
      expect(doc.url.protocol).toBe('https:');
      expect(doc.url.hostname).toBe('example.com');
      expect(doc.type).toBe('application/pdf');
    });

    it('should set up caching directory', () => {
      const doc = new Document({ url: 'https://example.com/test.pdf' });

      expect(doc['cacheDir']).toBeTruthy();
      expect(doc['cacheDir']).toContain('.cache');
    });

    it('should use custom cache directory if provided', () => {
      const customCacheDir = '/tmp/custom-cache';
      const doc = new Document({
        url: 'https://example.com/test.pdf',
        cacheDir: customCacheDir
      });

      expect(doc['cacheDir']).toBe(customCacheDir);
    });
  });

  describe('Static Factory Method', () => {
    it('should create and initialize document via static create method', async () => {
      const doc = await Document.create({
        url: 'file:///tmp/nonexistent.txt',
        type: 'text/plain'
      });

      expect(doc).toBeInstanceOf(Document);
    });
  });

  describe('Text File Detection', () => {
    it('should detect text files by MIME type', () => {
      const textDoc = new Document({
        url: 'file:///tmp/test.txt',
        type: 'text/plain'
      });

      expect(textDoc['isTextFile']()).toBe(true);
    });

    it('should detect JSON files', () => {
      const jsonDoc = new Document({
        url: 'file:///tmp/test.json',
        type: 'application/json'
      });

      expect(jsonDoc['isTextFile']()).toBe(true);
    });

    it('should detect text files by extension', () => {
      const mdDoc = new Document({
        url: 'file:///tmp/README.md'
      });

      expect(mdDoc['isTextFile']()).toBe(true);
    });

    it('should not detect binary files as text', () => {
      const pdfDoc = new Document({
        url: 'file:///tmp/test.pdf',
        type: 'application/pdf'
      });

      expect(pdfDoc['isTextFile']()).toBe(false);
    });

    it('should handle unknown file types', () => {
      const unknownDoc = new Document({
        url: 'file:///tmp/test.unknown',
        type: 'application/unknown'
      });

      expect(unknownDoc['isTextFile']()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unsupported file types in getText', async () => {
      const doc = new Document({
        url: 'file:///tmp/test.unsupported',
        type: 'application/unsupported'
      });

      await expect(doc.getText()).rejects.toThrow('not yet implemented');
    });
  });

  describe('URL Parsing', () => {
    it('should handle various URL formats', () => {
      const httpDoc = new Document({ url: 'http://example.com/file.txt' });
      const httpsDoc = new Document({ url: 'https://example.com/file.txt' });
      const fileDoc = new Document({ url: 'file:///tmp/file.txt' });

      expect(httpDoc.url.protocol).toBe('http:');
      expect(httpsDoc.url.protocol).toBe('https:');
      expect(fileDoc.url.protocol).toBe('file:');
    });

    it('should handle URLs with query parameters', () => {
      const doc = new Document({
        url: 'https://example.com/file.pdf?version=1&download=true'
      });

      expect(doc.url.searchParams.get('version')).toBe('1');
      expect(doc.url.searchParams.get('download')).toBe('true');
    });
  });
});