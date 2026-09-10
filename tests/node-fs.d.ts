/**
 * Just the Node file APIs the tests use.
 *
 * The project has no @types/node, and adding a dependency needs sign-off
 * (CLAUDE.md), so these two signatures are declared by hand. Delete this file
 * if @types/node is ever added.
 */
declare module 'node:fs' {
  export function existsSync(path: URL | string): boolean;
  export function readFileSync(path: URL | string): Uint8Array;
}
