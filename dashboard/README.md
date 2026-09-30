# Black Box dashboard

The dashboard is the first UI slice for Black Box. It is a Vite React app with a dense operations layout inspired by the supplied reference, but with original Black Box branding, copy, colors, and icons.

```sh
cd dashboard
pnpm install
pnpm dev
```

The dashboard now reads repositories, workflow runs, jobs, and selected job logs from the authenticated Worker API. The browser never receives a GitHub access token. The Worker stores an encrypted session token in D1 and returns normalized data only.

## Run it locally

```sh
cd dashboard
pnpm install
pnpm dev
```

For a local frontend against the deployed Worker, set `VITE_BLACKBOX_API_URL` before starting Vite. The Worker must allow that origin through its `DASHBOARD_ORIGIN` variable. The production build is served by the Worker itself, so its API base URL remains relative.

The GitHub App needs an OAuth client secret for `/auth/github`. Set `GITHUB_OAUTH_CLIENT_SECRET`, `DASHBOARD_SESSION_SECRET`, and `DASHBOARD_ORIGIN` as Worker secrets/vars. The callback URL is:

```text
https://blackbox-worker-dispatcher.ynrdevs.workers.dev/auth/github/callback
```

The current App client ID is `Iv23liMauN7uWCt9bzDB`. Never commit the OAuth secret or a session secret. A user must complete GitHub authorization before repositories or logs can be read.

`ynrlib` supplies the editable Lucide icon entry point at `ynrlib/icons`. The generated Black Box mark lives at `public/black-box-mark.png`.

Runners and Storage deliberately show an unavailable state until the WSL agent reports signed host telemetry. The UI does not estimate CPU, RAM, disk, cache hits, or cost from GitHub workflow data.
