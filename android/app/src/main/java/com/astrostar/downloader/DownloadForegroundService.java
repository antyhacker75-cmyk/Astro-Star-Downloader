package com.astrostar.downloader;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Foreground service that performs a download and shows a determinate
 * progress bar + percentage in the system notification.
 *
 * Intent contract
 * ---------------
 * ACTION_START   extras: url, path, title, id
 * ACTION_UPDATE  extras: id, downloaded, total, speed (optional)
 * ACTION_CANCEL  extras: id
 * ACTION_FINISH  extras: id, success, message
 */
public class DownloadForegroundService extends Service {

    private static final String TAG = "DownloadFgService";

    public static final String CHANNEL_ID   = "astrostar_downloads";
    public static final String CHANNEL_NAME = "Downloads";
    public static final String CHANNEL_DESC = "Download progress notifications";

    public static final String ACTION_START  = "com.astrostar.downloader.START";
    public static final String ACTION_UPDATE = "com.astrostar.downloader.UPDATE";
    public static final String ACTION_CANCEL = "com.astrostar.downloader.CANCEL";
    public static final String ACTION_FINISH = "com.astrostar.downloader.FINISH";

    public static final String EXTRA_URL        = "url";
    public static final String EXTRA_PATH       = "path";
    public static final String EXTRA_TITLE      = "title";
    public static final String EXTRA_ID         = "id";
    public static final String EXTRA_DOWNLOADED = "downloaded";
    public static final String EXTRA_TOTAL      = "total";
    public static final String EXTRA_SPEED      = "speed";
    public static final String EXTRA_SUCCESS    = "success";
    public static final String EXTRA_MESSAGE    = "message";

    private NotificationManager notificationManager;
    private ExecutorService executor;
    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    private int  currentNotificationId = 1001;
    private long lastUpdateTime       = 0L;
    private static final long MIN_UPDATE_INTERVAL_MS = 250L;

    // ---------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------

    @Override
    public void onCreate() {
        super.onCreate();
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        createNotificationChannel();
        executor = Executors.newSingleThreadExecutor();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) {
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        int id = intent.getIntExtra(EXTRA_ID, currentNotificationId);

        switch (action) {
            case ACTION_START:
                currentNotificationId = id;
                cancelled.set(false);
                startForegroundInternal(intent, id);
                break;

            case ACTION_UPDATE: {
                long downloaded = intent.getLongExtra(EXTRA_DOWNLOADED, 0L);
                long total      = intent.getLongExtra(EXTRA_TOTAL, 0L);
                String speed    = intent.getStringExtra(EXTRA_SPEED);
                updateProgressNotification(id, downloaded, total, speed, null);
                break;
            }

            case ACTION_CANCEL:
                cancelled.set(true);
                cancelNotification(id);
                stopSelf();
                break;

            case ACTION_FINISH: {
                boolean success = intent.getBooleanExtra(EXTRA_SUCCESS, true);
                String  message = intent.getStringExtra(EXTRA_MESSAGE);
                finishNotification(id, success, message);
                stopSelf();
                break;
            }
        }

        return START_NOT_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        if (executor != null) executor.shutdownNow();
        super.onDestroy();
    }

