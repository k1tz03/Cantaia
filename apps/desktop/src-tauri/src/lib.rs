// Cantaia Desktop — Core Application Logic (Tauri v2)
//
// Architecture : WebView → https://cantaia.io (production)
//   Dev        : WebView → http://localhost:3000
//
// Fonctionnalités natives :
//   • System tray (clic pour ouvrir, menu Ouvrir/MAJ/Quitter)
//   • Auto-updater via GitHub Releases
//   • Dialog de sauvegarde natif Windows (export PDF/XLSX)
//   • Notification système pour les mises à jour disponibles

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;

// ─── Commandes Tauri (invokeables depuis le frontend JS) ─────────────────────

/// Sauvegarde un fichier via le dialog natif Windows.
/// Appelé depuis apps/web/src/lib/tauri.ts → saveFileWithDialog()
#[tauri::command]
async fn save_file(
    filename: String,
    content: Vec<u8>,
    app: AppHandle,
) -> Result<String, String> {
    let path = app
        .dialog()
        .file()
        .set_file_name(&filename)
        .blocking_save_file();

    match path {
        Some(file_path) => {
            let path_string = file_path.to_string();
            std::fs::write(&path_string, &content).map_err(|e| e.to_string())?;
            Ok(path_string)
        }
        None => Err("Annulé".to_string()),
    }
}

/// Vérifie manuellement les mises à jour et notifie si disponible.
#[tauri::command]
async fn check_for_updates(app: AppHandle) -> Result<bool, String> {
    do_check_updates(&app).await.map_err(|e| e.to_string())
}

/// Retourne la version actuelle de l'application.
#[tauri::command]
fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

// ─── Logique de mise à jour ──────────────────────────────────────────────────

async fn do_check_updates(
    app: &AppHandle,
) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    // Si la pubkey n'est pas configurée (dev sans clé), l'updater retourne une erreur
    let updater = match app.updater() {
        Ok(u) => u,
        Err(_) => return Ok(false), // Pas de pubkey configurée
    };

    match updater.check().await? {
        Some(update) => {
            let version = update.version.clone();
            let _ = app
                .notification()
                .builder()
                .title("Mise à jour disponible")
                .body(&format!(
                    "Cantaia {} est disponible. Téléchargez la mise à jour depuis le menu.",
                    version
                ))
                .show();
            Ok(true)
        }
        None => Ok(false),
    }
}

fn check_updates_on_startup(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let _ = do_check_updates(&app).await;
    });
}

// ─── System Tray ─────────────────────────────────────────────────────────────

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let open_i = MenuItem::with_id(app, "open", "Ouvrir Cantaia", true, None::<&str>)?;
    let update_i =
        MenuItem::with_id(app, "update", "Vérifier les mises à jour", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open_i, &update_i, &sep, &quit_i])?;

    let icon = app
        .default_window_icon()
        .ok_or("Icône introuvable — exécutez `pnpm tauri icon` pour générer les icônes")?
        .clone();

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .menu_on_left_click(false)
        .tooltip("Cantaia — Gestion de chantier")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "update" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = do_check_updates(&handle).await;
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Clic gauche sur l'icône → afficher la fenêtre principale
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

// ─── Point d'entrée ─────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            save_file,
            check_for_updates,
            get_app_version,
        ])
        .setup(|app| {
            setup_tray(app)?;
            check_updates_on_startup(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Cantaia");
}
