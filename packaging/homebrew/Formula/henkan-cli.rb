class HenkanCli < Formula
  desc "CLI for the osu!mania to Etterna and StepMania converter"
  homepage "https://henkan.kaan.moe/"
  url "https://github.com/kaanreal/henkan/archive/refs/tags/v1.9.0.tar.gz"
  sha256 "531cfe69c46a1aaa00c0cc4d39b37303b9bee90ad71d88a6dc70d2186105f0b4"
  license "MIT"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(path: "src-tauri"), "--bin", "henkan-cli"
  end

  test do
    assert_match "Usage", shell_output("#{bin}/henkan-cli --help")
  end
end
