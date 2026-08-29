class HenkanCli < Formula
  desc "CLI for the osu!mania to Etterna and StepMania converter"
  homepage "https://henkan.app/"
  url "https://github.com/kaanreal/henkan/archive/refs/tags/v1.6.1.tar.gz"
  sha256 "f46446d8638ec3757b02964835160cbdb5bc021d154aa1840eee35acc580ecba"
  license "MIT"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(path: "src-tauri"), "--bin", "henkan-cli"
  end

  test do
    assert_match "Usage", shell_output("#{bin}/henkan-cli --help")
  end
end
