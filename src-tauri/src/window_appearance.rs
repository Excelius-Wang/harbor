#[cfg(any(target_os = "macos", test))]
fn replace_vibrancy<E>(
    enabled: bool,
    mut clear: impl FnMut() -> Result<bool, E>,
    apply: impl FnOnce() -> Result<(), E>,
) -> Result<(), E> {
    while clear()? {}
    if enabled {
        apply()?;
    }
    Ok(())
}

/// Replaces macOS vibrancy instead of accumulating native effect views.
#[tauri::command]
pub async fn sync_window_vibrancy(window: tauri::Window, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        let target = window.clone();
        window
            .run_on_main_thread(move || {
                let result = replace_vibrancy(
                    enabled,
                    || window_vibrancy::clear_vibrancy(&target),
                    || {
                        window_vibrancy::apply_vibrancy(
                            &target,
                            window_vibrancy::NSVisualEffectMaterial::UnderWindowBackground,
                            Some(window_vibrancy::NSVisualEffectState::FollowsWindowActiveState),
                            Some(10.0),
                        )
                    },
                )
                .map_err(|error| error.to_string());
                let _ = sender.send(result);
            })
            .map_err(|error| error.to_string())?;
        receiver.await.map_err(|error| error.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, enabled);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::replace_vibrancy;
    use std::cell::RefCell;

    #[test]
    fn removes_all_previous_layers_before_applying_one() {
        let events = RefCell::new(Vec::new());
        let mut layers = 3;
        replace_vibrancy::<()>(
            true,
            || {
                events.borrow_mut().push("clear");
                if layers == 0 {
                    return Ok(false);
                }
                layers -= 1;
                Ok(true)
            },
            || {
                events.borrow_mut().push("apply");
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(
            *events.borrow(),
            ["clear", "clear", "clear", "clear", "apply"]
        );
    }

    #[test]
    fn reduced_transparency_removes_layers_without_replacement() {
        let mut layers = 2;
        replace_vibrancy::<()>(
            false,
            || {
                if layers == 0 {
                    return Ok(false);
                }
                layers -= 1;
                Ok(true)
            },
            || panic!("reduced transparency must not reapply vibrancy"),
        )
        .unwrap();
        assert_eq!(layers, 0);
    }

    #[test]
    fn a_failed_clear_does_not_add_another_layer() {
        let result = replace_vibrancy(true, || Err("clear failed"), || panic!("must not apply"));
        assert_eq!(result, Err("clear failed"));
    }
}
