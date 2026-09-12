package com.astrostar.downloader;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
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
    private static final String CHANNEL_ID = "astrostar_media_channel";
    private static final int NOTIFICATION_ID = 8520;

    public static final String ACTION_PLAY = "com.astrostar.downloader.PLAY";
    public static final String ACTION_PAUSE = "com.astrostar.downloader.PAUSE";
    public static final String ACTION_STOP = "com.astrostar.downloader.STOP";
    public static final String ACTION_LOAD = "com.astrostar.downloader.LOAD";

    public static final String EXTRA_URL = "url";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_ARTWORK = "artwork";

    private MediaPlayer mediaPlayer;
    private MediaSessionCompat mediaSession;
    private Handler progressHandler;
    private Runnable progressRunnable;
    private Bitmap artworkBitmap;

    private String currentUrl = "";
    private String title = "AstroStar";
    private String artist = "AstroStar";
    private String artworkUrl = "";
    private boolean isPrepared = false;
    private long durationMs = 0;
    private boolean isPlaying = false;

    private BroadcastReceiver noisyReceiver;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        setupMediaSession();
        progressHandler = new Handler(Looper.getMainLooper());

        noisyReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (mediaPlayer != null && mediaPlayer.isPlaying()) {
                    pausePlayback();
                }
            }
        };
        IntentFilter filter = new IntentFilter(android.media.AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        registerReceiver(noisyReceiver, filter);
    }

    private void setupMediaSession() {
        mediaSession = new MediaSessionCompat(this, "AstroStarSession");
        mediaSession.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS
                | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setActive(true);

        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                resumePlayback();
            }

            @Override
            public void onPause() {
                pausePlayback();
            }

            @Override
            public void onStop() {
                stopPlayback();
            }

            @Override
            public void onSeekTo(long pos) {
                seekTo((int) pos);
            }
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_NOT_STICKY;
        }
        String action = intent.getAction();
        if (action == null) action = ACTION_LOAD;

        switch (action) {
            case ACTION_LOAD: {
                String url = intent.getStringExtra(EXTRA_URL);
                title = intent.getStringExtra(EXTRA_TITLE) != null ? intent.getStringExtra(EXTRA_TITLE) : "AstroStar";
                artist = intent.getStringExtra(EXTRA_ARTIST) != null ? intent.getStringExtra(EXTRA_ARTIST) : "AstroStar";
                String newArt = intent.getStringExtra(EXTRA_ARTWORK);
                if (newArt != null && !newArt.equals(artworkUrl)) {
                    artworkUrl = newArt;
                    artworkBitmap = null;
                    if (!artworkUrl.isEmpty() && artworkUrl.startsWith("http")) {
                        new Thread(() -> {
                            Bitmap bmp = loadBitmap(artworkUrl);
                            if (bmp != null) {
                                artworkBitmap = bmp;
                                updateNotification();
                            }
                        }).start();
                    }
                }
                if (url != null && !url.isEmpty()) {
                    loadAndPlay(url);
                }
                break;
            }
            case ACTION_PLAY:
                resumePlayback();
                break;
            case ACTION_PAUSE:
                pausePlayback();
                break;
            case ACTION_STOP:
                stopPlayback();
                stopSelf();
                return START_NOT_STICKY;
        }

        startForeground(NOTIFICATION_ID, buildNotification());
        return START_NOT_STICKY;
    }

    private void loadAndPlay(String url) {
        try {
            if (mediaPlayer != null) {
                mediaPlayer.release();
                mediaPlayer = null;
            }

            // Normalize path
            String path = url;
            if (path.startsWith("file://")) path = path.substring(7);
            if (path.startsWith("content://")) {
                // leave as-is, MediaPlayer accepts content:// URIs
            } else if (!path.startsWith("http://") && !path.startsWith("https://")) {
                // local file path
                if (!path.startsWith("/")) path = "/" + path;
                path = "file://" + path;
            }

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .build());

            mediaPlayer.setDataSource(this, android.net.Uri.parse(path));
            mediaPlayer.setOnPreparedListener(mp -> {
                isPrepared = true;
                durationMs = mp.getDuration();
                mp.start();
                isPlaying = true;
                updateMediaSessionState();
                updateNotification();
                startProgressUpdates();
                notifyWebViewState();
            });
            mediaPlayer.setOnCompletionListener(mp -> {
                isPlaying = false;
                updateMediaSessionState();
                updateNotification();
                notifyWebViewState();
            });
            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "MediaPlayer error: " + what + "/" + extra);
                isPlaying = false;
                isPrepared = false;
                notifyWebViewState();
                return true;
            });
            mediaPlayer.prepareAsync();
        } catch (Exception e) {
            Log.e(TAG, "loadAndPlay failed", e);
        }
    }

    private void resumePlayback() {
        try {
            if (mediaPlayer != null && !mediaPlayer.isPlaying() && isPrepared) {
                mediaPlayer.start();
                isPlaying = true;
                updateMediaSessionState();
                updateNotification();
                startProgressUpdates();
                notifyWebViewState();
            }
        } catch (Exception e) { Log.e(TAG, "resumePlayback failed", e); }
    }

    private void pausePlayback() {
        try {
            if (mediaPlayer != null && mediaPlayer.isPlaying()) {
                mediaPlayer.pause();
                isPlaying = false;
                updateMediaSessionState();
                updateNotification();
                notifyWebViewState();
            }
        } catch (Exception e) { Log.e(TAG, "pausePlayback failed", e); }
    }

    private void stopPlayback() {
        try {
            if (mediaPlayer != null) {
                mediaPlayer.stop();
                mediaPlayer.release();
                mediaPlayer = null;
            }
            isPrepared = false;
            isPlaying = false;
            stopProgressUpdates();
            notifyWebViewState();
        } catch (Exception e) { Log.e(TAG, "stopPlayback failed", e); }
    }

    private void seekTo(int posMs) {
        try {
            if (mediaPlayer != null && isPrepared) {
                mediaPlayer.seekTo(posMs);
                updateNotification();
                notifyWebViewState();
            }
        } catch (Exception ignored) {}
    }

    private void startProgressUpdates() {
        stopProgressUpdates();
        progressRunnable = new Runnable() {
            @Override
            public void run() {
                if (mediaPlayer != null && isPrepared) {
                    try {
                        int pos = mediaPlayer.getCurrentPosition();
                        int dur = mediaPlayer.getDuration();
                        notifyWebViewProgress(pos, dur);
                    } catch (Exception ignored) {}
                    progressHandler.postDelayed(this, 500);
                }
            }
        };
        progressHandler.postDelayed(progressRunnable, 500);
    }

    private void stopProgressUpdates() {
        if (progressHandler != null && progressRunnable != null) {
            progressHandler.removeCallbacks(progressRunnable);
        }
        progressRunnable = null;
    }

    private void updateMediaSessionState() {
        if (mediaSession == null) return;
        int state = isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        long position = 0;
        try { if (mediaPlayer != null && isPrepared) position = mediaPlayer.getCurrentPosition(); } catch (Exception ignored) {}

        mediaSession.setPlaybackState(new PlaybackStateCompat.Builder()
                .setActions(PlaybackStateCompat.ACTION_PLAY
                        | PlaybackStateCompat.ACTION_PAUSE
                        | PlaybackStateCompat.ACTION_PLAY_PAUSE
                        | PlaybackStateCompat.ACTION_STOP
                        | PlaybackStateCompat.ACTION_SEEK_TO)
                .setState(state, position, 1.0f)
                .build());

        MediaMetadataCompat.Builder meta = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
        if (artworkBitmap != null) {
            meta.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artworkBitmap);
        }
        mediaSession.setMetadata(meta.build());
    }

    private Notification buildNotification() {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        PendingIntent pauseIntent = PendingIntent.getService(this, 1,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_PAUSE),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent playIntent = PendingIntent.getService(this, 2,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_PLAY),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stopIntent = PendingIntent.getService(this, 3,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_STOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(title)
                .setContentText(artist)
                .setContentIntent(contentIntent)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setOngoing(isPlaying)
                .setDeleteIntent(stopIntent)
                .setPriority(NotificationCompat.PRIORITY_LOW);

        if (artworkBitmap != null) {
            builder.setLargeIcon(artworkBitmap);
        }

        if (isPlaying) {
            builder.addAction(android.R.drawable.ic_media_pause, "Pause", pauseIntent);
        } else {
            builder.addAction(android.R.drawable.ic_media_play, "Play", playIntent);
        }

        androidx.media.app.NotificationCompat.MediaStyle style =
                new androidx.media.app.NotificationCompat.MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0);
        builder.setStyle(style);

        return builder.build();
    }

    private void updateNotification() {
        try {
            updateMediaSessionState();
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification());
        } catch (Exception ignored) {}
    }

    private void notifyWebViewState() {
        runOnWebViewJs("window.astroStarMediaState && window.astroStarMediaState({isPlaying:" + isPlaying + ",duration:" + durationMs + "})");
    }

    private void notifyWebViewProgress(int pos, int dur) {
        runOnWebViewJs("window.astroStarMediaProgress && window.astroStarMediaProgress(" + pos + "," + dur + ")");
    }

    private void runOnWebViewJs(final String js) {
        try {
            MainActivity activity = MainActivity.getInstance();
            if (activity != null && activity.getBridge() != null && activity.getBridge().getWebView() != null) {
                activity.runOnUiThread(() ->
                        activity.getBridge().getWebView().evaluateJavascript(js, null));
            }
        } catch (Exception ignored) {}
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
        } catch (Exception e) { return null; }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID,
                    "AstroStar Media Playback", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Media playback controls");
            ch.setShowBadge(false);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    @Override
    public void onDestroy() {
        try { unregisterReceiver(noisyReceiver); } catch (Exception ignored) {}
        stopProgressUpdates();
        if (mediaPlayer != null) { mediaPlayer.release(); mediaPlayer = null; }
        if (mediaSession != null) { mediaSession.setActive(false); mediaSession.release(); }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
