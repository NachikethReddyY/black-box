# Tailscale access for the WSL2 runner

This optional path gives an owner controlled way to reach the Ubuntu WSL2 runner over Tailscale SSH. It does not keep Windows or WSL awake, install anything, alter the tailnet, or expose a public endpoint.

Read the official [Tailscale Windows with WSL2 guide](https://tailscale.com/docs/install/windows/wsl2) before using this. Tailscale describes WSL2 installation as advanced, asks you to verify WSL version 2, and installs the client inside the Linux distribution. The same page warns that running Tailscale on both Windows and inside WSL2 can cause encapsulation and packet size problems.

## Install inside Ubuntu WSL2

1. In PowerShell, verify the distribution uses WSL2:

   ```powershell
   wsl -l -v
   ```

2. Start the Ubuntu distribution and follow Tailscale's current Linux installation steps inside that shell. The official guide currently shows the Linux install script and then `sudo tailscale up`; use the current commands from Tailscale rather than copying a token into this repository.
3. Keep the Linux-side Tailscale client in the Ubuntu distribution when you want direct Tailscale SSH to the runner. A Tailscale client installed only on Windows does not make the WSL Linux node a separate Tailscale SSH server.
4. Enable Tailscale SSH only if the tailnet owner has approved the policy and host access. Tailscale documents `tailscale up --ssh` and tailnet policy rules for this. The owner must define the `ssh` access policy and network access for the intended users and devices.

The only supported access decision here is owner controlled tailnet policy. Do not add credentials, auth keys, ACL files, or private IPs to this repository. This guide does not configure Funnel, Serve, subnet routing, exit nodes, router ports, or firewall forwarding.

## WSL lifetime and runner availability

WSL must remain running for Tailscale SSH and the GitHub runner to be reachable. This skeleton does not wake the Windows PC, keep WSL alive in the background, install a Windows startup task, or claim service support. Use the visible `scripts/start-wsl.ps1` helper when you choose to start a session manually, then stop it when finished.

A Windows-only Tailscale connection can still reach Windows resources permitted by the Windows node's policy. It does not, by itself, provide direct SSH to the WSL distribution used by this runner. Test the actual Linux node from an approved tailnet device before relying on remote access.

## Memory observation and `.wslconfig`

Record the observed Linux memory from inside the target WSL distribution:

```bash
grep MemTotal /proc/meminfo
free -h
```

This host is macOS, so no WSL `/proc/meminfo` value was available during skeleton validation. Do not copy a made-up value into this document.

Microsoft's current WSL configuration reference says `.wslconfig` does not exist by default and the default WSL2 `memory` is 50% of total Windows memory. For a Windows host with 16 GB total memory, that is about 8 GB by default. This skeleton does not create or modify `%UserProfile%\\.wslconfig`; change it only after measuring the runner's real workload and with the owner's approval.

## Checks before remote use

From Ubuntu, confirm the Linux node and runner separately:

```bash
tailscale status
tailscale ip
./scripts/status.sh
```

The status output does not contain Tailscale credentials. A runner can receive jobs only while WSL, Docker when required, the runner process, and the GitHub online/idle state are all available.
