# Black Box dashboard

The dashboard is the first UI slice for Black Box. It is a Vite React app with a dense operations layout inspired by the supplied reference, but with original Black Box branding, copy, colors, and icons.

```sh
cd dashboard
pnpm install
pnpm dev
```

The current shell uses representative data so the navigation and information hierarchy can be reviewed before the authenticated Worker API is connected. The next integration work replaces the fixture arrays in `src/App.tsx` with private GitHub and host-metrics endpoints.

`ynrlib` supplies the editable Lucide icon entry point at `ynrlib/icons`. The generated Black Box mark lives at `public/black-box-mark.png`.
