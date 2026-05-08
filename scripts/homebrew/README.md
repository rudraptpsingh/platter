# Homebrew Cask

This directory contains the Homebrew cask formula for platter.

## To publish to Homebrew

Once a signed + notarized `.dmg` release exists on GitHub:

1. Compute the SHA256 of the `.dmg`:
   ```bash
   shasum -a 256 platter_0.5.0_aarch64.dmg
   ```

2. Update `platter.rb`:
   - Replace `:no_check` with the actual SHA256 string
   - Bump `version` if needed

3. Test locally:
   ```bash
   brew install --cask ./scripts/homebrew/platter.rb
   brew audit --cask ./scripts/homebrew/platter.rb
   ```

4. Submit to `homebrew/homebrew-cask` via a PR:
   ```bash
   # Fork https://github.com/Homebrew/homebrew-cask
   # Copy platter.rb into Casks/p/platter.rb
   # Open a PR titled "Add platter <version>"
   ```

## Intel / universal support

The current formula targets Apple Silicon (`arch: :arm64`).
When a universal or x86_64 build is available, update the `url` and `sha256`
or use `on_arm / on_intel` blocks per the Homebrew cask docs.

## Users can then install with

```bash
brew install --cask platter
```
