fn main() {
    println!("cargo:rerun-if-env-changed=HARBOR_GITHUB_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=HARBOR_GITHUB_CLIENT_SECRET");
    tauri_build::build()
}
