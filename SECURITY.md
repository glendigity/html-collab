# Security Policy

html-collab produces single-file HTML artifacts that travel between
organisations. Vulnerabilities matter and we want to hear about them.

## Reporting a vulnerability

Email Glen Maisey at glen.maisey@gmail.com with the details. Please do not
open a public GitHub issue for security reports.

Expect an acknowledgement within five business days. Fixes for confirmed
vulnerabilities will be released as soon as practical, and we will coordinate
disclosure with you.

## Scope

In scope:

- Vulnerabilities in the embedded review runtime that could execute
  unintended code when a `.review.html` file is opened
- Bugs in `wrap`, `merge`, or `extract` that could corrupt review state or
  exfiltrate data
- Issues that let imported review state hide, corrupt, or execute data beyond
  the trusted-file model

Out of scope:

- Trusted-author attacks where the original report HTML itself is malicious.
  Wrapping does not sanitise the report content.
- Cryptographic audit logs, tamper detection, and reviewer authentication.
  These are not part of the current release.
- Issues that require physical access to the reviewer's machine
- Denial-of-service from oversized or malformed input files (we will still
  read these reports but they are lower priority)
