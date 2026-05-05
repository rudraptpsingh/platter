# Building & notarizing a release

This guide walks through producing a notarized, Gatekeeper-blessed `.dmg` of platter that you can hand to anyone with a Mac.

## TL;DR

```bash
# Local unsigned build (fast, for your own machine)
./scripts/release.sh

# Signed + notarized build (for distribution)
./scripts/release.sh --signed
```

## Prerequisites for `--signed`

You need these one-time items from Apple. If you already have a paid Apple Developer account, this should take ~30 minutes total.

### 1. A Developer ID Application certificate

Used to code-sign the `.app` and `.dmg`. Without it, Gatekeeper warns the user with "platter can't be opened because Apple cannot check it for malicious software."

1. Sign in at <https://developer.apple.com/account>
2. **Certificates → +** → choose **Developer ID Application**
3. Follow the CSR (Certificate Signing Request) flow in Keychain Access (Keychain Access → Certificate Assistant → Request a Certificate from a CA → save to disk)
4. Upload the CSR to Apple, download the resulting `.cer`, double-click to install in your login keychain
5. Verify: `security find-identity -v -p codesigning` should list your `Developer ID Application: Your Name (TEAMID)`

### 2. An app-specific password

Used by `notarytool` to authenticate without your real Apple ID password.

1. Sign in at <https://appleid.apple.com>
2. **Sign-In and Security → App-Specific Passwords → Generate**
3. Name it `platter-notary`. Save the 19-char password (you only see it once).

### 3. Your Team ID

Find at <https://developer.apple.com/account#MembershipDetailsCard>. 10 characters, all caps.

## Set environment variables

The release script auto-loads `~/.platter-release.env` if it exists. Create it:

```bash
cat > ~/.platter-release.env <<'EOF'
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
EOF
chmod 600 ~/.platter-release.env
```

That file is gitignored. Never commit it.

## Run the build

```bash
./scripts/release.sh --signed
```

The script will:

1. Verify your signing identity is in the keychain
2. Build the frontend (vite + tsc)
3. Build the Rust release binary and bundle it as a `.app` and `.dmg`
4. Submit the DMG to `notarytool submit --wait` (typically returns in 1–10 min)
5. `stapler staple` both the DMG and the .app inside it
6. Verify with `spctl --assess`

If it succeeds, you'll find the signed-and-stapled DMG at:

```
src-tauri/target/release/bundle/dmg/platter_<version>_aarch64.dmg
```

## Distribute

Upload the DMG to a release on GitHub or your own server. Anyone with macOS 11+ can:

1. Download the `.dmg`
2. Open it, drag platter.app → Applications
3. Open platter from Applications. **No Gatekeeper warning.**

## Wire up `claude mcp add` against the release path

Once the release binary is at a stable location:

```bash
claude mcp add platter -- /Applications/platter.app/Contents/MacOS/platter --mcp-stdio
```

That's the path to copy into the Settings → Claude integration tab inside platter.

## Troubleshooting

### `notarytool` says "The signature of the binary is invalid"

Some part of the bundle didn't get signed. Rerun the build; Tauri 2 signs every nested framework correctly when `APPLE_SIGNING_IDENTITY` is set.

### `notarytool` says "The executable does not have the hardened runtime enabled"

Tauri 2 enables the hardened runtime by default for Developer ID builds. If this triggers, check that `signingIdentity` in `tauri.conf.json` is null (Tauri uses the env var) and that `APPLE_SIGNING_IDENTITY` is exported.

### "platter is damaged and can't be opened" on the user's Mac

Almost always means the DMG wasn't stapled, or was modified after stapling. Re-run `./scripts/release.sh --signed` end-to-end without manually editing the artifact.

### Apple-silicon vs Intel

`tauri build` on an Apple-silicon Mac produces an `aarch64` binary. To ship a universal DMG that works on Intel too:

```bash
rustup target add x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```

Then point the release script at the universal target.
