cask "henkan" do
  version "1.8.2"
  sha256 "caf3a04d9ba6627d843b1c71dd6793ff60865c90dd3f3605ac7f359f1944ec15"

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
