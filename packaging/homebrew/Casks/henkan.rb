cask "henkan" do
  version "1.7.0"
  sha256 "82efb47382bd9e7a732cadb52f09b7a6b48f91fc6bb5b7e3c8b4bcad3c0e9372"

  url "https://github.com/kaanreal/henkan/releases/download/v#{version}/Henkan-v#{version}-macos.dmg"
  name "Henkan"
  desc "osu!mania to Etterna and StepMania converter"
  homepage "https://henkan.kaan.moe/"

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
