import express from 'express';
import request from 'supertest';
import { ApiGateway, ApiGatewayOptions } from '../src';
import {
  compilerApi,
  DataSourceStorageMock,
  AdapterApiMock
} from './mocks';

const API_SECRET = 'secret';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M';
const logger = () => undefined;
function createApiGateway(
  options: Partial<ApiGatewayOptions> = {}
) {
  process.env.NODE_ENV = 'production';

  const app = express();
  const adapterApi: any = new AdapterApiMock();
  const dataSourceStorage: any = new DataSourceStorageMock();
  const apiGateway = new ApiGateway(API_SECRET, compilerApi, () => adapterApi, logger, {
    standalone: true,
    dataSourceStorage,
    basePath: '/cubejs-api',
    refreshScheduler: {},
    ...options,
  });
  apiGateway.initApp(app);
  return {
    app,
    apiGateway,
    dataSourceStorage,
    adapterApi
  };
}

describe('Gateway Api Scopes', () => {
  test('CUBEJS_DEFAULT_API_SCOPES', async () => {
    process.env.CUBEJS_DEFAULT_API_SCOPES = '';

    let res: request.Response;
    const { app, apiGateway } = createApiGateway();

    res = await request(app)
      .get('/cubejs-api/graphql')
      .set('Authorization', AUTH_TOKEN)
      .expect(403);
    expect(res.body && res.body.error)
      .toStrictEqual('API scope is missing: graphql');

    res = await request(app)
      .get('/cubejs-api/v1/meta')
      .set('Authorization', AUTH_TOKEN)
      .expect(403);
    expect(res.body && res.body.error)
      .toStrictEqual('API scope is missing: meta');

    res = await request(app)
      .get('/cubejs-api/v1/load')
      .set('Authorization', AUTH_TOKEN)
      .expect(403);
    expect(res.body && res.body.error)
      .toStrictEqual('API scope is missing: data');

    res = await request(app)
      .post('/cubejs-api/v1/pre-aggregations/jobs')
      .set('Authorization', AUTH_TOKEN)
      .expect(403);
    expect(res.body && res.body.error)
      .toStrictEqual('API scope is missing: jobs');

    delete process.env.CUBEJS_DEFAULT_API_SCOPES;
    apiGateway.release();
  });

  test('/readyz and /livez accessible', async () => {
    const { app, apiGateway } = createApiGateway({
      contextToApiScopes: async () => ['graphql', 'meta', 'data', 'jobs'],
    });

    await request(app)
      .get('/readyz')
      .set('Authorization', AUTH_TOKEN)
      .expect(200);

    await request(app)
      .get('/livez')
      .set('Authorization', AUTH_TOKEN)
      .expect(200);

    apiGateway.release();
  });

  test('GET /v1/meta/namesModel should return model names', async () => {
    const { app, apiGateway } = createApiGateway({
      contextToApiScopes: async () => ['graphql', 'meta', 'data', 'jobs'],
    });

    const response = await request(app)
      .get('/cubejs-api/v1/meta/namesModel')
      .set('Authorization', AUTH_TOKEN)
      .expect(200);

    expect(response.body).toEqual({ cubes: [{ name: 'Foo' }] });

    apiGateway.release();
  });

  test('GET /v1/meta/:nameModel should return model data', async () => {
    const { app, apiGateway } = createApiGateway({
      contextToApiScopes: async () => ['graphql', 'meta', 'data', 'jobs'],
    });

    const response = await request(app)
      .get('/cubejs-api/v1/meta/Foo')
      .set('Authorization', AUTH_TOKEN)
      .expect(200);

    expect(response.body).toEqual(
      {
        cubes: [
          {
            name: 'Foo',
            description: 'cube from compilerApi mock',
            measures: [
              {
                name: 'Foo.bar',
                description: 'measure from compilerApi mock',
                isVisible: true,
              },
            ],
            dimensions: [
              {
                name: 'Foo.id',
                description: 'id dimension from compilerApi mock',
                isVisible: true,
              },
              {
                name: 'Foo.time',
                isVisible: true,
              },
            ],
            segments: [
              {
                name: 'Foo.quux',
                description: 'segment from compilerApi mock',
                isVisible: true,
              },
            ],
            sql: '\'SELECT * FROM Foo\'',
          }
        ]
      }
    );

    apiGateway.release();
  });

  test('GET /v1/meta/:nameModel should return error if model not found', async () => {
    const { app, apiGateway } = createApiGateway({
      contextToApiScopes: async () => ['graphql', 'meta', 'data', 'jobs'],
    });

    const response = await request(app)
      .get('/cubejs-api/v1/meta/UnknownModel')
      .set('Authorization', AUTH_TOKEN)
      .expect(200);

    expect(response.body).toEqual({ error: 'Model UnknownModel not found' });

    apiGateway.release();
  });

  test('GET /v1/meta/:nameModel/:field should return specific field', async () => {
    const { app, apiGateway } = createApiGateway({
      contextToApiScopes: async () => ['graphql', 'meta', 'data', 'jobs'],
    });

    const response = await request(app)
      .get('/cubejs-api/v1/meta/Foo/name')
      .set('Authorization', AUTH_TOKEN)
      .expect(200);

    expect(response.body).toEqual({ value: 'Foo' });

    apiGateway.release();
  });

  test('GET /v1/meta/:nameModel/:field should return error if field not found', async () => {
    const { app, apiGateway } = createApiGateway({
      contextToApiScopes: async () => ['graphql', 'meta', 'data', 'jobs'],
    });

    const response = await request(app)
      .get('/cubejs-api/v1/meta/Foo/unknownField')
      .set('Authorization', AUTH_TOKEN)
      .expect(200);

    expect(response.body).toEqual({ error: 'Field unknownField not found in model Foo' });

    apiGateway.release();
  });

  test('GraphQL declined', async () => {
    const { app, apiGateway } = createApiGateway({
      contextToApiScopes: async () => ['meta', 'data', 'jobs'],
    });

    const res = await request(app)
      .get('/cubejs-api/graphql')
      .set('Authorization', AUTH_TOKEN)
      .expect(403);

    expect(res.body && res.body.error)
      .toStrictEqual('API scope is missing: graphql');

    apiGateway.release();
  });

  test('Meta declined', async () => {
    const { app, apiGateway } = createApiGateway({
      contextToApiScopes: async () => ['graphql', 'data', 'jobs'],
    });

    const res1 = await request(app)
      .get('/cubejs-api/v1/meta')
      .set('Authorization', AUTH_TOKEN)
      .expect(403);

    expect(res1.body && res1.body.error)
      .toStrictEqual('API scope is missing: meta');

    const res2 = await request(app)
      .post('/cubejs-api/v1/pre-aggregations/can-use')
      .set('Authorization', AUTH_TOKEN)
      .expect(403);

    expect(res2.body && res2.body.error)
      .toStrictEqual('API scope is missing: meta');

    apiGateway.release();
  });

  test('catch error from contextToApiScopes (server should crash)', async () => {
    const { app, apiGateway } = createApiGateway({
      contextToApiScopes: async () => {
        throw new Error('Random error');
      },
    });

    await request(app)
      .get('/cubejs-api/v1/meta')
      .set('Authorization', AUTH_TOKEN)
      .expect(500);

    apiGateway.release();
  });

  test('Data declined', async () => {
    const { app, apiGateway } = createApiGateway({
      contextToApiScopes: async () => ['graphql', 'meta', 'jobs'],
    });

    const res1 = await request(app)
      .get('/cubejs-api/v1/load')
      .set('Authorization', AUTH_TOKEN)
      .expect(403);

    expect(res1.body && res1.body.error)
      .toStrictEqual('API scope is missing: data');

    const res2 = await request(app)
      .post('/cubejs-api/v1/load')
      .set('Authorization', AUTH_TOKEN)
      .expect(403);

    expect(res2.body && res2.body.error)
      .toStrictEqual('API scope is missing: data');

    const res3 = await request(app)
      .get('/cubejs-api/v1/subscribe')
      .set('Authorization', AUTH_TOKEN)
      .expect(403);

    expect(res3.body && res3.body.error)
      .toStrictEqual('API scope is missing: data');

    const res4 = await request(app)
      .get('/cubejs-api/v1/sql')
      .set('Authorization', AUTH_TOKEN)
      .expect(403);

    expect(res4.body && res4.body.error)
      .toStrictEqual('API scope is missing: data');

    const res5 = await request(app)
      .post('/cubejs-api/v1/sql')
      .set('Content-type', 'application/json')
      .set('Authorization', AUTH_TOKEN)
      .expect(403);

    expect(res5.body && res5.body.error)
      .toStrictEqual('API scope is missing: data');

    const res6 = await request(app)
      .get('/cubejs-api/v1/dry-run')
      .set('Authorization', AUTH_TOKEN)
      .expect(403);

    expect(res6.body && res6.body.error)
      .toStrictEqual('API scope is missing: data');

    const res7 = await request(app)
      .post('/cubejs-api/v1/dry-run')
      .set('Content-type', 'application/json')
      .set('Authorization', AUTH_TOKEN)
      .expect(403);

    expect(res7.body && res7.body.error)
      .toStrictEqual('API scope is missing: data');

    apiGateway.release();
  });

  test('Jobs declined', async () => {
    const { app, apiGateway } = createApiGateway({
      contextToApiScopes: async () => ['graphql', 'data', 'meta'],
    });

    const res1 = await request(app)
      .post('/cubejs-api/v1/pre-aggregations/jobs')
      .set('Authorization', AUTH_TOKEN)
      .expect(403);

    expect(res1.body && res1.body.error)
      .toStrictEqual('API scope is missing: jobs');

    apiGateway.release();
  });
});
