class HenkanCli < Formula
  desc "CLI for the osu!mania to Etterna and StepMania converter"
  homepage "https://henkan.kaan.moe/"
  url "https://github.com/kaanreal/henkan/archive/refs/tags/v1.7.0.tar.gz"
  sha256 "cda6cfa31abc6ad407125a3c44b1ade98246eba8b8801fc6e8806ffa7b0a2aa8"
  license "MIT"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(path: "src-tauri"), "--bin", "henkan-cli"
  end

  test do
    assert_match "Usage", shell_output("#{bin}/henkan-cli --help")
  end
end
