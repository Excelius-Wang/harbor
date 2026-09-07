use tauri::{PhysicalPosition, PhysicalRect, PhysicalSize, Runtime, WebviewWindow};

const DEFAULT_WINDOW_WIDTH: f64 = 1200.0;
const DEFAULT_WINDOW_HEIGHT: f64 = 760.0;
const WORK_AREA_MARGIN: f64 = 16.0;
const MIN_WINDOW_WIDTH: f64 = 900.0;
const MIN_WINDOW_HEIGHT: f64 = 620.0;

#[derive(Debug, PartialEq)]
struct WindowGeometry {
    size: PhysicalSize<u32>,
    min_size: PhysicalSize<u32>,
    position: PhysicalPosition<i32>,
}

fn calculate_window_geometry(
    work_area: &PhysicalRect<i32, u32>,
    scale_factor: f64,
) -> WindowGeometry {
    let margin = (WORK_AREA_MARGIN * scale_factor).round() as u32;
    let available_width = work_area
        .size
        .width
        .saturating_sub(margin.saturating_mul(2))
        .max(1);
    let available_height = work_area
        .size
        .height
        .saturating_sub(margin.saturating_mul(2))
        .max(1);
    let width = ((DEFAULT_WINDOW_WIDTH * scale_factor).round() as u32).min(available_width);
    let height = ((DEFAULT_WINDOW_HEIGHT * scale_factor).round() as u32).min(available_height);
    let min_width = ((MIN_WINDOW_WIDTH * scale_factor).round() as u32).min(width);
    let min_height = ((MIN_WINDOW_HEIGHT * scale_factor).round() as u32).min(height);

    WindowGeometry {
        size: PhysicalSize::new(width, height),
        min_size: PhysicalSize::new(min_width, min_height),
        position: PhysicalPosition::new(
            work_area.position.x + ((work_area.size.width - width) / 2) as i32,
            work_area.position.y + ((work_area.size.height - height) / 2) as i32,
        ),
    }
}

pub fn fit_to_current_monitor<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let monitor = match window.current_monitor()? {
        Some(monitor) => Some(monitor),
        None => window.primary_monitor()?,
    };
    let Some(monitor) = monitor else {
        return Ok(());
    };

    let geometry = calculate_window_geometry(monitor.work_area(), monitor.scale_factor());

    // Lower the configured minimum first when the display itself is unusually small.
    window.set_min_size(Some(geometry.min_size))?;
    window.set_size(geometry.size)?;
    window.set_position(geometry.position)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_fixed_logical_dimensions_on_a_retina_monitor() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(0, 112),
            size: PhysicalSize::new(3024, 1786),
        };

        let geometry = calculate_window_geometry(&work_area, 2.0);

        assert_eq!(geometry.size, PhysicalSize::new(2400, 1520));
        assert_eq!(geometry.min_size, PhysicalSize::new(1800, 1240));
        assert_eq!(geometry.position, PhysicalPosition::new(312, 245));
    }

    #[test]
    fn keeps_the_window_within_an_unusually_small_work_area() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(-800, 0),
            size: PhysicalSize::new(800, 560),
        };

        let geometry = calculate_window_geometry(&work_area, 1.0);

        assert_eq!(geometry.size, PhysicalSize::new(768, 528));
        assert_eq!(geometry.min_size, geometry.size);
        assert_eq!(geometry.position, PhysicalPosition::new(-784, 16));
    }
    #[test]
    fn keeps_default_size_on_large_and_fractionally_scaled_displays() {
        for scale in [1.0, 1.25, 2.0] {
            let area = PhysicalRect {
                position: PhysicalPosition::new(-5000, 100),
                size: PhysicalSize::new(5000, 3000),
            };
            let geometry = calculate_window_geometry(&area, scale);
            assert_eq!(f64::from(geometry.size.width) / scale, DEFAULT_WINDOW_WIDTH);
            assert_eq!(
                f64::from(geometry.size.height) / scale,
                DEFAULT_WINDOW_HEIGHT
            );
            assert!(geometry.position.x >= area.position.x);
        }
    }

    #[test]
    fn configuration_fallback_matches_the_default_logical_size() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let main = &config["app"]["windows"][0];
        assert_eq!(main["width"].as_f64().unwrap(), DEFAULT_WINDOW_WIDTH);
        assert_eq!(main["height"].as_f64().unwrap(), DEFAULT_WINDOW_HEIGHT);
    }
}
