import { it, expect } from 'vitest';
import { fieldsFromClass } from './utils.js';
// Test class with various field types
class TestClass {
  test_string: string = 'test';
  test_number: number = 123;
  test_date: Date = new Date();
  private _privateField: string = 'private';
  methodField() {
    return true;
  }
}

it('should get fields from a class without values', () => {
  const fields = fieldsFromClass(TestClass);
  expect(fields).toEqual({
    test_string: {
      name: 'test_string',
      type: 'TEXT',
    },
    test_number: {
      name: 'test_number',
      type: 'INTEGER',
    },
    test_date: {
      name: 'test_date',
      type: 'DATETIME',
    },
  });

  // Verify private and method fields are excluded
  expect(fields).not.toHaveProperty('_privateField');
  expect(fields).not.toHaveProperty('methodField');
});

it('should get fields from a class with values', () => {
  const values = {
    test_string: 'custom value',
    test_number: 456,
    test_date: '2024-01-01',
    extraField: 'should not appear',
  };

  const fields = fieldsFromClass(TestClass, values);

  expect(fields).toEqual({
    test_string: {
      name: 'test_string',
      type: 'TEXT',
      value: 'custom value',
    },
    test_number: {
      name: 'test_number',
      type: 'INTEGER',
      value: 456,
    },
    test_date: {
      name: 'test_date',
      type: 'DATETIME',
      value: '2024-01-01',
    },
  });

  // Verify extra field from values doesn't appear
  expect(fields).not.toHaveProperty('extraField');
});
