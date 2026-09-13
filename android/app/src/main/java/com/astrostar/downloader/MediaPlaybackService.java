package com.astrostar.downloader;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Media playback service with a full MediaSession.
 *
 * This is what makes the Spotify-style media card appear in:
 *   • Notification shade
 *   • Quick Settings (Android 13+)
 *   • Lock screen
 *   • Bluetooth / headset controls
 *
 * Public API matches MainActivity.AstroStarMainBridge:
 *   ACTION_LOAD   + EXTRA_URL / EXTRA_TITLE / EXTRA_ARTIST / EXTRA_ARTWORK
 *   ACTION_PLAY
 *   ACTION_PAUSE
 *   ACTION_STOP
 *   ACTION_PLAY  + EXTRA "seek" (int ms)
 */
public class MediaPlaybackService extends Service {

    private static final String TAG = "MediaPlaybackService";
    private static final String CHANNEL_ID = "astrostar_playback_channel";
    private static final int NOTIFICATION_ID = 2001;

    // Public action / extra names (must match MainActivity bridge)
    public static final String ACTION_LOAD   = "com.astrostar.downloader.MEDIA_LOAD";
    public static final String ACTION_PLAY   = "com.astrostar.downloader.MEDIA_PLAY";
    public static final String ACTION_PAUSE  = "com.astrostar.downloader.MEDIA_PAUSE";
    public static final String ACTION_STOP   = "com.astrostar.downloader.MEDIA_STOP";
    public static final String ACTION_SEEK   = "com.astrostar.downloader.MEDIA_SEEK";
    public static final String ACTION_NEXT   = "com.astrostar.downloader.MEDIA_NEXT";
    public static final String ACTION_PREV   = "com.astrostar.downloader.MEDIA_PREV";

    public static final String EXTRA_URL     = "url";
    public static final String EXTRA_TITLE   = "title";
    public static final String EXTRA_ARTIST  = "artist";
    public static final String EXTRA_ARTWORK = "artwork";
    public static final String EXTRA_SEEK    = "seek";

    // Playback
    private MediaPlayer mediaPlayer;
    private boolean isPrepared = false;
    private boolean isPlaying  = false;
    private int     durationMs = 0;

    // Session & audio
    private MediaSessionCompat mediaSession;
    private AudioManager        audioManager;
    private AudioFocusRequest   audioFocusRequest;

    // Threads & handler
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService artworkLoader = Executors.newSingleThreadExecutor();

    // Current track metadata
    private String currentUrl        = null;
    private String currentTitle      = "Astro Star";
    private String currentArtist     = "Unknown";
    private String currentArtworkUrl = null;
    private Bitmap currentArtwork    = null;

    // Keeps the PlaybackState position ticking so the seekbar animates
    private final Runnable positionTicker = new Runnable() {
        @Override public void run() {
            if (mediaPlayer != null && isPlaying) {
                try {
                    long pos = mediaPlayer.getCurrentPosition();
                    updatePlaybackState(PlaybackStateCompat.STATE_PLAYING, pos);
                } catch (Exception ignored) {}
                handler.postDelayed(this, 1000L);
            }
        }
    };

    // ============================================================
    // Lifecycle
    // ============================================================

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        setupAudioFocus();
        setupMediaSession();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            if (intent == null) return START_NOT_STICKY;
            String action = intent.getAction();
            if (action == null) return START_NOT_STICKY;

