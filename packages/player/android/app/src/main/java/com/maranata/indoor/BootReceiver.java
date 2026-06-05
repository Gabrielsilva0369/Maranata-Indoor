package com.maranata.indoor;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// Reabre o player automaticamente quando o aparelho liga — signage fica sozinho,
// se houver queda de energia ele volta a tocar sem ninguém precisar tocar nele.
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        if (action.equals(Intent.ACTION_BOOT_COMPLETED)
                || action.equals("android.intent.action.QUICKBOOT_POWERON")) {
            Intent launch = new Intent(context, MainActivity.class);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(launch);
        }
    }
}
