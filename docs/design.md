[← README](../README.md)

# The mark

The icon is an **indeterminate checkbox** — filled with the accent, carrying a
dash rather than a tick. That is not decoration. It is the state a select-all
control is left in once Agreedee has run, because some of the items under it
were refused. The KRDS rule in `selectall.ts` says so in code; the icon says
the same thing in one glyph.

```
assets/icon.svg        the master, 128 viewBox
assets/icon-16.svg     redrawn on the 16px grid — scaled down, the dash smears
assets/promo-small.svg      Web Store tile, 440x280
assets/social-preview.svg   repository social preview, 1280x640
icons/icon-{16,32,48,128}.png   what Chrome loads; committed
```

`pnpm icons` regenerates the PNGs from the SVGs (needs `librsvg`). The PNGs are
committed, so nobody needs it to build or run the extension — it exists so the
artwork has one source of truth. A test asserts every icon the manifest names
exists and is the size it claims, because Chrome's fallback for a missing icon
is a generic puzzle piece and nothing complains until the store rejects the
upload.

---
