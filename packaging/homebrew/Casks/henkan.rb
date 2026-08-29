cask "henkan" do
  version "1.6.1"
  sha256 "8789d60526ad99abe35cb6691e557d75dabbd9ed26735f5051e5800be17455e8"

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
