/**
 * boot.js — the only classic script, and the only file that is NOT compiled.
 *
 * MV3 content scripts cannot be ES modules, so this stays hand-written
 * JavaScript and is copied verbatim into dist/. Compiling it would make tsc
 * mark it as a module (`export {}`), which is a syntax error in the classic
 * script context Chrome loads it in.
 */
(async () => {
  try {
    await import(chrome.runtime.getURL('content/main.js'));
  } catch {
    // A page we cannot analyse must still work normally.
  }
})();
