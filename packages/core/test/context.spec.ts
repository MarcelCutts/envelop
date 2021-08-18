import { createSpiedPlugin, createTestkit } from '@envelop/testing';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { ExecutionResult } from 'graphql';
import { schema, query } from './common';

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('contextFactory', () => {
  it('Should call before parse and after parse correctly', async () => {
    const spiedPlugin = createSpiedPlugin();
    const teskit = createTestkit([spiedPlugin.plugin], schema);
    await teskit.execute(query);
    expect(spiedPlugin.spies.beforeContextBuilding).toHaveBeenCalledTimes(1);
    expect(spiedPlugin.spies.beforeContextBuilding).toHaveBeenCalledWith({
      context: expect.any(Object),
      extendContext: expect.any(Function),
    });

    expect(spiedPlugin.spies.afterContextBuilding).toHaveBeenCalledTimes(1);
    expect(spiedPlugin.spies.afterContextBuilding).toHaveBeenCalledWith({
      context: expect.any(Object),
      extendContext: expect.any(Function),
    });
  });

  it('Should set initial `createProxy` arguments as initial context', async () => {
    const spiedPlugin = createSpiedPlugin();
    const teskit = createTestkit([spiedPlugin.plugin], schema);
    await teskit.execute(query, {}, { test: true });
    expect(spiedPlugin.spies.beforeContextBuilding).toHaveBeenCalledTimes(1);
    expect(spiedPlugin.spies.beforeContextBuilding).toHaveBeenCalledWith({
      context: expect.objectContaining({
        test: true,
      }),
      extendContext: expect.any(Function),
    });
  });

  it('Should allow to extend context', async () => {
    const afterContextSpy = jest.fn();
    const onExecuteSpy = jest.fn();

    const teskit = createTestkit(
      [
        {
          onContextBuilding({ extendContext }) {
            extendContext({
              test: true,
            });

            return afterContextSpy;
          },
          onExecute: onExecuteSpy,
        },
      ],
      schema
    );

    await teskit.execute(query, {}, {});
    expect(afterContextSpy).toHaveBeenCalledWith({
      context: expect.objectContaining({
        test: true,
      }),
      extendContext: expect.any(Function),
    });

    expect(onExecuteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.objectContaining({
          contextValue: expect.objectContaining({
            test: true,
          }),
        }),
      })
    );
  });

  it('Should allow to provide async function for context extension', async () => {
    const afterContextSpy = jest.fn();
    const onExecuteSpy = jest.fn();
    const teskit = createTestkit(
      [
        {
          onContextBuilding: async ({ extendContext }) => {
            await new Promise(resolve => setTimeout(resolve, 1000));

            extendContext({
              test: true,
            });

            return afterContextSpy;
          },
          onExecute: onExecuteSpy,
        },
      ],
      schema
    );
    await teskit.execute(query, {}, {});
    expect(afterContextSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          test: true,
        }),
      })
    );
    expect(onExecuteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.objectContaining({
          contextValue: expect.objectContaining({
            test: true,
          }),
        }),
      })
    );
  });

  test('plugins should await for each other when building context', async () => {
    const afterContextSpy = jest.fn();
    const testSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          authenticated: Boolean!
        }
      `,
      resolvers: {
        Query: {
          authenticated(_, __, context) {
            return context.authenticated;
          },
        },
      },
    });
    const teskit = createTestkit(
      [
        {
          async onContextBuilding({ extendContext }) {
            await sleep(200);
            extendContext({
              authenticated: true,
            });
          },
        },
        {
          onContextBuilding() {
            return ({ context }) => {
              afterContextSpy(context.authenticated);
            };
          },
        },
      ],
      testSchema
    );

    const result = (await teskit.execute(
      /* GraphQL */ `
        {
          authenticated
        }
      `,
      {},
      {}
    )) as ExecutionResult;

    expect(result.errors).not.toBeDefined();
    expect(result.data?.authenticated).toBe(true);
    expect(afterContextSpy).toHaveBeenCalledWith(true);
  });
});
