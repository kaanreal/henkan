class HenkanCli < Formula
  desc "CLI for the osu!mania to Etterna and StepMania converter"
  homepage "https://henkan.kaanreal.me/"
  url "https://github.com/kaanreal/henkan/archive/refs/tags/v1.7.0.tar.gz"
  sha256 "2134bce44ac689585074dd2f573e752d8392a8dbda44314b080cbbd12e595ca6"
  license "MIT"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(path: "src-tauri"), "--bin", "henkan-cli"
  end

  test do
    assert_match "Usage", shell_output("#{bin}/henkan-cli --help")
  end
end