            switch (action) {
                case ACTION_LOAD: {
                    String url     = intent.getStringExtra(EXTRA_URL);
                    String title   = intent.getStringExtra(EXTRA_TITLE);
                    String artist  = intent.getStringExtra(EXTRA_ARTIST);
                    String artwork = intent.getStringExtra(EXTRA_ARTWORK);
                    loadTrack(url, title, artist, artwork);
                    break;
                }
                case ACTION_PLAY: {
                    // Support seek via the same ACTION_PLAY + "seek" extra
                    if (intent.hasExtra(EXTRA_SEEK)) {
                        int ms = intent.getIntExtra(EXTRA_SEEK, -1);
                        if (ms >= 0) { seekTo(ms); break; }
                    }
                    play();
                    break;
                }
                case ACTION_PAUSE:  pause();       break;
                case ACTION_SEEK: {
                    int ms = intent.getIntExtra(EXTRA_SEEK, -1);
                    if (ms >= 0) seekTo(ms);
                    break;
                }
                case ACTION_STOP:   stopPlayback(); stopSelf(); break;
                case ACTION_NEXT:
                case ACTION_PREV:
                    // Hook into your own playlist / queue here if you add one
                    break;
            }
        } catch (Exception e) {
            Log.e(TAG, "onStartCommand error", e);
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(positionTicker);
        if (mediaPlayer != null) {
            try { mediaPlayer.release(); } catch (Exception ignored) {}
            mediaPlayer = null;
        }
        if (mediaSession != null) {
            try {
                mediaSession.setActive(false);
                mediaSession.release();
            } catch (Exception ignored) {}
            mediaSession = null;
        }
        abandonAudioFocus();
        artworkLoader.shutdownNow();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ============================================================
    // MediaSession — the piece that makes the drawer card appear
    // ============================================================

    private void setupMediaSession() {
        mediaSession = new MediaSessionCompat(this, "AstroStarPlayback");
        mediaSession.setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);

        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay()             { play(); }
            @Override public void onPause()            { pause(); }
            @Override public void onStop()             { stopPlayback(); }
            @Override public void onSkipToNext()       { /* queue */ }
            @Override public void onSkipToPrevious()   { /* queue */ }
            @Override public void onSeekTo(long pos)   { seekTo((int) pos); }
        });

        // Initial state so the system knows the app can play media
        mediaSession.setPlaybackState(
                new PlaybackStateCompat.Builder()
                        .setActions(
                                PlaybackStateCompat.ACTION_PLAY_PAUSE |
                                PlaybackStateCompat.ACTION_PLAY |
                                PlaybackStateCompat.ACTION_PAUSE |
                                PlaybackStateCompat.ACTION_STOP |
                                PlaybackStateCompat.ACTION_SEEK_TO |
                                PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
                        .setState(PlaybackStateCompat.STATE_NONE, 0, 1.0f)
                        .build());

        mediaSession.setActive(true);
    }

    private void updateMetadata() {
        if (mediaSession == null) return;

        MediaMetadataCompat.Builder b = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, currentArtist)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);

        if (currentArtwork != null) {
            b.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, currentArtwork);
            b.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, currentArtwork);
            b.putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, currentArtwork);
        }

        mediaSession.setMetadata(b.build());
    }

    private void updatePlaybackState(int state, long positionMs) {
        if (mediaSession == null) return;

        long actions = PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_PLAY
                | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_STOP
                | PlaybackStateCompat.ACTION_SEEK_TO
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS;

        // Speed matters: Android animates the seekbar from position + speed
        float speed = (state == PlaybackStateCompat.STATE_PLAYING) ? 1.0f : 0.0f;

        PlaybackStateCompat pb = new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, positionMs, speed)
                .build();

        mediaSession.setPlaybackState(pb);
    }

    private void updatePlaybackState(int state) {
        long pos = 0L;
        try { if (mediaPlayer != null) pos = mediaPlayer.getCurrentPosition(); }
        catch (Exception ignored) {}
        updatePlaybackState(state, pos);
    }

    // ============================================================
    // Audio focus
    // ============================================================

    private void setupAudioFocus() {
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();

            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attrs)
                    .setOnAudioFocusChangeListener(focusChange -> {
                        switch (focusChange) {
                            case AudioManager.AUDIOFOCUS_LOSS:
                            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                                pause();
                                break;
                            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                                // Optionally lower volume; we just pause for simplicity
                                break;
                        }
                    })
                    .build();
        }
    }

    private boolean requestAudioFocus() {
        if (audioManager == null) return true;
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            result = audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            result = audioManager.requestAudioFocus(
                    null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            try { audioManager.abandonAudioFocusRequest(audioFocusRequest); }
            catch (Exception ignored) {}
        } else {
            try { audioManager.abandonAudioFocus(null); }
            catch (Exception ignored) {}
        }
    }

    // ============================================================
    // Playback control
    // ============================================================

    private void loadTrack(String url, String title, String artist, String artwork) {
        if (url == null || url.isEmpty()) {
            Log.w(TAG, "loadTrack: empty url");
            return;
        }

        currentUrl        = url;
        currentTitle      = (title   != null && !title.isEmpty())   ? title   : "Astro Star";
        currentArtist     = (artist  != null && !artist.isEmpty())  ? artist  : "Unknown";
        currentArtworkUrl = artwork;
        currentArtwork    = null;
        durationMs        = 0;
        isPrepared        = false;
        isPlaying         = false;

        // Load artwork in the background
        if (artwork != null && !artwork.isEmpty()) {
            artworkLoader.execute(() -> {
                final Bitmap bmp = downloadBitmap(artwork);
                if (bmp != null) {
                    handler.post(() -> {
                        currentArtwork = bmp;
                        updateMetadata();
                        if (isPrepared) pushNotification();
                    });
                }
            });
        }

        // Kill any previous player
        if (mediaPlayer != null) {
            try { mediaPlayer.release(); } catch (Exception ignored) {}
            mediaPlayer = null;
        }

        // Immediate feedback: BUFFERING + metadata
        updateMetadata();
        updatePlaybackState(PlaybackStateCompat.STATE_BUFFERING, 0);

        // Show a notification immediately and go foreground
        startForegroundMedia();

        try {
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());
            mediaPlayer.setDataSource(url);

            mediaPlayer.setOnPreparedListener(mp -> {
                isPrepared = true;
                durationMs = mp.getDuration();
                updateMetadata();   // now with duration → seekbar shows up
                play();
            });

            mediaPlayer.setOnCompletionListener(mp -> {
                isPlaying = false;
                handler.removeCallbacks(positionTicker);
                updatePlaybackState(PlaybackStateCompat.STATE_STOPPED, durationMs);
                pushNotification();
            });

            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "MediaPlayer error what=" + what + " extra=" + extra);
                isPlaying  = false;
                isPrepared = false;
                updatePlaybackState(PlaybackStateCompat.STATE_ERROR);
                pushNotification();
                return true;
            });

            mediaPlayer.prepareAsync();

        } catch (Exception e) {
            Log.e(TAG, "loadTrack failed", e);
            updatePlaybackState(PlaybackStateCompat.STATE_ERROR);
            pushNotification();
        }
    }

    private void play() {
        if (mediaPlayer == null) return;
        if (!isPrepared) {
            // Called before prepare finished — just remember intent.
            return;
        }
        if (!requestAudioFocus()) return;
        try {
            mediaPlayer.start();
            isPlaying = true;
            updatePlaybackState(PlaybackStateCompat.STATE_PLAYING,
                    mediaPlayer.getCurrentPosition());
            pushNotification();
            handler.removeCallbacks(positionTicker);
            handler.post(positionTicker);
        } catch (Exception e) {
            Log.e(TAG, "play failed", e);
        }
    }

    private void pause() {
        if (mediaPlayer == null) return;
        try {
            if (mediaPlayer.isPlaying()) mediaPlayer.pause();
            isPlaying = false;
            handler.removeCallbacks(positionTicker);
            updatePlaybackState(PlaybackStateCompat.STATE_PAUSED,
                    mediaPlayer.getCurrentPosition());
            pushNotification();
        } catch (Exception e) {
            Log.e(TAG, "pause failed", e);
        }
    }

    private void seekTo(int ms) {
        if (mediaPlayer == null || !isPrepared) return;
        try {
            mediaPlayer.seekTo(ms);
            updatePlaybackState(
                    isPlaying ? PlaybackStateCompat.STATE_PLAYING
                              : PlaybackStateCompat.STATE_PAUSED,
                    ms);
        } catch (Exception ignored) {}
    }

    private void stopPlayback() {
        handler.removeCallbacks(positionTicker);
        if (mediaPlayer != null) {
            try {
                mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }
        isPlaying  = false;
        isPrepared = false;

        updatePlaybackState(PlaybackStateCompat.STATE_STOPPED, 0);
        abandonAudioFocus();

        try { stopForeground(true); } catch (Exception ignored) {}
        try {
            NotificationManager nm =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIFICATION_ID);
        } catch (Exception ignored) {}
    }

    // ============================================================
    // Notification
    // ============================================================

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "Media Playback",
                    NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Playback controls");
            ch.setShowBadge(false);
            ch.setSound(null, null);
            ch.enableVibration(false);
            ch.enableLights(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildMediaNotification() {
        boolean playing = isPlaying;

        PendingIntent playPausePi = PendingIntent.getService(
                this, 101,
                new Intent(this, MediaPlaybackService.class)
                        .setAction(playing ? ACTION_PAUSE : ACTION_PLAY),
                pendingFlags());

        PendingIntent stopPi = PendingIntent.getService(
                this, 102,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_STOP),
                pendingFlags());

        PendingIntent nextPi = PendingIntent.getService(
                this, 103,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_NEXT),
                pendingFlags());

        PendingIntent prevPi = PendingIntent.getService(
                this, 104,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_PREV),
                pendingFlags());

        PendingIntent contentPi = PendingIntent.getActivity(
                this, 0,
                new Intent(this, MainActivity.class)
                        .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP
                                | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                pendingFlags());

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setContentIntent(contentPi)
                .setDeleteIntent(stopPi)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(playing)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .addAction(android.R.drawable.ic_media_previous, "Previous", prevPi)
                .addAction(playing
                                ? android.R.drawable.ic_media_pause
                                : android.R.drawable.ic_media_play,
                        playing ? "Pause" : "Play", playPausePi)
                .addAction(android.R.drawable.ic_media_next, "Next", nextPi)
                .setStyle(new MediaStyle()
                        // ↑ THIS is what makes it appear in Quick Settings & drawer
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2));

        if (currentArtwork != null) {
            b.setLargeIcon(currentArtwork);
        }

        return b.build();
    }

    private void pushNotification() {
        try {
            Notification n = buildMediaNotification();
            NotificationManager nm =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICATION_ID, n);
        } catch (Exception e) {
            Log.e(TAG, "pushNotification failed", e);
        }
    }

    private void startForegroundMedia() {
        try {
            Notification n = buildMediaNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, n,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
        } catch (Exception e) {
            Log.e(TAG, "startForeground failed", e);
        }
    }

    private int pendingFlags() {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            f |= PendingIntent.FLAG_IMMUTABLE;
        }
        return f;
    }

    // ============================================================
    // Artwork download
    // ============================================================

    private Bitmap downloadBitmap(String urlStr) {
        HttpURLConnection conn = null;
        InputStream in = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoInput(true);
            conn.connect();
            in = conn.getInputStream();
            Bitmap bmp = BitmapFactory.decodeStream(in);

            // Downscale to a reasonable size to keep the notification light
            if (bmp != null) {
                int maxDim = 512;
                int w = bmp.getWidth();
                int h = bmp.getHeight();
                if (w > maxDim || h > maxDim) {
                    float scale = Math.min((float) maxDim / w, (float) maxDim / h);
                    bmp = Bitmap.createScaledBitmap(
                            bmp,
                            Math.round(w * scale),
                            Math.round(h * scale),
                            true);
                }
            }
            return bmp;
        } catch (Exception e) {
            return null;
        } finally {
            try { if (in  != null) in.close(); } catch (Exception ignored) {}
            if (conn != null) conn.disconnect();
        }
    }
}
