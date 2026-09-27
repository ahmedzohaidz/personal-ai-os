declare module 'node:fs/promises' {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>;
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
  export function rename(oldPath: string, newPath: string): Promise<void>;
  export function writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
}
declare module 'node:path' {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
}
declare namespace NodeJS {
  interface ErrnoException extends Error { code?: string }
}
