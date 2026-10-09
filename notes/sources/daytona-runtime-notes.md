# Daytona runtime notes

Source review date: 2026-09-29.

## Sources

- [Daytona sandboxes](https://www.daytona.io/docs/en/sandboxes/)
- [Daytona billing](https://www.daytona.io/docs/billing)

## Planning facts

- Daytona sandboxes have an inactivity auto-stop setting, documented as 15 minutes by default. The setting can be changed, including disabling idle stop, but a separate wall-clock TTL can still terminate a sandbox.
- A background process running inside the sandbox does not by itself count as external activity that resets the idle timer.
- Sandbox lifecycle and billing are provider inputs. The reviewer plan must not assume a promotional credit, current price, or unlimited runtime.

## Decision for this reviewer

Daytona is not the persistent host. The reviewer runs on the owner's Windows PC through WSL2. Daytona is only a candidate P3 backend for a short-lived, exact-SHA runtime check after the security gate passes. The sandbox receives no model or publisher credentials, uses bounded resources and network, returns declared artifacts, and is destroyed or allowed to expire. Failure to start, execute, transfer, or clean up produces incomplete runtime evidence.

These notes record lifecycle behavior for planning. They do not establish that Daytona is an approved hostile-code isolation boundary for production; that requires a separate threat-model review and fixture on the actual deployment.
