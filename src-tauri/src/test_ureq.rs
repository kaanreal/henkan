fn main() {
    let mut response = ureq::get("https://osu.direct/api/d/407186").call().unwrap();
    let bytes = response.body_mut().with_config().limit(100 * 1024 * 1024).read_to_vec().unwrap();
    println!("{}", bytes.len());
}
