class HenkanCli < Formula
  desc "CLI for the osu!mania to Etterna and StepMania converter"
  homepage "https://henkan.kaan.moe/"
  url "https://github.com/kaanreal/henkan/archive/refs/tags/v1.8.3.tar.gz"
  sha256 "7c1fede58c5f235db75fc909bd90c56855b0abd3ddf6fe147243e2ec340ed42f"
  license "MIT"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(path: "src-tauri"), "--bin", "henkan-cli"
  end

  test do
    assert_match "Usage", shell_output("#{bin}/henkan-cli --help")
  end
end
