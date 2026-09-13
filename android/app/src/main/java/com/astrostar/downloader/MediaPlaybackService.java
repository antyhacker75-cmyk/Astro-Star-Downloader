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

public class MediaPlaybackService extends Service {

    private static final String TAG = "MediaPlaybackService";
    private static final String CHANNEL_ID = "astrostar_playback_channel";
    private static final int NOTIFICATION_ID = 2001;

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

    private MediaPlayer mediaPlayer;
    private MediaSessionCompat mediaSession;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService artworkLoader = Executors.newSingleThreadExecutor();

    private String  currentUrl     = null;
    private String  currentTitle   = "Astro Star";
    private String  currentArtist  = "Unknown";
    private String  currentArtworkUrl = null;
    private Bitmap  currentArtwork = null;

    private boolean isPrepared = false;
    private boolean isPlaying  = false;

    private final Runnable positionUpdater = new Runnable() {
        @Override public void run() {
            if (mediaPlayer != null && isPlaying) {
                try {
                    long pos = mediaPlayer.getCurrentPosition();
                    updatePlaybackState(PlaybackStateCompat.STATE_PLAYING, pos);
                } catch (Exception ignored) {}
                handler.postDelayed(this, 1000);
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
            String action = (intent != null && intent.getAction() != null)
                    ? intent.getAction() : "";

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
                    if (intent.hasExtra(EXTRA_SEEK)) {
                        int ms = intent.getIntExtra(EXTRA_SEEK, -1);
                        if (ms >= 0) { seekTo(ms); break; }
                    }
                    play();
                    break;
                }
                case ACTION_PAUSE:
                    pause();
                    break;
                case ACTION_STOP:
                    stopPlayback();
                    stopSelf();
                    break;
                case ACTION_NEXT:
                case ACTION_PREV:
                    // hook into your queue here
                    break;
            }
        } catch (Exception e) {
            Log.e(TAG, "onStartCommand error", e);
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(positionUpdater);
        if (mediaPlayer != null) {
            try { mediaPlayer.release(); } catch (Exception ignored) {}
            mediaPlayer = null;
        }
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
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
    // MediaSession — the piece that makes the drawer appear
    // ============================================================

    private void setupMediaSession() {
        mediaSession = new MediaSessionCompat(this, "AstroStarPlayback");
        mediaSession.setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);

        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay()        { play(); }
            @Override public void onPause()       { pause(); }
            @Override public void onStop()        { stopPlayback(); }
            @Override public void onSkipToNext()  { /* queue */ }
            @Override public void onSkipToPrevious() { /* queue */ }
            @Override public void onSeekTo(long pos) { seekTo((int) pos); }
        });

        mediaSession.setActive(true);
    }

    private void updateMetadata() {
        if (mediaSession == null) return;

        MediaMetadataCompat.Builder b = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, currentArtist)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION,
                        mediaPlayer != null && isPrepared
                                ? mediaPlayer.getDuration() : 0);

        if (currentArtwork != null) {
            b.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, currentArtwork);
            b.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, currentArtwork);
        }

        mediaSession.setMetadata(b.build());
    }

    private void updatePlaybackState(int state, long position) {
        if (mediaSession == null) return;

        long actions = PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_PLAY
                | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_STOP
                | PlaybackStateCompat.ACTION_SEEK_TO
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS;

        PlaybackStateCompat.Builder pb = new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, position, isPlaying ? 1.0f : 0.0f);

        mediaSession.setPlaybackState(pb.build());
    }

    private void updatePlaybackState(int state) {
        long pos = 0;
        try { if (mediaPlayer != null) pos = mediaPlayer.getCurrentPosition(); }
        catch (Exception ignored) {}
        updatePlaybackState(state, pos);
    }

    // ============================================================
    // Audio focus
    // ============================================================

    private void setupAudioFocus() {
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attrs)
                    .setOnAudioFocusChangeListener(focusChange -> {
                        if (focusChange == AudioManager.AUDIOFOCUS_LOSS) pause();
                        else if (focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) pause();
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
            result = audioManager.requestAudioFocus(null,
                    AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        } else {
            audioManager.abandonAudioFocus(null);
        }
    }

    // ============================================================
    // Playback
    // ============================================================

    private void loadTrack(String url, String title, String artist, String artwork) {
        if (url == null || url.isEmpty()) return;

        currentUrl        = url;
        currentTitle      = title   != null ? title   : "Astro Star";
        currentArtist     = artist  != null ? artist  : "Unknown";
        currentArtworkUrl = artwork;
        currentArtwork    = null;

        // Load artwork in background
        if (artwork != null && !artwork.isEmpty()) {
            artworkLoader.execute(() -> {
                Bitmap bmp = downloadBitmap(artwork);
                if (bmp != null) {
                    currentArtwork = bmp;
                    handler.post(() -> {
                        updateMetadata();
                        if (isPrepared) pushNotification();
                    });
                }
            });
        }

        // Kill previous player
        if (mediaPlayer != null) {
            try { mediaPlayer.release(); } catch (Exception ignored) {}
            mediaPlayer = null;
        }

        isPrepared = false;
        isPlaying = false;

        updateMetadata();
        updatePlaybackState(PlaybackStateCompat.STATE_BUFFERING, 0);
        pushNotification();
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
                updateMetadata();
                play();
            });
            mediaPlayer.setOnCompletionListener(mp -> {
                isPlaying = false;
                updatePlaybackState(PlaybackStateCompat.STATE_STOPPED);
                pushNotification();
            });
            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                isPlaying = false;
                isPrepared = false;
                updatePlaybackState(PlaybackStateCompat.STATE_ERROR);
                pushNotification();
                return true;
            });
            mediaPlayer.prepareAsync();
        } catch (Exception e) {
            Log.e(TAG, "loadTrack failed", e);
        }
    }

    private void play() {
        if (mediaPlayer == null) return;
        if (!requestAudioFocus()) return;
        try {
            mediaPlayer.start();
            isPlaying = true;
            updatePlaybackState(PlaybackStateCompat.STATE_PLAYING);
            pushNotification();
            handler.removeCallbacks(positionUpdater);
            handler.post(positionUpdater);
        } catch (Exception e) {
            Log.e(TAG, "play failed", e);
        }
    }

    private void pause() {
        if (mediaPlayer == null) return;
        try {
            if (mediaPlayer.isPlaying()) mediaPlayer.pause();
            isPlaying = false;
            updatePlaybackState(PlaybackStateCompat.STATE_PAUSED);
            pushNotification();
            handler.removeCallbacks(positionUpdater);
        } catch (Exception e) {
            Log.e(TAG, "pause failed", e);
        }
    }

    private void stopPlayback() {
        if (mediaPlayer != null) {
            try {
                mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }
        isPlaying = false;
        isPrepared = false;
        updatePlaybackState(PlaybackStateCompat.STATE_STOPPED);
        abandonAudioFocus();
        handler.removeCallbacks(positionUpdater);
        stopForeground(true);
    }

    private void seekTo(int ms) {
        if (mediaPlayer == null) return;
        try {
            mediaPlayer.seekTo(ms);
            updatePlaybackState(isPlaying
                    ? PlaybackStateCompat.STATE_PLAYING
                    : PlaybackStateCompat.STATE_PAUSED, ms);
        } catch (Exception ignored) {}
    }

    // ============================================================
    // Notification — MediaStyle is what makes it appear in the drawer
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
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildMediaNotification() {
        int playPauseIcon = isPlaying
                ? android.R.drawable.ic_media_pause
                : android.R.drawable.ic_media_play;
        String playPauseLabel = isPlaying ? "Pause" : "Play";

        PendingIntent playPausePi = PendingIntent.getService(
                this, 1,
                new Intent(this, MediaPlaybackService.class)
                        .setAction(isPlaying ? ACTION_PAUSE : ACTION_PLAY),
                pendingFlags());
        PendingIntent stopPi = PendingIntent.getService(
                this, 2,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_STOP),
                pendingFlags());
        PendingIntent nextPi = PendingIntent.getService(
                this, 3,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_NEXT),
                pendingFlags());
        PendingIntent prevPi = PendingIntent.getService(
                this, 4,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_PREV),
                pendingFlags());

        PendingIntent contentPi = PendingIntent.getActivity(
                this, 0,
                new Intent(this, MainActivity.class)
                        .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                pendingFlags());

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setContentIntent(contentPi)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(isPlaying)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .addAction(android.R.drawable.ic_media_previous, "Previous", prevPi)
                .addAction(playPauseIcon, playPauseLabel, playPausePi)
                .addAction(android.R.drawable.ic_media_next, "Next", nextPi)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Close", stopPi)
                .setStyle(new MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2));

        if (currentArtwork != null) b.setLargeIcon(currentArtwork);

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
        try {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoInput(true);
            conn.connect();
            InputStream in = conn.getInputStream();
            Bitmap bmp = BitmapFactory.decodeStream(in);
            in.close();
            conn.disconnect();
            return bmp;
        } catch (Exception e) {
            return null;
        }
    }
}
