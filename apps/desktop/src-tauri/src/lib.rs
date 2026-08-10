use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};

struct SidecarState(Mutex<Option<Child>>);

/// Windows extended paths (`\\?\E:\...`) break Node's main-module realpath
/// (`EISDIR: lstat 'E:'`). Strip before passing paths to Node / env.
fn strip_verbatim_prefix(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    #[cfg(windows)]
    {
        if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{rest}"));
        }
        if let Some(rest) = s.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    path.to_path_buf()
}

fn path_for_node(path: &Path) -> PathBuf {
    strip_verbatim_prefix(path)
}

fn desktop_log(msg: &str) {
    let log_dir = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ModelDesk");
    let _ = std::fs::create_dir_all(&log_dir);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("desktop.log"))
    {
        use std::io::Write;
        let _ = writeln!(f, "[desktop] {msg}");
    }
    eprintln!("[desktop] {msg}");
}

fn repo_root_from_exe() -> PathBuf {
    // Dev: apps/desktop/src-tauri → walk up to pnpm-workspace.yaml
    // Release: resources next to exe
    if let Ok(cwd) = std::env::current_dir() {
        if let Some(found) = find_repo_root(&cwd) {
            return found;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            if let Some(found) = find_repo_root(parent) {
                return found;
            }
            // Packaged: resource dir may be beside exe
            return path_for_node(parent);
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn find_repo_root(start: &Path) -> Option<PathBuf> {
    let mut dir = path_for_node(start);
    for _ in 0..10 {
        if dir.join("pnpm-workspace.yaml").is_file() {
            return Some(dir);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

fn resolve_sidecar_launch(root: &Path) -> Option<(PathBuf, Vec<String>, PathBuf)> {
    let root = path_for_node(root);
    // Prod runtime: extracted engine/ or runtime/sidecar.mjs
    for sub in ["engine", "runtime"] {
        let resource_runtime = root.join(sub);
        let packaged = resource_runtime.join("sidecar.mjs");
        if packaged.is_file() {
            let bundled_node = resource_runtime.join("node").join(if cfg!(windows) {
                "node.exe"
            } else {
                "node"
            });
            let node = std::env::var("MODELDESK_NODE")
                .map(PathBuf::from)
                .unwrap_or_else(|_| {
                    if bundled_node.is_file() {
                        path_for_node(&bundled_node)
                    } else {
                        PathBuf::from("node")
                    }
                });
            // Relative script avoids `\\?\` absolute paths that Node cannot realpath.
            return Some((
                path_for_node(&node),
                vec!["sidecar.mjs".to_string()],
                path_for_node(&resource_runtime),
            ));
        }
    }

    // Dev: monorepo scripts/desktop-sidecar.mjs
    let script = root.join("scripts").join("desktop-sidecar.mjs");
    if script.is_file() {
        let node = std::env::var("MODELDESK_NODE")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("node"));
        return Some((
            path_for_node(&node),
            vec!["scripts/desktop-sidecar.mjs".to_string()],
            root,
        ));
    }

    None
}

/// True when the unpacked engine can actually serve the UI (HTML + CSS).
fn engine_is_complete(engine_dir: &Path) -> bool {
    let web = engine_dir.join("web").join("apps").join("web");
    let static_dir = web.join(".next").join("static");
    let has_css = static_dir
        .join("chunks")
        .read_dir()
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .any(|e| e.path().extension().is_some_and(|ext| ext == "css"))
        })
        .unwrap_or(false);
    engine_dir.join("sidecar.mjs").is_file()
        && web.join("server.js").is_file()
        && static_dir.is_dir()
        && has_css
}

/// Unpack resources/engine.zip → {resource_dir}/engine.
/// Re-extracts when the tree looks incomplete (e.g. upgrade left a half-deleted engine).
fn ensure_engine_extracted(resource_dir: &Path) -> Result<PathBuf, String> {
    let resource_dir = path_for_node(resource_dir);
    let engine_dir = resource_dir.join("engine");
    if engine_is_complete(&engine_dir) {
        return Ok(engine_dir);
    }

    let zip_candidates = [
        resource_dir.join("engine.zip"),
        resource_dir.join("resources").join("engine.zip"),
        // Tauri resource_dir is often `.../resources`; zip may sit beside exe too.
        resource_dir
            .parent()
            .map(|p| p.join("resources").join("engine.zip"))
            .unwrap_or_default(),
        resource_dir
            .parent()
            .map(|p| p.join("engine.zip"))
            .unwrap_or_default(),
    ];
    let zip = zip_candidates
        .iter()
        .find(|p| p.is_file())
        .ok_or_else(|| {
            format!(
                "engine.zip not found under {} (engine incomplete or missing)",
                resource_dir.display()
            )
        })?;

    // Prefer extracting next to zip's parent resources/ → ../engine when possible.
    let engine_dir = if zip
        .file_name()
        .is_some_and(|n| n == "engine.zip")
        && zip
            .parent()
            .and_then(|p| p.file_name())
            .is_some_and(|n| n == "resources")
    {
        zip.parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("engine"))
            .unwrap_or(engine_dir)
    } else {
        engine_dir
    };
    let engine_dir = path_for_node(&engine_dir);

    if engine_dir.exists() {
        desktop_log(&format!(
            "engine incomplete — removing {} before re-extract",
            engine_dir.display()
        ));
        let _ = std::fs::remove_dir_all(&engine_dir);
    }
    std::fs::create_dir_all(&engine_dir)
        .map_err(|e| format!("mkdir engine: {e}"))?;

    let zip = path_for_node(zip);
    desktop_log(&format!(
        "extracting {} → {}",
        zip.display(),
        engine_dir.display()
    ));

    let mut tar = Command::new("tar");
    tar.args([
        "-xf",
        zip.to_string_lossy().as_ref(),
        "-C",
        engine_dir.to_string_lossy().as_ref(),
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());

    // Avoid flashing a black console window on Windows first launch.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        tar.creation_flags(CREATE_NO_WINDOW);
    }

    let status = tar
        .status()
        .map_err(|e| format!("tar extract failed to start: {e}"))?;

    if !status.success() {
        return Err(format!("tar extract failed: {status}"));
    }
    if !engine_is_complete(&engine_dir) {
        return Err(
            "engine.zip extracted but UI assets missing (server.js / .next/static/*.css)"
                .into(),
        );
    }
    Ok(engine_dir)
}

/// Write modeldesk / modeldesk-mcp / modeldesk-gateway shims into %LOCALAPPDATA%\ModelDesk\bin.
fn install_desktop_agent_bins(engine_dir: &Path) {
    let install_js = engine_dir.join("agents").join("install-bins.mjs");
    if !install_js.is_file() {
        desktop_log("agent bins: install-bins.mjs missing — skip");
        return;
    }
    let node = {
        let win = engine_dir.join("node").join("node.exe");
        let nix = engine_dir.join("node").join("bin").join("node");
        let plain = engine_dir.join("node").join("node");
        if win.is_file() {
            win
        } else if nix.is_file() {
            nix
        } else if plain.is_file() {
            plain
        } else {
            desktop_log("agent bins: packaged node missing — skip");
            return;
        }
    };
    let engine = path_for_node(engine_dir);
    desktop_log(&format!(
        "installing agent bins from {}",
        engine.display()
    ));
    let mut cmd = std::process::Command::new(&node);
    cmd.arg(path_for_node(&install_js).as_os_str())
        .arg("--engine-dir")
        .arg(engine.as_os_str())
        .arg("--add-path");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    match cmd.status() {
        Ok(status) if status.success() => desktop_log("agent bins installed"),
        Ok(status) => desktop_log(&format!("agent bins install status: {status}")),
        Err(e) => desktop_log(&format!("agent bins install failed: {e}")),
    }
}

fn spawn_sidecar(app: &tauri::AppHandle) -> Result<(), String> {
    let root = path_for_node(&repo_root_from_exe());
    // In release, Tauri resources are under resource_dir (often `\\?\...` on Windows).
    let resource_dir = app
        .path()
        .resource_dir()
        .ok()
        .map(|p| path_for_node(&p))
        .unwrap_or_else(|| root.clone());
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| path_for_node(p)));

    desktop_log(&format!(
        "resource_dir={} root={} exe_dir={}",
        resource_dir.display(),
        root.display(),
        exe_dir
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "(none)".into())
    ));

    // Prefer packaged zip → extract; try resource_dir, its parent, and exe dir.
    let mut extract_bases = vec![resource_dir.clone()];
    if let Some(parent) = resource_dir.parent() {
        extract_bases.push(parent.to_path_buf());
    }
    if let Some(exe_dir) = exe_dir.clone() {
        extract_bases.push(exe_dir);
    }
    let mut engine_ready: Option<PathBuf> = None;
    for base in &extract_bases {
        match ensure_engine_extracted(base) {
            Ok(dir) => {
                desktop_log(&format!("engine ready at {}", dir.display()));
                // ensure_engine_extracted already installs bins when it extracts;
                // also repair bins when engine was already complete.
                install_desktop_agent_bins(&dir);
                engine_ready = Some(dir);
                break;
            }
            Err(err) => desktop_log(&format!("engine extract @ {}: {err}", base.display())),
        }
    }
    let _ = engine_ready;

    let launch = resolve_sidecar_launch(&resource_dir)
        .or_else(|| {
            resource_dir
                .parent()
                .and_then(|p| resolve_sidecar_launch(p))
        })
        .or_else(|| exe_dir.as_ref().and_then(|p| resolve_sidecar_launch(p)))
        .or_else(|| resolve_sidecar_launch(&root))
        .ok_or_else(|| {
            format!(
                "sidecar not found (looked under {}, {:?}, and {})",
                resource_dir.display(),
                exe_dir,
                root.display()
            )
        })?;

    let (program, args, cwd) = launch;
    desktop_log(&format!(
        "starting sidecar: {:?} {:?} cwd={}",
        program,
        args,
        cwd.display()
    ));

    // Log sidecar to data dir so failures are diagnosable without a console.
    let log_dir = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| root.clone())
        .join("ModelDesk");
    let _ = std::fs::create_dir_all(&log_dir);
    let log_path = log_dir.join("sidecar.log");
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .ok();
    let (stdout, stderr) = match log_file {
        Some(f) => {
            let err = f.try_clone().ok();
            (
                Stdio::from(f),
                err.map(Stdio::from).unwrap_or_else(Stdio::null),
            )
        }
        None => (Stdio::null(), Stdio::null()),
    };

    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .current_dir(&cwd)
        .env("MODELDESK_DESKTOP", "1")
        .env(
            "MODELDESK_REPO_ROOT",
            path_for_node(&root).to_string_lossy().as_ref(),
        )
        .stdin(Stdio::null())
        .stdout(stdout)
        .stderr(stderr);

    if cwd.join("web").is_dir() {
        cmd.env(
            "MODELDESK_RUNTIME",
            path_for_node(&cwd).to_string_lossy().as_ref(),
        );
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn sidecar: {e}"))?;

    if let Some(state) = app.try_state::<SidecarState>() {
        *state.0.lock().map_err(|e| e.to_string())? = Some(child);
    }

    Ok(())
}

