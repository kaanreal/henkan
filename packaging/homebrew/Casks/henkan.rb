cask "henkan" do
  version "1.8.0"
  sha256 "bca601252eb6253e71707bde150a7e8c6424533dcf7e2387f162871e47e5f20c"

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
