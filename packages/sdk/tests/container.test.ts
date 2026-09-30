import { describe, it, expect } from 'vitest';
import { Container, ContainerError } from '../src/container';

class Service {
  static instances = 0;
  id = ++Service.instances;
}

class Consumer {
  constructor(public readonly service: Service) {}
}

describe('Container', () => {
  describe('bind().to() lifetime', () => {
    it('resolves a new instance on every resolve (transient)', () => {
      const container = new Container();
      container.bind(Service).to(Service);

      const first = container.resolve(Service);
      const second = container.resolve(Service);

      expect(first).toBeInstanceOf(Service);
      expect(second).toBeInstanceOf(Service);
      expect(first).not.toBe(second);
    });

    it('does not cache instances across resolves', () => {
      const container = new Container();
      container.bind(Service).to(Service);

      const ids = [
        container.resolve(Service).id,
        container.resolve(Service).id,
        container.resolve(Service).id,
      ];

      expect(new Set(ids).size).toBe(3);
    });
  });

  describe('bind().toValue() lifetime', () => {
    it('always returns the same instance (singleton)', () => {
      const container = new Container();
      const value = new Service();
      container.bind(Service).toValue(value);

      expect(container.resolve(Service)).toBe(value);
      expect(container.resolve(Service)).toBe(value);
    });
  });

  describe('bind().toFactory() lifetime', () => {
    it('invokes the factory on every resolve (transient)', () => {
      const container = new Container();
      let calls = 0;
      container.bind(Service).toFactory(() => {
        calls += 1;
        return new Service();
      });

      const first = container.resolve(Service);
      const second = container.resolve(Service);

      expect(calls).toBe(2);
      expect(first).not.toBe(second);
    });
  });

  describe('dependency resolution', () => {
    it('injects registered dependencies into constructors', () => {
      const container = new Container();
      container.bind(Service).to(Service);
      container.bind(Consumer).to(Consumer);

      const consumer = container.resolve(Consumer);

      expect(consumer).toBeInstanceOf(Consumer);
      expect(consumer.service).toBeInstanceOf(Service);
    });
  });

  describe('override-for-test', () => {
    it('lets a binding be replaced before resolve', () => {
      const container = new Container();
      const stub = new Service();
      container.bind(Service).to(Service);
      container.bind(Service).toValue(stub);

      expect(container.resolve(Service)).toBe(stub);
    });
  });

  describe('ContainerError', () => {
    it('throws when resolving an unregistered token', () => {
      const container = new Container();

      expect(() => container.resolve(Service)).toThrow(ContainerError);
    });
  });
});
