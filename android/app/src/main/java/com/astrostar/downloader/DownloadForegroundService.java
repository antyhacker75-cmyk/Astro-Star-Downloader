package com.astrostar.downloader;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

import java.util.Locale;

/**
 * Foreground service that displays a live download progress bar and
 * percentage in the system notification.
 *
 * Called from JS via MainActivity.AstroStarMainBridge:
 *   - startDownloadService(title)         → shows indeterminate bar
 *   - updateDownloadProgress(dl, tot, spd)→ updates bar + %
 *   - stopDownloadService()               → removes notification
 */
public class DownloadForegroundService extends Service {

    private static final String TAG = "DownloadFgService";
    private static final String CHANNEL_ID = "astrostar_download_channel";
    private static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_START  = "com.astrostar.downloader.START_DOWNLOAD";
    public static final String ACTION_UPDATE = "com.astrostar.downloader.UPDATE_DOWNLOAD";
    public static final String ACTION_STOP   = "com.astrostar.downloader.STOP_DOWNLOAD";

    public static final String EXTRA_TITLE      = "title";
    public static final String EXTRA_DOWNLOADED = "downloaded";
    public static final String EXTRA_TOTAL      = "total";
    public static final String EXTRA_SPEED      = "speed";

    private static final long MIN_UPDATE_INTERVAL_MS = 200L;

    private String  currentTitle = "Downloading Media...";
    private long    lastUpdateTime = 0L;
    private boolean isForeground = false;

    // ============================================================
    // Static helper so MainActivity can push updates easily
    // ============================================================

    public static void pushProgress(Context ctx, long downloaded, long total, String speed) {
        Intent i = new Intent(ctx, DownloadForegroundService.class);
        i.setAction(ACTION_UPDATE);
        i.putExtra(EXTRA_DOWNLOADED, downloaded);
        i.putExtra(EXTRA_TOTAL, total);
        if (speed != null) i.putExtra(EXTRA_SPEED, speed);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(i);
        } else {
            ctx.startService(i);
        }
    }

    // ============================================================
    // Lifecycle
    // ============================================================

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = (intent != null && intent.getAction() != null)
                ? intent.getAction()
                : ACTION_START;

        switch (action) {

            case ACTION_UPDATE: {
                long downloaded = intent.getLongExtra(EXTRA_DOWNLOADED, 0L);
                long total      = intent.getLongExtra(EXTRA_TOTAL, 0L);
                String speed    = intent.getStringExtra(EXTRA_SPEED);
                long now = System.currentTimeMillis();
                boolean finished = (total > 0 && downloaded >= total);
                if (!finished && (now - lastUpdateTime) < MIN_UPDATE_INTERVAL_MS) {
                    break;
                }
                lastUpdateTime = now;
                updateNotification(downloaded, total, speed, false);
                break;
            }

            case ACTION_STOP: {
                stopForeground(true);
                stopSelf();
                return START_NOT_STICKY;
            }

            case ACTION_START:
            default: {
                if (intent != null && intent.hasExtra(EXTRA_TITLE)) {
                    String t = intent.getStringExtra(EXTRA_TITLE);
                    if (t != null && !t.isEmpty()) currentTitle = t;
                }
                updateNotification(0, 0, null, true);
                break;
            }
        }

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        stopForeground(true);
        isForeground = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ============================================================
    // Notification builder
    // ============================================================

    private void updateNotification(long downloaded, long total,
                                    String speed, boolean indeterminate) {

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Astro Star Downloader")
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        if (indeterminate || total <= 0) {
            b.setContentText(currentTitle != null ? currentTitle : "Starting…");
            b.setProgress(0, 0, true);
        } else {
            int percent = (int) Math.min(100L, (downloaded * 100L) / total);
            String text = percent + "%  •  "
                    + formatBytes(downloaded) + " / " + formatBytes(total);
            if (speed != null && !speed.isEmpty()) {
                text += "  •  " + speed;
            }
            b.setContentText(text);
            b.setProgress(100, percent, false);
            b.setSubText(percent + "%");
        }

        Notification n = b.build();
        promoteOrUpdate(n);
    }

    /**
     * First call promotes the service to foreground (mandatory on Android 8+).
     * Later calls just update the existing notification.
     */
    private void promoteOrUpdate(Notification n) {
        if (!isForeground) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, n,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
            isForeground = true;
        } else {
            NotificationManager nm =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICATION_ID, n);
        }
    }

    // ============================================================
    // Channel
    // ============================================================

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Astro Star Background Download",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Shows live download progress");
            channel.setShowBadge(false);
            channel.enableLights(false);
            channel.enableVibration(false);
            channel.setSound(null, null);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    // ============================================================
    // Helpers
    // ============================================================

    private static String formatBytes(long bytes) {
        if (bytes < 1024) return bytes + " B";
        double kb = bytes / 1024.0;
        if (kb < 1024) return String.format(Locale.US, "%.1f KB", kb);
        double mb = kb / 1024.0;
        if (mb < 1024) return String.format(Locale.US, "%.2f MB", mb);
        double gb = mb / 1024.0;
        return String.format(Locale.US, "%.2f GB", gb);
    }
}
