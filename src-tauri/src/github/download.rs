const MAX_DOWNLOAD_NAME_BYTES: usize = 200;

pub(crate) fn safe_download_name(name: &str, fallback: &str) -> String {
    let mut sanitized = String::new();
    for character in name.trim().chars() {
        let character = match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            character if character.is_control() => '_',
            character => character,
        };
        if sanitized.len() + character.len_utf8() > MAX_DOWNLOAD_NAME_BYTES {
            break;
        }
        sanitized.push(character);
    }
    let sanitized = sanitized.trim_matches([' ', '.']);
    if sanitized.is_empty() {
        fallback.to_string()
    } else {
        sanitized.to_string()
    }
}

pub(crate) fn safe_download_name_with_suffix(name: &str, fallback: &str, suffix: &str) -> String {
    let sanitized = safe_download_name(name, fallback);
    if sanitized
        .to_ascii_lowercase()
        .ends_with(&suffix.to_ascii_lowercase())
    {
        sanitized
    } else {
        format!("{sanitized}{suffix}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn download_names_are_cross_platform_safe_and_bounded() {
        assert_eq!(
            safe_download_name(" release:macOS.dmg ", "asset"),
            "release_macOS.dmg"
        );
        assert_eq!(safe_download_name(" .. ", "asset"), "asset");
        assert_eq!(
            safe_download_name_with_suffix("source", "archive", ".tar.gz"),
            "source.tar.gz"
        );
        assert_eq!(
            safe_download_name_with_suffix("source.TAR.GZ", "archive", ".tar.gz"),
            "source.TAR.GZ"
        );
        assert!(safe_download_name(&"产物".repeat(100), "asset").len() <= 200);
    }
}
