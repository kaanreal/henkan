class HenkanCli < Formula
  desc "CLI for the osu!mania to Etterna and StepMania converter"
  homepage "https://henkan.kaan.moe/"
  url "https://github.com/kaanreal/henkan/archive/refs/tags/v1.8.0.tar.gz"
  sha256 "55b2a7b752f66eab97e34d01610258c37f6c97ac1e94ddf9db19b5e3f372545c"
  license "MIT"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(path: "src-tauri"), "--bin", "henkan-cli"
  end

  test do
    assert_match "Usage", shell_output("#{bin}/henkan-cli --help")
  end
end
