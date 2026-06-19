# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x     | :white_check_mark: |

## Reporting a Vulnerability

Henkan is a local file conversion tool that does not make network requests
(other than opt-in Aptabase analytics). However, if you discover a security
vulnerability, please report it by opening an issue at:

https://github.com/kaanreal/henkan/issues

Do **not** report security vulnerabilities via public GitHub issues if they
involve remote code execution, privilege escalation, or sensitive data exposure.

## Scope

- Command injection via SM/osu file parsing
- Path traversal in zip/archive handling
- Arbitrary file read via crafted beatmap files
- CSP bypass leading to XSS

## Out of Scope

- Denial of service via malformed beatmap files (acceptable risk for a dev tool)
- Missing code signing (future enhancement)
