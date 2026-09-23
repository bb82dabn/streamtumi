# Security Policy

## Supported versions

Before v0.1.0 is released, security fixes are made on the active development
branch. After release, only the latest v0.1 patch release is expected to
receive security fixes. This is a best-effort project policy, not a service
level agreement.

| Version | Supported |
| --- | --- |
| Active development branch | Yes |
| Latest 0.1.x release, once published | Yes |
| Older releases and commits | No |

## Report a vulnerability privately

Use GitHub private vulnerability reporting for this repository:

1. Open the repository's **Security** tab.
2. Select **Advisories**.
3. Select **Report a vulnerability**.
4. Submit the report privately with the details listed below.

No private email is required. Do not open a public issue, discussion, or pull
request for an undisclosed vulnerability. If GitHub does not show the private
reporting option, ask a repository owner in a public issue to enable private
vulnerability reporting, but include no vulnerability details in that issue.

Include, when available:

- the affected commit or release;
- affected deployment components and configuration;
- prerequisites and reproducible steps;
- impact and an example attack scenario;
- logs or proof of concept with secrets and personal data removed; and
- any suggested mitigation.

Do not test against systems you do not own or have permission to assess. Do
not access, retain, alter, or disclose other users' data. Avoid denial of
service, social engineering, and automated attacks against public services.

## Response process

Maintainers will use the private advisory to acknowledge and assess the report,
request clarification, coordinate a fix, and prepare disclosure when
appropriate. Timing depends on severity, reproducibility, maintainer
availability, and release readiness. Please allow a reasonable remediation
period before public disclosure.

Credit is offered when requested and when it is safe and appropriate. A
reporter may remain anonymous.

## Deployment responsibility

Self-hosters are responsible for TLS, host and container updates, secret
management, backups, access control, network exposure, and third-party service
configuration. Review `docs/self-hosting.md`, `docs/external-access.md`, and
`docs/upgrading.md`.

The v0.1 security boundary does not include transition-era integrations such
as SableID, Apple login, Red Devil, generic relays, live Studio, MediaMTX,
coturn, Cast, Sentry, or EAS.
