// Global type definitions for Deno runtime in Edge Functions
// This helps with TypeScript intellisense in VS Code

declare global {
  namespace Deno {
    interface Env {
      get(key: string): string | undefined;
    }

    const env: Env;

    function serve(
      handler: (request: Request) => Response | Promise<Response>
    ): void;
  }
}

export {};
