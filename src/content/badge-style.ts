/**
 * badge-style.ts — the badge's own stylesheet.
 *
 * It lives inside a shadow root with `all: initial`, so nothing here can leak
 * onto the page and nothing on the page can reach in.
 */

export const CSS = `
:host { all: initial; }
.wrap { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  font: 13px/1.5 -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  color: #111; }
.badge { display: flex; align-items: center; gap: 8px; background: #fff; color: #111;
  border: 1px solid #d8d8d8; border-radius: 999px; box-shadow: 0 2px 12px rgba(0,0,0,.16);
  padding: 8px 14px; cursor: pointer; max-width: 320px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #1a7f37; flex: none; }
.dot.pending { background: #b35c00; }
.dot.degraded { background: #6b6b6b; }
.line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.panel { display: none; margin-bottom: 8px; background: #fff; border: 1px solid #d8d8d8;
  border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,.16); padding: 12px 14px;
  max-width: 340px; max-height: 50vh; overflow: auto; }
.panel.open { display: block; }
h2 { font-size: 12px; margin: 0 0 6px; color: #444; font-weight: 600; }
ul { list-style: none; margin: 0 0 10px; padding: 0; }
li { padding: 4px 0; border-bottom: 1px solid #f0f0f0; }
.label { display: block; }
.why { color: #666; font-size: 12px; }
.apply { margin-top: 4px; font: inherit; background: #111; color: #fff; border: 0;
  border-radius: 6px; padding: 6px 12px; cursor: pointer; }
.note { color: #666; font-size: 12px; }
.regime { display: block; margin-top: 10px; font: inherit; font-size: 12px;
  background: none; color: #555; border: 1px solid #d8d8d8; border-radius: 6px;
  padding: 4px 10px; cursor: pointer; }
`;
