# macOS code signing and notarization

Unsigned builds show:

> Apple could not verify “Extract AI Token” is free of malware…

To fix this for **release DMGs**, sign with a **Developer ID Application** certificate and **notarize** with Apple.

## Maintainer setup (one time)

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/).
2. Create a **Developer ID Application** certificate in Certificates, Identifiers & Profiles.
3. Export the certificate as `.p12` from Keychain Access (include private key).
4. Create an [app-specific password](https://appleid.apple.com/account/manage) for notarization, or an [App Store Connect API key](https://appstoreconnect.apple.com/access/integrations/api).

## GitHub Actions secrets

**Signing runs only when a certificate secret is present** (`MACOS_CERTIFICATE_BASE64`).  
**Notarization runs only when Apple ID or API key secrets are also set.**

Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Required for | Description |
|--------|----------------|-------------|
| `MACOS_CERTIFICATE_BASE64` | **Sign** | Base64 of the `.p12`: `base64 -i cert.p12 \| pbcopy` |
| `MACOS_CERTIFICATE_PASSWORD` | **Sign** | Password used when exporting the `.p12` |
| `KEYCHAIN_PASSWORD` | **Sign** | Random string for the ephemeral CI keychain |
| `APPLE_ID` | Apple ID email used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password (not your Apple ID password) |
| `APPLE_TEAM_ID` | Team ID (10 characters, Membership details) |

Optional (API key instead of app-specific password):

| Secret | Description |
|--------|-------------|
| `APPLE_API_KEY_ID` | Key ID |
| `APPLE_API_ISSUER_ID` | Issuer ID |
| `APPLE_API_KEY` | Base64-encoded `.p8` key contents |

When `MACOS_CERTIFICATE_BASE64` is set, the **Release** workflow signs the app, then builds the DMG. Without it, the DMG is **unsigned** (same as before).

Aliases supported locally: `CERTIFICATE_BASE64`, `CERTIFICATE_PATH` (path to `.p12`), `CERTIFICATE_PASSWORD`.

## Local release build

```bash
cd backend && cargo build --release
cp target/release/backend ../build/macos-backend

cd app
flutter build macos --release

cd ..
# Option A: base64 cert
export MACOS_CERTIFICATE_BASE64="$(base64 -i /path/to/cert.p12 | tr -d '\n')"
# Option B: path to .p12 (script encodes automatically)
# export CERTIFICATE_PATH="/path/to/cert.p12"

export MACOS_CERTIFICATE_PASSWORD='...'
export KEYCHAIN_PASSWORD='temporary-keychain-pass'
# Optional — only for notarization:
export APPLE_ID='you@example.com'
export APPLE_APP_SPECIFIC_PASSWORD='xxxx-xxxx-xxxx-xxxx'
export APPLE_TEAM_ID='XXXXXXXXXX'
export GITHUB_REF_NAME='v0.1.0'

./scripts/macos-release-package.sh
```

Sign only (no DMG repack), after `flutter build macos --release`:

```bash
export CERTIFICATE_PATH="/path/to/DeveloperID.p12"
export MACOS_CERTIFICATE_PASSWORD='...'
export KEYCHAIN_PASSWORD='...'
./scripts/macos-import-signing-cert.sh
./scripts/macos-sign-app.sh "app/build/macos/Build/Products/Release/Extract AI Token.app"
```

## End users (unsigned build only)

If you downloaded an **unsigned** build:

1. **Right-click** (or Control-click) **Extract AI Token** → **Open** → confirm **Open** once, or
2. Terminal:

   ```bash
   xattr -cr "/Applications/Extract AI Token.app"
   ```

Then open the app normally. This does not apply to properly signed and notarized releases from GitHub.

## Verify a release

```bash
spctl -a -vv --type install extract-ai-token-v0.1.0-macos.dmg
codesign --verify --deep --strict --verbose=2 "/Applications/Extract AI Token.app"
```

Expected after notarization: `source=Notarized Developer ID` or `accepted`.
