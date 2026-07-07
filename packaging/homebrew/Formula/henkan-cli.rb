class HenkanCli < Formula
  desc "CLI for osu!mania ↔ Etterna/StepMania beatmap converter"
  homepage "https://github.com/kaanreal/henkan"
  url "https://github.com/kaanreal/henkan/archive/refs/tags/v1.1.0.tar.gz"
  sha256 "CHANGE_ME" # replace with actual sha256 after first release
  license "MIT"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(path: "src-tauri")
    bin.install "henkan-cli"
  end

  test do
    assert_match "henkan-cli", shell_output("#{bin}/henkan-cli --help")
  end
end
