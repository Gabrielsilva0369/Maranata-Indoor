package com.maranata.indoor;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;

/**
 * Reabre o app via AlarmManager. Usado para:
 *  • Boot: o BootReceiver agenda a 1ª abertura para +2 minutos.
 *  • App fechado: a MainActivity agenda a reabertura para +2 minutos ao sair de
 *    foco (e cancela ao voltar) — se ficar 2 min fora, reabre sozinho.
 */
public class RestartReceiver extends BroadcastReceiver {

    // Espera de 2 minutos pedida para boot e para reabertura.
    public static final long DELAY_MS = 2 * 60 * 1000L;
    private static final int REQ = 4271;

    @Override
    public void onReceive(Context context, Intent intent) {
        Intent launch = new Intent(context, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try {
            context.startActivity(launch);
        } catch (Exception e) {
            // Em Android 10+ o início de Activity em background pode ser bloqueado
            // sem a permissão "Sobrepor a outros apps". Não há o que fazer aqui.
        }
    }

    private static PendingIntent pendingIntent(Context ctx) {
        Intent i = new Intent(ctx, RestartReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, REQ, i, flags);
    }

    /** Agenda a (re)abertura do app daqui a 2 minutos. */
    public static void schedule(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        long when = SystemClock.elapsedRealtime() + DELAY_MS;
        // setAndAllowWhileIdle: dispara mesmo em doze e NÃO exige a permissão de
        // alarme exato (SCHEDULE_EXACT_ALARM) do Android 12+. 2 min não precisa
        // ser cravado no segundo.
        if (Build.VERSION.SDK_INT >= 23) {
            am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, when, pendingIntent(ctx));
        } else {
            am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, when, pendingIntent(ctx));
        }
    }

    /** Cancela uma reabertura agendada (chamado quando o app volta ao foco). */
    public static void cancel(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(pendingIntent(ctx));
    }
}
