class HenkanCli < Formula
  desc "CLI for the osu!mania to Etterna and StepMania converter"
  homepage "https://henkan.kaan.moe/"
  url "https://github.com/kaanreal/henkan/archive/refs/tags/v1.8.2.tar.gz"
  sha256 "4cd2b480f317e92ab470f4979754771f26c80f7b119f04e7e886bc1f10cb2355"
  license "MIT"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(path: "src-tauri"), "--bin", "henkan-cli"
  end

  test do
    assert_match "Usage", shell_output("#{bin}/henkan-cli --help")
  end
end