    // ---------------------------------------------------------------
    // Notification channel
    // ---------------------------------------------------------------

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel existing =
                    notificationManager.getNotificationChannel(CHANNEL_ID);
            if (existing != null) return;

            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription(CHANNEL_DESC);
            channel.setShowBadge(false);
            channel.enableLights(false);
            channel.enableVibration(false);
            channel.setSound(null, null);
            notificationManager.createNotificationChannel(channel);
        }
    }

    // ---------------------------------------------------------------
    // Start
    // ---------------------------------------------------------------

    private void startForegroundInternal(Intent intent, int id) {
        final String url   = intent.getStringExtra(EXTRA_URL);
        final String path  = intent.getStringExtra(EXTRA_PATH);
        final String title = intent.getStringExtra(EXTRA_TITLE);

        Notification initial = buildProgressNotification(
                id,
                title != null ? title : "Downloading",
                0, 0, null, true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(id, initial, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(id, initial);
        }

        // If a URL was supplied, run the internal download loop.
        // If not, the caller drives updates via ACTION_UPDATE.
        if (url != null && path != null) {
            executor.execute(() -> downloadFile(url, path, title, id));
        }
    }

    // ---------------------------------------------------------------
    // Progress notification
    // ---------------------------------------------------------------

    private Notification buildProgressNotification(int id, String title,
                                                   long downloaded, long total,
                                                   String speed, boolean indeterminate) {
        NotificationCompat.Builder builder =
                new NotificationCompat.Builder(this, CHANNEL_ID)
                        .setSmallIcon(android.R.drawable.stat_sys_download)
                        .setContentTitle(title != null ? title : "Downloading")
                        .setOngoing(true)
                        .setOnlyAlertOnce(true)
                        .setPriority(NotificationCompat.PRIORITY_LOW)
                        .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                        .setShowWhen(false);

        // Cancel action
        Intent cancelIntent = new Intent(this, DownloadForegroundService.class);
        cancelIntent.setAction(ACTION_CANCEL);
        cancelIntent.putExtra(EXTRA_ID, id);
        PendingIntent cancelPi = PendingIntent.getService(
                this, id + 1000, cancelIntent, pendingIntentFlags());
        builder.addAction(android.R.drawable.ic_menu_close_clear_cancel,
                "Cancel", cancelPi);

        if (indeterminate || total <= 0) {
            builder.setProgress(0, 0, true);
            builder.setContentText(speed != null ? speed : "Starting…");
        } else {
            int percent = (int) Math.min(100L, (downloaded * 100L) / total);

            // This is what draws the line + shows the %
            builder.setProgress(100, percent, false);

            String progressText = percent + "%  •  "
                    + formatBytes(downloaded) + " / " + formatBytes(total);
            if (speed != null && !speed.isEmpty()) {
                progressText += "  •  " + speed;
            }
            builder.setContentText(progressText);
            builder.setSubText(percent + "%");
        }

        return builder.build();
    }

    private void updateProgressNotification(int id, long downloaded, long total,
                                            String speed, String title) {
        long now = System.currentTimeMillis();
        boolean finished = (total > 0 && downloaded >= total);
        if (!finished && now - lastUpdateTime < MIN_UPDATE_INTERVAL_MS) return;
        lastUpdateTime = now;

        Notification n = buildProgressNotification(
                id,
                title != null ? title : "Downloading",
                downloaded, total, speed, false);

        notificationManager.notify(id, n);
    }

    private void finishNotification(int id, boolean success, String message) {
        NotificationCompat.Builder builder =
                new NotificationCompat.Builder(this, CHANNEL_ID)
                        .setSmallIcon(success
                                ? android.R.drawable.stat_sys_download_done
                                : android.R.drawable.stat_notify_error)
                        .setContentTitle(success ? "Download complete" : "Download failed")
                        .setContentText(message != null ? message
                                : (success ? "Saved to device" : "Something went wrong"))
                        .setAutoCancel(true)
                        .setOngoing(false)
                        .setOnlyAlertOnce(true)
                        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                        .setProgress(0, 0, false);

        notificationManager.notify(id, builder.build());
    }

    private void cancelNotification(int id) {
        NotificationCompat.Builder builder =
                new NotificationCompat.Builder(this, CHANNEL_ID)
                        .setSmallIcon(android.R.drawable.stat_sys_download)
                        .setContentTitle("Download cancelled")
                        .setContentText("Tap to retry")
                        .setAutoCancel(true)
                        .setOngoing(false)
                        .setProgress(0, 0, false);
        notificationManager.notify(id, builder.build());
    }

    private int pendingIntentFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return flags;
    }

    // ---------------------------------------------------------------
    // Internal HTTP download loop
    // ---------------------------------------------------------------

    private void downloadFile(String urlStr, String destPath, String title, int id) {
        HttpURLConnection conn = null;
        InputStream input = null;
        FileOutputStream output = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setInstanceFollowRedirects(true);
            conn.connect();

            int responseCode = conn.getResponseCode();
            if (responseCode < 200 || responseCode >= 300) {
                throw new Exception("HTTP " + responseCode);
            }

            long total = conn.getContentLengthLong();
            if (total <= 0) total = -1;

            File out = new File(destPath);
            File parent = out.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();

            input  = new BufferedInputStream(conn.getInputStream(), 8192);
            output = new FileOutputStream(out);

            byte[] buffer = new byte[8192];
            long downloaded = 0L;
            long bytesSinceLastUpdate = 0L;
            long lastSpeedUpdate = System.currentTimeMillis();

            int read;
            while ((read = input.read(buffer)) != -1) {
                if (cancelled.get()) throw new Exception("Cancelled");

                output.write(buffer, 0, read);
                downloaded += read;
                bytesSinceLastUpdate += read;

                long now = System.currentTimeMillis();
                if (now - lastSpeedUpdate >= 500) {
                    double secs = (now - lastSpeedUpdate) / 1000.0;
                    double bps  = bytesSinceLastUpdate / secs;
                    String speed = formatBytes((long) bps) + "/s";
                    updateProgressNotification(id, downloaded, total, speed, title);
                    bytesSinceLastUpdate = 0L;
                    lastSpeedUpdate = now;
                }
            }
            output.flush();

            Intent finish = new Intent(this, DownloadForegroundService.class);
            finish.setAction(ACTION_FINISH);
            finish.putExtra(EXTRA_ID, id);
            finish.putExtra(EXTRA_SUCCESS, true);
            finish.putExtra(EXTRA_MESSAGE, new File(destPath).getName());
            onStartCommand(finish, 0, 0);

        } catch (Exception e) {
            Log.e(TAG, "Download failed", e);
            Intent finish = new Intent(this, DownloadForegroundService.class);
            finish.setAction(ACTION_FINISH);
            finish.putExtra(EXTRA_ID, id);
            finish.putExtra(EXTRA_SUCCESS, false);
            finish.putExtra(EXTRA_MESSAGE, e.getMessage());
            onStartCommand(finish, 0, 0);
        } finally {
            try { if (output != null) output.close(); } catch (Exception ignored) {}
            try { if (input  != null) input.close();  } catch (Exception ignored) {}
            if (conn != null) conn.disconnect();
        }
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    private static String formatBytes(long bytes) {
        if (bytes < 1024) return bytes + " B";
        double kb = bytes / 1024.0;
        if (kb < 1024) return String.format(Locale.US, "%.1f KB", kb);
        double mb = kb / 1024.0;
        if (mb < 1024) return String.format(Locale.US, "%.2f MB", mb);
        double gb = mb / 1024.0;
        return String.format(Locale.US, "%.2f GB", gb);
    }

    // ---------------------------------------------------------------
    // Static helper for other classes to push progress updates
    // ---------------------------------------------------------------

    public static void pushProgress(Context ctx, int id,
                                    long downloaded, long total, String speed) {
        Intent i = new Intent(ctx, DownloadForegroundService.class);
        i.setAction(ACTION_UPDATE);
        i.putExtra(EXTRA_ID, id);
        i.putExtra(EXTRA_DOWNLOADED, downloaded);
        i.putExtra(EXTRA_TOTAL, total);
        if (speed != null) i.putExtra(EXTRA_SPEED, speed);
        ContextCompat.startForegroundService(ctx, i);
    }
}
