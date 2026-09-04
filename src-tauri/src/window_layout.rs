use tauri::{PhysicalPosition, PhysicalRect, PhysicalSize, Runtime, WebviewWindow};

const SCREEN_USAGE: f64 = 0.85;
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
    let width = (f64::from(work_area.size.width) * SCREEN_USAGE).round() as u32;
    let height = (f64::from(work_area.size.height) * SCREEN_USAGE).round() as u32;
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
    fn uses_eighty_five_percent_of_the_monitor_work_area() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(0, 112),
            size: PhysicalSize::new(3024, 1786),
        };

        let geometry = calculate_window_geometry(&work_area, 2.0);

        assert_eq!(geometry.size, PhysicalSize::new(2570, 1518));
        assert_eq!(geometry.min_size, PhysicalSize::new(1800, 1240));
        assert_eq!(geometry.position, PhysicalPosition::new(227, 246));
    }

    #[test]
    fn keeps_the_window_within_an_unusually_small_work_area() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(-800, 0),
            size: PhysicalSize::new(800, 560),
        };

        let geometry = calculate_window_geometry(&work_area, 1.0);

        assert_eq!(geometry.size, PhysicalSize::new(680, 476));
        assert_eq!(geometry.min_size, geometry.size);
        assert_eq!(geometry.position, PhysicalPosition::new(-740, 42));
    }
}
