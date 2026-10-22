import { test } from 'node:test';
import assert from 'node:assert/strict';
import agencyRouter from './agency.routes.js';
import {
  AGENCY_WORKSPACE_GUARD_TAG,
  createAgencyWorkspaceGuard,
} from '../middleware/agencyWorkspace.middleware.js';

type Layer = {
  route?: {
    path: unknown;
    methods: Record<string, boolean>;
    stack: any[];
  };
};

function routeLayers(): Layer[] {
  return (agencyRouter as any).stack.filter((layer: Layer) => layer.route) as Layer[];
}

function pathOf(layer: Layer): string {
  const path = layer.route?.path as unknown;
  return Array.isArray(path) ? String(path[0]) : String(path);
}

function methodsOf(layer: Layer): string[] {
  return Object.keys(layer.route?.methods ?? {}).map((method) => method.toUpperCase());
}

test('A0 agency API exposes only the read-only status probe', () => {
  const routes = routeLayers().map((layer) => `${pathOf(layer)} ${methodsOf(layer).join(',')}`);
  assert.deepEqual(routes, ['/status GET']);
});

test('every agency route carries the feature gate', () => {
  for (const layer of routeLayers()) {
    const handles = (layer.route?.stack ?? []).map((handler: any) => handler?.handle);
    const guarded = handles.some(
      (handle: any) => handle?.[AGENCY_WORKSPACE_GUARD_TAG] === true
    );
    assert.equal(guarded, true, `${methodsOf(layer).join(',')} ${pathOf(layer)} is missing requireAgencyWorkspace`);
  }
});

test('a disabled agency gate answers 404 and never calls next', () => {
  const guard = createAgencyWorkspaceGuard(false);
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;

  guard({} as any, response as any, () => {
    nextCalled = true;
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Not found',
    message: 'Not found',
  });
  assert.equal(nextCalled, false);
});

test('an enabled agency gate continues to the route', () => {
  const guard = createAgencyWorkspaceGuard(true);
  let nextCalled = false;

  guard({} as any, {} as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
