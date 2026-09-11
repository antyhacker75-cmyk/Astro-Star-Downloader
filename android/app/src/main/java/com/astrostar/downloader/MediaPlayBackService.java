package com.astrostar.downloader;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MediaPlaybackService extends Service {
    private static final String TAG = "AstroStarMedia";
    private static final String CHANNEL_ID = "astrostar_media_playback";
    private static final int NOTIFICATION_ID = 2001;

    public static final String ACTION_UPDATE = "com.astrostar.downloader.MEDIA_UPDATE";
    public static final String ACTION_STOP = "com.astrostar.downloader.MEDIA_STOP";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_ARTWORK = "artwork";
    public static final String EXTRA_IS_PLAYING = "isPlaying";
    public static final String EXTRA_ACTION = "mediaAction";

    private MediaSessionCompat mediaSession;
    private String title = "AstroStar";
    private String artist = "";
    private String artworkUrl = "";
    private boolean isPlaying = false;
    private Bitmap artworkBitmap = null;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        mediaSession = new MediaSessionCompat(this, "AstroStarSession");
        mediaSession.setActive(true);
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                broadcastAction("play");
                isPlaying = true;
                updateNotification();
            }

            @Override
            public void onPause() {
                broadcastAction("pause");
                isPlaying = false;
                updateNotification();
            }

            @Override
            public void onSkipToNext() {
                broadcastAction("next");
            }

            @Override
            public void onSkipToPrevious() {
                broadcastAction("previous");
            }

            @Override
            public void onSeekTo(long pos) {
                broadcastAction("seek:" + (pos / 1000));
            }

            @Override
            public void onStop() {
                broadcastAction("stop");
                stopForeground(true);
                stopSelf();
            }
        });
    }

    private void broadcastAction(String action) {
        Intent intent = new Intent("astrostar_media_action");
        intent.putExtra("action", action);
        sendBroadcast(intent);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_STOP.equals(action)) {
                stopForeground(true);
                stopSelf();
                return START_NOT_STICKY;
            }

            if (intent.hasExtra(EXTRA_TITLE)) title = intent.getStringExtra(EXTRA_TITLE);
            if (intent.hasExtra(EXTRA_ARTIST)) artist = intent.getStringExtra(EXTRA_ARTIST);
            if (intent.hasExtra(EXTRA_ARTWORK)) {
                String newArtwork = intent.getStringExtra(EXTRA_ARTWORK);
                if (newArtwork != null && !newArtwork.equals(artworkUrl)) {
                    artworkUrl = newArtwork;
                    artworkBitmap = null;
                    if (artworkUrl != null && !artworkUrl.isEmpty() && artworkUrl.startsWith("http")) {
                        new Thread(() -> {
                            Bitmap bmp = loadBitmap(artworkUrl);
                            if (bmp != null) {
                                artworkBitmap = bmp;
                                updateNotification();
                            }
                        }).start();
                    }
                }
            }
            if (intent.hasExtra(EXTRA_IS_PLAYING)) {
                isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false);
            }
        }

        Notification notification = buildNotification();
        startForeground(NOTIFICATION_ID, notification);
        return START_NOT_STICKY;
    }

    private void updateNotification() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(NOTIFICATION_ID, buildNotification());
            }
        } catch (Exception e) {
            Log.e(TAG, "updateNotification failed", e);
        }
    }

    private Notification buildNotification() {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        int playPauseIcon = isPlaying
                ? android.R.drawable.ic_media_pause
                : android.R.drawable.ic_media_play;

        MediaMetadataCompat metadata = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, 0)
                .build();
        mediaSession.setMetadata(metadata);

        PlaybackStateCompat state = new PlaybackStateCompat.Builder()
                .setActions(
                        PlaybackStateCompat.ACTION_PLAY |
                        PlaybackStateCompat.ACTION_PAUSE |
                        PlaybackStateCompat.ACTION_PLAY_PAUSE |
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                        PlaybackStateCompat.ACTION_SEEK_TO |
                        PlaybackStateCompat.ACTION_STOP)
                .setState(
                        isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                        0, 1.0f)
                .build();
        mediaSession.setPlaybackState(state);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(title)
                .setContentText(artist)
                .setContentIntent(contentIntent)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(isPlaying)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .addAction(android.R.drawable.ic_media_previous, "Previous",
                        buildActionPendingIntent("previous"))
                .addAction(playPauseIcon, isPlaying ? "Pause" : "Play",
                        buildActionPendingIntent(isPlaying ? "pause" : "play"))
                .addAction(android.R.drawable.ic_media_next, "Next",
                        buildActionPendingIntent("next"));

        if (artworkBitmap != null) {
            builder.setLargeIcon(artworkBitmap);
        }

        androidx.media.app.NotificationCompat.MediaStyle style =
                new androidx.media.app.NotificationCompat.MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2);
        builder.setStyle(style);

        return builder.build();
    }

    private PendingIntent buildActionPendingIntent(String action) {
        Intent intent = new Intent("astrostar_media_action");
        intent.putExtra("action", action);
        intent.setPackage(getPackageName());
        return PendingIntent.getBroadcast(
                this,
                action.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Bitmap loadBitmap(String urlStr) {
        try {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setDoInput(true);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.connect();
            InputStream is = conn.getInputStream();
            Bitmap bmp = BitmapFactory.decodeStream(is);
            is.close();
            return bmp;
        } catch (Exception e) {
            Log.w(TAG, "loadBitmap failed: " + e.getMessage());
            return null;
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "AstroStar Playback",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Media playback controls");
            channel.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    @Override
    public void onDestroy() {
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
