cask "henkan" do
  version "1.1.0"
  sha256 "CHANGE_ME" # replace with actual sha256 of .dmg

  url "https://github.com/kaanreal/henkan/releases/download/v#{version}/Henkan_#{version}_aarch64.dmg"
  name "Henkan"
  desc "osu!mania ↔ Etterna/StepMania beatmap converter"
  homepage "https://github.com/kaanreal/henkan"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :monterey"

  app "Henkan.app"

  zap trash: [
    "~/Library/Application Support/com.henkan.desktop",
    "~/Library/Saved Application State/com.henkan.desktop.savedState",
    "~/.config/henkan",
  ]
end
