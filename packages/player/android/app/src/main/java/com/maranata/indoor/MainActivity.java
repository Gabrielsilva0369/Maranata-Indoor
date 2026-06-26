package com.maranata.indoor;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int REQ_OVERLAY = 4272;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            startActivityForResult(
                new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName())),
                REQ_OVERLAY);
        }

        if (!isAccessibilityEnabled()) {
            startActivityForResult(
                new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS), REQ_OVERLAY);
        }

        // Tela sempre ligada — signage não pode apagar/dormir.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Mostra por cima da tela de bloqueio, se houver.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);

        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            // Permite autoplay de vídeo/live COM som sem gesto do usuário.
            // (Não dá pra contornar isso por JS — precisa ser nativo.)
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
            // Aceleração por GPU — vídeo fluido em box fraco.
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemBars();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        hideSystemBars();
        // App está em foco → cancela qualquer reabertura agendada.
        RestartReceiver.cancel(this);
    }

    @Override
    public void onPause() {
        super.onPause();
        // App saiu de foco (fechado/minimizado/morto): agenda reabertura em 2 min.
        // Se voltar antes disso, o onResume cancela. Assim, se ficar fechado 2 min,
        // ele reabre sozinho.
        RestartReceiver.schedule(this);
    }

    // Modo imersivo: esconde barra de status e de navegação (tela cheia total).
    private boolean isAccessibilityEnabled() {
        try {
            int enabled = Settings.Secure.getInt(getContentResolver(),
                    Settings.Secure.ACCESSIBILITY_ENABLED);
            if (enabled != 1) return false;
            String services = Settings.Secure.getString(getContentResolver(),
                    Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            return services != null && services.contains(getPackageName());
        } catch (Settings.SettingNotFoundException e) {
            return false;
        }
    }

    private void hideSystemBars() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }
}
