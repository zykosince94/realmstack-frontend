# Security policy

## Supported versions

Security fixes are made to the latest 1.x release. Upgrade to it before reporting an issue
you found on an older version.

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue, pull request or
discussion that contains exploit details.

Use GitHub's private vulnerability reporting: open this repository's **Security** tab and
choose **Report a vulnerability**. Include:

- the affected screen, component or build and the version or commit you tested;
- the steps that reproduce it (a minimal case is best);
- the impact you believe it has, for example script injection or token exposure.

Issues in the API itself (tenant isolation, authentication, idempotency, the AI base-URL
guard) belong in the backend repository's security policy.

Reports are handled on a best-effort basis. Please allow reasonable time to investigate and
release a fix before you disclose publicly; 90 days is a common default. Tell us if you want
to be credited.

## Scope

In scope: cross-site scripting in the dashboard or the documentation renderer, session and
token handling in the browser, secrets reaching the client bundle, and the self-hosting
files (`docker-compose.selfhost.yml`, `deploy/nginx.conf`).

Out of scope: the local demo credentials, the Vite development server used by the demo
Compose stack, and volumetric denial of service.

## Hardening a deployment

Serve the dashboard over HTTPS on the same origin as the API, as described in the
documentation's **Self-hosting** and **Production checklist** pages. `VITE_*` values are
compiled into the public bundle: never put a secret in them.
