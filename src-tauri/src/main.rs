// SONIQ for Windows: a small native window (WebView2) around the same app as the phone
// (Expo web build in dist-web/). No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

/// Updater public key, baked in at build time by CI (secret TAURI_UPDATER_PUBKEY).
/// Builds without it simply have no auto-update.
const UPDATER_PUBKEY: Option<&str> = option_env!("SONIQ_UPDATER_PUBKEY");

type BoxError = Box<dyn std::error::Error + Send + Sync>;

// ---- Native YouTube Fetch (bypasses browser CORS & bot-detection) ----

#[derive(serde::Serialize)]
struct FetchResponse {
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
    body: String,
}

#[tauri::command]
async fn yt_fetch(
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
) -> Result<FetchResponse, String> {
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| e.to_string())?;

    let method = match method.as_deref().unwrap_or("GET") {
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "HEAD" => reqwest::Method::HEAD,
        _ => reqwest::Method::GET,
    };

    let mut req = client.request(method, &url);

    if let Some(headers) = headers {
        for (k, v) in headers {
            // Strip browser Origin and Referer headers so YouTube doesn't block with 403
            if k.eq_ignore_ascii_case("origin") || k.eq_ignore_ascii_case("referer") {
                continue;
            }
            if let (Ok(name), Ok(val)) = (
                reqwest::header::HeaderName::from_bytes(k.as_bytes()),
                reqwest::header::HeaderValue::from_str(&v),
            ) {
                req = req.header(name, val);
            }
        }
    }

    if let Some(body_str) = body {
        req = req.body(body_str);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;

    let status = resp.status().as_u16();
    let status_text = resp.status().canonical_reason().unwrap_or("").to_string();

    let mut out_headers = HashMap::new();
    for (k, v) in resp.headers() {
        if let Ok(val_str) = v.to_str() {
            out_headers.insert(k.as_str().to_string(), val_str.to_string());
        }
    }

    let body_bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let body_str = String::from_utf8_lossy(&body_bytes).to_string();

    Ok(FetchResponse {
        status,
        status_text,
        headers: out_headers,
        body: body_str,
    })
}

// ---- Auto-update ----

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
    // Disable web security in WebView2 for smooth local streaming
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--disable-web-security --allow-running-insecure-content --autoplay-policy=no-user-gesture-required",
    );

    let mut builder = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![yt_fetch])
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
