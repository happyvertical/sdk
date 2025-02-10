/*
this should work, but I want to get an initial commit in before refactoring



class Person extends BaseObject {
  name = new BaseText();
  age = new BaseReal();
  created_at = new BaseDate();
}

const person = new Person();
person.name = 'John';  // Works!
person.age = 30;      // Works!
person.created_at = new Date();  // Works!

console.log(`Hello ${person.name}`);  // "Hello John"


*/

export class Field<T> {
  protected _value: T | null = null;

  constructor(value: T | null = null) {
    this._value = value;
    return new Proxy(this, {
      set(target: any, prop: string, value: any) {
        if (prop === '_value') {
          target._value = value;
          return true;
        }
        target[prop] = value;
        return true;
      },
    });
  }

  get value(): T | null {
    return this._value;
  }

  toString() {
    return this._value?.toString() ?? '';
  }
}

export class TextField extends Field<string> {
  static readonly type = 'TEXT';
}

export class DecimalField extends Field<number> {
  static readonly type = 'REAL';
}

export class DateField extends Field<Date> {
  static readonly type = 'TEXT';
}
