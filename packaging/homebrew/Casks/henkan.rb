cask "henkan" do
  version "1.7.0"
  sha256 "11b37be2e1bb977da89401f7b57eef02d4ac4e2af235b2f19cf746afaa3fc668"

  url "https://github.com/kaanreal/henkan/releases/download/v#{version}/Henkan-v#{version}-macos.dmg"
  name "Henkan"
  desc "osu!mania to Etterna and StepMania converter"
  homepage "https://henkan.kaanreal.me/"

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