fn kill_sidecar(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<SidecarState>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(mut child) = guard.take() {
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    let _ = Command::new("taskkill")
                        .args(["/pid", &child.id().to_string(), "/T", "/F"])
                        .creation_flags(0x0800_0000)
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .status();
                }
                #[cfg(not(windows))]
                {
                    let _ = child.kill();
                }
                let _ = child.wait();
            }
        }
    }
}

fn wait_for_web(timeout: Duration) -> bool {
    let started = std::time::Instant::now();
    while started.elapsed() < timeout {
        if let Ok(Ok(resp)) = std::thread::Builder::new()
            .name("probe".into())
            .spawn(|| {
                // Avoid adding reqwest — use tiny TCP connect via std only is hard for HTTP;
                // PowerShell / curl. Use `std::net::TcpStream` as readiness proxy.
                std::net::TcpStream::connect_timeout(
                    &"127.0.0.1:3300".parse().unwrap(),
                    Duration::from_millis(400),
                )
            })
            .map(|t| t.join())
        {
            if resp.is_ok() {
                return true;
            }
        }
        thread::sleep(Duration::from_millis(400));
    }
    false
}

fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("ModelDesk")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                kill_sidecar(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    {
        // Allow WebView to talk to local Next / upstream if needed
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--disable-web-security --disable-site-isolation-trials",
        );
    }

    tauri::Builder::default()
        .manage(SidecarState(Mutex::new(None)))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            setup_tray(app.handle())?;

            // Extract + start engine off the UI thread so the splash shows immediately.
            // First launch unpacks ~120MB engine.zip and can take 1–2 minutes.
            let handle = app.handle().clone();
            thread::spawn(move || {
                if let Err(err) = spawn_sidecar(&handle) {
                    eprintln!("[desktop] {err}");
                    return;
                }
                if wait_for_web(Duration::from_secs(180)) {
                    if let Some(window) = handle.get_webview_window("main") {
                        // Prefer native navigate over eval(location.replace) so the
                        // WebView loads http origin cleanly (stylesheets /_next/static).
                        let url = url::Url::parse("http://127.0.0.1:3300/")
                            .expect("static localhost url");
                        match window.navigate(url) {
                            Ok(()) => desktop_log("navigated to http://127.0.0.1:3300/"),
                            Err(err) => {
                                desktop_log(&format!(
                                    "navigate failed ({err}), falling back to location.replace"
                                ));
                                let _ = window.eval(
                                    "window.location.replace('http://127.0.0.1:3300/')",
                                );
                            }
                        }
                    }
                } else {
                    desktop_log("web did not become ready on :3300");
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                kill_sidecar(app);
            }
        });
}
