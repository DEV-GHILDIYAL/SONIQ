// SONIQ for Windows: a small native window (WebView2) around the same app as the phone
// (Expo web build in dist-web/). No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

/// Updater public key, baked in at build time by CI (secret TAURI_UPDATER_PUBKEY).
/// Builds without it simply have no auto-update.
const UPDATER_PUBKEY: Option<&str> = option_env!("SONIQ_UPDATER_PUBKEY");

type BoxError = Box<dyn std::error::Error + Send + Sync>;

/// Look for a newer version on GitHub Releases; ask before installing it.
async fn check_for_update(app: AppHandle) -> Result<(), BoxError> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(());
    };
    let version = update.version.clone();
    let asker = app.clone();
    let yes = tauri::async_runtime::spawn_blocking(move || {
        asker
            .dialog()
            .message(format!(
                "SONIQ {version} is ready.\nUpdate now? It takes a few seconds and SONIQ restarts."
            ))
            .title("Update available")
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Update now".into(),
                "Later".into(),
            ))
            .blocking_show()
    })
    .await?;
    if yes {
        update.download_and_install(|_, _| {}, || {}).await?;
        app.restart();
    }
    Ok(())
}

fn main() {
    // Disable web security in WebView2 so YouTube API calls & googlevideo streams
    // work on desktop identically to native Android HTTP without CORS blocking.
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--disable-web-security --allow-running-insecure-content --autoplay-policy=no-user-gesture-required",
    );

    let mut builder = tauri::Builder::default()
        // Opening SONIQ again focuses the running window instead of a second copy.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init());

    let updates = UPDATER_PUBKEY.map(|k| !k.trim().is_empty()).unwrap_or(false);
    if updates {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(move |app| {
            if updates {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    // A failed check (offline, GitHub down) is not worth bothering the user.
                    let _ = check_for_update(handle).await;
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SONIQ");
}
