package com.maranata.indoor;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// Reabre o player automaticamente quando o aparelho liga — signage fica sozinho,
// se houver queda de energia ele volta a tocar sem ninguém precisar tocar nele.
// Pedido: ao ligar o box, AGUARDAR 2 minutos antes de abrir o app (dá tempo da
// rede/sistema subirem). Por isso só agendamos o alarme aqui, não abrimos já.
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        if (action.equals(Intent.ACTION_BOOT_COMPLETED)
                || action.equals("android.intent.action.QUICKBOOT_POWERON")) {
            RestartReceiver.schedule(context); // abre daqui a 2 minutos
        }
    }
}
