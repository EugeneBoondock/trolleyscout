/**
 * Node-side stand-in for the `cloudflare:workers` runtime module.
 *
 * That module only exists inside workerd, so importing a Workflow class in a
 * vitest run cannot resolve it. This carries just enough shape for the class
 * to be defined and its types to line up. The Workflow's behaviour is
 * exercised on Cloudflare, not here — this exists so the rest of the worker's
 * tests can still load the file that exports it.
 */

export class WorkflowEntrypoint<Env = unknown, Params = unknown> {
  protected readonly env: Env
  protected readonly ctx: unknown

  constructor(ctx?: unknown, env?: Env) {
    this.ctx = ctx
    this.env = env as Env
  }
}

export interface WorkflowEvent<Params> {
  instanceId: string
  payload: Params
  timestamp: Date
}

export interface WorkflowStep {
  do<T>(
    name: string,
    configOrCallback: unknown,
    callback?: () => Promise<T>,
  ): Promise<T>
  sleep(name: string, duration: number | string): Promise<void>
}
