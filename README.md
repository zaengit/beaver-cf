# Beaver CF

Cloudflare Workers-native CMS server, API, and React admin UI.

## Publishing to npmjs

The package is published to npmjs as `@zaengit/beaver-cf` by `.github/workflows/publish.yml` whenever a `v*` Git tag is pushed.

Before publishing, configure the GitHub repository with an `npm` environment and add an `NPM_TOKEN` secret that has permission to publish `@zaengit/beaver-cf` on npmjs.

A release tag must match the version in `package.json` (for example, package version `0.1.0` is released with tag `v0.1.0`). The workflow verifies the version, installs dependencies with `npm ci`, builds the package, runs tests when present, validates the package contents, publishes with npm provenance, and verifies that the released version is visible from `registry.npmjs.org`.
