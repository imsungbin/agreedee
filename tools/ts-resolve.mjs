/**
 * ts-resolve.mjs — let Node run the .ts sources that import each other as .js.
 *
 * TypeScript requires import specifiers to name the *emitted* file, so the
 * sources say './decide.js' and tsc resolves that to decide.ts. Node's type
 * stripping does no such mapping, so at test time './decide.js' is a 404.
 *
 * This hook retries with the .ts sibling, and only after the real resolution
 * has already failed — once dist/ exists, its .js files still win outright.
 */

import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error?.code === 'ERR_MODULE_NOT_FOUND' && specifier.endsWith('.js')) {
        return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
      }
      throw error;
    }
  },
});
