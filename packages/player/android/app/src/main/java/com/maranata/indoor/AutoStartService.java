package com.maranata.indoor;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;

/**
 * Serviço de acessibilidade "fantasma" — não processa nenhum evento.
 * O Android reinicia automaticamente todos os serviços de acessibilidade
 * habilitados após o boot, sem depender de BOOT_COMPLETED.
 * Ao iniciar, agenda a abertura do app via RestartReceiver (+2 min).
 */
public class AutoStartService extends AccessibilityService {

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        RestartReceiver.schedule(this);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
    }

    @Override
    public void onInterrupt() {
    }
}
