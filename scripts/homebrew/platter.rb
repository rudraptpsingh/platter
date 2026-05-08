cask "platter" do
  version "0.5.0"
  sha256 :no_check  # TODO: replace with actual SHA256 of the released .dmg before submitting

  url "https://github.com/rudraptpsingh/platter/releases/download/v#{version}/platter_#{version}_aarch64.dmg"
  name "platter"
  desc "Human-in-the-loop review tray for AI agent outputs. MCP server for Claude Code."
  homepage "https://platter.pages.dev"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :big_sur"
  depends_on arch: :arm64

  app "platter.app"

  zap trash: [
    "~/Library/Application Support/com.platter.app",
    "~/Library/Caches/com.platter.app",
    "~/Library/Logs/com.platter.app",
    "~/Library/Preferences/com.platter.app.plist",
    "~/Library/Saved Application State/com.platter.app.savedState",
  ]
end
