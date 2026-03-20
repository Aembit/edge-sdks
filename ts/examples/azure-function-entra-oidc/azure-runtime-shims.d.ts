declare module "@azure/functions" {
  export interface HttpRequest {
    method?: string
  }

  export interface HttpResponseInit {
    status: number
    headers?: Record<string, string>
    jsonBody?: unknown
  }

  export interface InvocationContext {
    log(...args: unknown[]): void
    error(...args: unknown[]): void
  }

  export const app: {
    http(
      name: string,
      options: {
        methods: string[]
        authLevel: "anonymous" | "function" | "admin"
        handler: (
          request: HttpRequest,
          context: InvocationContext
        ) => Promise<HttpResponseInit> | HttpResponseInit
      }
    ): void
  }
}

declare module "@azure/identity" {
  export class ManagedIdentityCredential {
    constructor(clientId?: string)
    getToken(scope: string | string[]): Promise<{ token: string } | null>
  }
}
