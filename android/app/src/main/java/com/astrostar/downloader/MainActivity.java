package com.astrostar.downloader;

import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.UUID;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "AstroStarLicense";
    private static final int REQ_STORAGE = 1001;
    private static final int REQ_NOTIFICATIONS = 101;

    private static MainActivity instance;

    public static MainActivity getInstance() {
        return instance;
    }

    private static final String LICENSE_URL = "https://bitch.x10.mx/adminmusic.php";

    private AlertDialog licenseDialog;

    // ============================================================
    // JAVASCRIPT BRIDGE
    // ============================================================

    public class AstroStarMainBridge {

        @JavascriptInterface
        public void loadMedia(String url, String title, String artist, String artwork) {
            try {
                Intent intent = new Intent(MainActivity.this, MediaPlaybackService.class);
                intent.setAction(MediaPlaybackService.ACTION_LOAD);
                intent.putExtra(MediaPlaybackService.EXTRA_URL, url);
                intent.putExtra(MediaPlaybackService.EXTRA_TITLE, title);
                intent.putExtra(MediaPlaybackService.EXTRA_ARTIST, artist);
                intent.putExtra(MediaPlaybackService.EXTRA_ARTWORK, artwork);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(intent);
                } else {
                    startService(intent);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void playMedia() {
            try {
                Intent i = new Intent(MainActivity.this, MediaPlaybackService.class);
                i.setAction(MediaPlaybackService.ACTION_PLAY);
                startService(i);
            } catch (Exception e) { e.printStackTrace(); }
        }

        @JavascriptInterface
        public void pauseMedia() {
            try {
                Intent i = new Intent(MainActivity.this, MediaPlaybackService.class);
                i.setAction(MediaPlaybackService.ACTION_PAUSE);
                startService(i);
            } catch (Exception e) { e.printStackTrace(); }
        }

        @JavascriptInterface
        public void stopMedia() {
            try {
                Intent i = new Intent(MainActivity.this, MediaPlaybackService.class);
                i.setAction(MediaPlaybackService.ACTION_STOP);
                startService(i);
            } catch (Exception e) { e.printStackTrace(); }
        }

        @JavascriptInterface
        public void seekMedia(int positionMs) {
            try {
                Intent i = new Intent(MainActivity.this, MediaPlaybackService.class);
                i.setAction(MediaPlaybackService.ACTION_PLAY);
                i.putExtra("seek", positionMs);
                startService(i);
            } catch (Exception e) { e.printStackTrace(); }
        }

        @JavascriptInterface
        public String getPendingHistoryList() {
            try {
                SharedPreferences prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
                return prefs.getString("astrostar_pending_share_history_list", "[]");
            } catch (Exception e) {
                return "[]";
            }
        }

        @JavascriptInterface
        public void clearPendingHistoryList() {
            try {
                SharedPreferences prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
                prefs.edit().remove("astrostar_pending_share_history_list").commit();
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void saveSetting(String key, String value) {
            try {
                if (key == null || value == null) return;
                SharedPreferences prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
                prefs.edit().putString(key, value).commit();
            } catch (Exception ignored) {}
        }

        // ========================================================
        // DOWNLOAD FOREGROUND SERVICE
        // ========================================================

        @JavascriptInterface
        public void startDownloadService(String title) {
            try {
                Intent intent = new Intent(MainActivity.this, DownloadForegroundService.class);
                intent.setAction(DownloadForegroundService.ACTION_START);
                intent.putExtra(DownloadForegroundService.EXTRA_TITLE,
                        title != null ? title : "Downloading Media...");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(intent);
                } else {
                    startService(intent);
                }
            } catch (Exception e) { e.printStackTrace(); }
        }

        /**
         * Called from JS on every progress tick.
         * This is what updates the progress bar and % in the notification.
         */
        @JavascriptInterface
        public void updateDownloadProgress(long downloaded, long total, String speed) {
            try {
                DownloadForegroundService.pushProgress(
                        MainActivity.this, downloaded, total, speed);
            } catch (Exception e) { e.printStackTrace(); }
        }

        @JavascriptInterface
        public void stopDownloadService() {
            try {
                Intent i = new Intent(MainActivity.this, DownloadForegroundService.class);
                i.setAction(DownloadForegroundService.ACTION_STOP);
                startService(i);
            } catch (Exception e) { e.printStackTrace(); }
        }

        @JavascriptInterface
        public void showCompleteNotification(String title, String path) {
            try {
                android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    android.app.NotificationChannel ch = new android.app.NotificationChannel(
                            "astrostar_download_complete",
                            "AstroStar Downloads",
                            android.app.NotificationManager.IMPORTANCE_DEFAULT
                    );
                    nm.createNotificationChannel(ch);
                }
                androidx.core.app.NotificationCompat.Builder b =
                        new androidx.core.app.NotificationCompat.Builder(MainActivity.this, "astrostar_download_complete")
                        .setSmallIcon(android.R.drawable.stat_sys_download_done)
                        .setContentTitle("Download Complete")
                        .setContentText((title != null ? title : "Media") + (path != null ? " · " + path : ""))
                        .setPriority(androidx.core.app.NotificationCompat.PRIORITY_DEFAULT)
                        .setAutoCancel(true);
                nm.notify((int) System.currentTimeMillis(), b.build());
            } catch (Exception e) { e.printStackTrace(); }
        }

        @JavascriptInterface
        public void showFailedNotification(String title, String error) {
            try {
                android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    android.app.NotificationChannel ch = new android.app.NotificationChannel(
                            "astrostar_download_complete",
                            "AstroStar Downloads",
                            android.app.NotificationManager.IMPORTANCE_DEFAULT
                    );
                    nm.createNotificationChannel(ch);
                }
                androidx.core.app.NotificationCompat.Builder b =
                        new androidx.core.app.NotificationCompat.Builder(MainActivity.this, "astrostar_download_complete")
                        .setSmallIcon(android.R.drawable.stat_notify_error)
                        .setContentTitle("Download Failed")
                        .setContentText((title != null ? title : "Media") + ": " + (error != null ? error : "Failed"))
                        .setPriority(androidx.core.app.NotificationCompat.PRIORITY_DEFAULT)
                        .setAutoCancel(true);
                nm.notify((int) System.currentTimeMillis(), b.build());
            } catch (Exception e) { e.printStackTrace(); }
        }
    }

    // ============================================================
    // LIFECYCLE
    // ============================================================

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        instance = this;

        WebView webView = getBridge().getWebView();

        if (webView != null) {
            webView.addJavascriptInterface(new AstroStarMainBridge(), "AstroStarMainBridge");

            WebSettings settings = webView.getSettings();
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(true);
            settings.setMediaPlaybackRequiresUserGesture(false);

            webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    String url = request.getUrl().toString();
                    if (url.startsWith("whatsapp://") || url.contains("wa.me") || url.contains("api.whatsapp.com")) {
                        try {
                            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                            startActivity(intent);
                            return true;
                        } catch (Exception e) {
                            return super.shouldOverrideUrlLoading(view, request);
                        }
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, String url) {
                    if (url != null && (url.startsWith("whatsapp://") || url.contains("wa.me") || url.contains("api.whatsapp.com"))) {
                        try {
                            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                            startActivity(intent);
                            return true;
                        } catch (Exception e) {
                            return super.shouldOverrideUrlLoading(view, url);
                        }
                    }
                    return super.shouldOverrideUrlLoading(view, url);
                }
            });
        }

        handleIntent(getIntent());
        requestNotificationPermission();
        requestStoragePermissions();
        checkLicense();
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override
    public void onResume() {
        super.onResume();

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().postDelayed(new Runnable() {
                @Override
                public void run() {
                    getBridge().getWebView().evaluateJavascript(
                            "if (typeof window.checkAndMergePendingHistory === 'function') window.checkAndMergePendingHistory();",
                            null
                    );
                }
            }, 300);
        }
    }

    // ============================================================
    // STORAGE PERMISSIONS
    // ============================================================

    private void requestStoragePermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (!Environment.isExternalStorageManager()) {
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                } catch (Exception e) {
                    try {
                        Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                        startActivity(intent);
                    } catch (Exception e2) {
                        Log.w(TAG, "Could not open storage settings: " + e2.getMessage());
                    }
                }
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                        this,
                        new String[]{
                                android.Manifest.permission.READ_EXTERNAL_STORAGE,
                                android.Manifest.permission.WRITE_EXTERNAL_STORAGE
                        },
                        REQ_STORAGE
                );
            }
        }
    }

    // ============================================================
    // NOTIFICATION PERMISSION
    // ============================================================

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
            }
        }
    }

    // ============================================================
    // LICENSE CHECK
    // ============================================================

    private String getAstroStarDeviceId() {
        SharedPreferences prefs = getSharedPreferences("astrostar_device", MODE_PRIVATE);
        String id = prefs.getString("device_id", null);
        if (id == null) {
            id = UUID.randomUUID().toString();
            prefs.edit().putString("device_id", id).apply();
        }
        return id;
    }

    private void checkLicense() {
        final String packageName = getPackageName();
        final String appName = getString(R.string.app_name);
        final String deviceId = getAstroStarDeviceId();

        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    String url = LICENSE_URL
                            + "?action=check"
                            + "&package_name=" + URLEncoder.encode(packageName, "UTF-8")
                            + "&device_id=" + URLEncoder.encode(deviceId, "UTF-8")
                            + "&app_name=" + URLEncoder.encode(appName, "UTF-8");

                    conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);
                    conn.setRequestMethod("GET");

                    int code = conn.getResponseCode();
                    if (code != 200) throw new Exception("HTTP " + code);

                    BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                    br.close();

                    JSONObject json = new JSONObject(sb.toString());
                    final boolean allowed = json.optBoolean("allowed", true);
                    final String status = json.optString("status", "");
                    final String message = json.optString("message", "");
                    final String ownerTg = json.optString("owner_telegram", "");

                    if (!allowed) {
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                showLicenseDialog(status, message, ownerTg);
                            }
                        });
                    }
                } catch (Exception e) {
                    Log.w(TAG, "License check failed (fail-open): " + e.getMessage());
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
        }).start();
    }

    // ============================================================
    // LICENSE DIALOG
    // ============================================================

    private void showLicenseDialog(String status, String message, String ownerTg) {
        if (isFinishing() || licenseDialog != null) return;

        String titleText;
        int accentColor;
        String iconChar;

        if ("banned".equals(status)) {
            titleText = "Access Banned";
            accentColor = Color.parseColor("#ef4444");
            iconChar = "✕";
        } else if ("expired".equals(status)) {
            titleText = "License Expired";
            accentColor = Color.parseColor("#f97316");
            iconChar = "⏱";
        } else if ("maintenance".equals(status)) {
            titleText = "Under Maintenance";
            accentColor = Color.parseColor("#facc15");
            iconChar = "⚙";
        } else if ("pending".equals(status)) {
            titleText = "Approval Pending";
            accentColor = Color.parseColor("#a855f7");
            iconChar = "";
        } else {
            titleText = "Access Denied";
            accentColor = Color.parseColor("#ef4444");
            iconChar = "✕";
        }

        final String finalOwnerTg = ownerTg;
        final String finalPackageName = getPackageName();
        final String finalAppName = getString(R.string.app_name);
        final String finalDeviceId = getAstroStarDeviceId();

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(24), dp(28), dp(24), dp(20));

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#0e0e11"));
        bg.setCornerRadius(dp(22));
        bg.setStroke(dp(1), Color.parseColor("#1f1f24"));
        root.setBackground(bg);

        TextView iconView = new TextView(this);
        GradientDrawable iconBg = new GradientDrawable();
        iconBg.setShape(GradientDrawable.OVAL);
        iconBg.setColor(Color.parseColor("#1a1a1f"));
        iconBg.setStroke(dp(2), accentColor);
        iconView.setBackground(iconBg);
        iconView.setText(iconChar);
        iconView.setTextColor(accentColor);
        iconView.setTextSize(28);
        iconView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(dp(64), dp(64));
        iconLp.gravity = Gravity.CENTER_HORIZONTAL;
        iconView.setLayoutParams(iconLp);
        root.addView(iconView);

        TextView title = new TextView(this);
        title.setText(titleText);
        title.setTextColor(Color.WHITE);
        title.setTextSize(20);
        title.setTypeface(null, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        titleLp.topMargin = dp(18);
        title.setLayoutParams(titleLp);
        root.addView(title);

        TextView msgView = new TextView(this);
        msgView.setText(message);
        msgView.setTextColor(Color.parseColor("#a1a1aa"));
        msgView.setTextSize(14);
        msgView.setGravity(Gravity.CENTER);
        msgView.setLineSpacing(dp(4), 1f);
        LinearLayout.LayoutParams msgLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        msgLp.topMargin = dp(10);
        msgView.setLayoutParams(msgLp);
        root.addView(msgView);

        TextView infoView = new TextView(this);
        infoView.setText("Package: " + finalPackageName + "\nDevice: " + finalDeviceId.substring(0, Math.min(16, finalDeviceId.length())) + "…");
        infoView.setTextColor(Color.parseColor("#52525b"));
        infoView.setTextSize(11);
        infoView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams infoLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        infoLp.topMargin = dp(14);
        infoView.setLayoutParams(infoLp);
        root.addView(infoView);

        if ("pending".equals(status) || status.isEmpty() || "error".equals(status)) {
            Button reqBtn = new Button(this);
            reqBtn.setText("Request Access");
            reqBtn.setTextColor(Color.WHITE);
            reqBtn.setTextSize(14);
            reqBtn.setAllCaps(false);
            reqBtn.setTypeface(null, Typeface.BOLD);
            GradientDrawable reqBg = new GradientDrawable();
            reqBg.setColor(Color.parseColor("#5b4dff"));
            reqBg.setCornerRadius(dp(12));
            reqBtn.setBackground(reqBg);
            LinearLayout.LayoutParams reqLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    dp(48)
            );
            reqLp.topMargin = dp(22);
            reqBtn.setLayoutParams(reqLp);
            reqBtn.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    try {
                        String url = LICENSE_URL
                                + "?action=request_form"
                                + "&package_name=" + URLEncoder.encode(finalPackageName, "UTF-8")
                                + "&device_id=" + URLEncoder.encode(finalDeviceId, "UTF-8")
                                + "&app_name=" + URLEncoder.encode(finalAppName, "UTF-8");
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "Cannot open browser", Toast.LENGTH_SHORT).show();
                    }
                }
            });
            root.addView(reqBtn);
        }

        if (finalOwnerTg != null && !finalOwnerTg.isEmpty()) {
            Button tgBtn = new Button(this);
            tgBtn.setText("Contact Owner on Telegram");
            tgBtn.setTextColor(Color.parseColor("#a855f7"));
            tgBtn.setTextSize(13);
            tgBtn.setAllCaps(false);
            GradientDrawable tgBg = new GradientDrawable();
            tgBg.setColor(Color.parseColor("#1a1a1f"));
            tgBg.setCornerRadius(dp(12));
            tgBg.setStroke(dp(1), Color.parseColor("#2a2a30"));
            tgBtn.setBackground(tgBg);
            LinearLayout.LayoutParams tgLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    dp(46)
            );
            tgLp.topMargin = dp(10);
            tgBtn.setLayoutParams(tgLp);
            tgBtn.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    try {
                        String handle = finalOwnerTg.startsWith("@") ? finalOwnerTg.substring(1) : finalOwnerTg;
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://t.me/" + handle)));
                    } catch (Exception e) {}
                }
            });
            root.addView(tgBtn);
        }

        Button closeBtn = new Button(this);
        closeBtn.setText("Close App");
        closeBtn.setTextColor(Color.parseColor("#a1a1aa"));
        closeBtn.setTextSize(13);
        closeBtn.setAllCaps(false);
        GradientDrawable closeBg = new GradientDrawable();
        closeBg.setColor(Color.TRANSPARENT);
        closeBtn.setBackground(closeBg);
        LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(42)
        );
        closeLp.topMargin = dp(6);
        closeBtn.setLayoutParams(closeLp);
        closeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (licenseDialog != null) licenseDialog.dismiss();
                finishAffinity();
                System.exit(0);
            }
        });
        root.addView(closeBtn);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);

        licenseDialog = new AlertDialog.Builder(this)
                .setView(scroll)
                .setCancelable(false)
                .create();

        if (licenseDialog.getWindow() != null) {
            licenseDialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        }
        licenseDialog.show();
    }

    // ============================================================
    // UTILITIES
    // ============================================================

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density);
    }

    private void handleIntent(Intent intent) {
        String action = intent.getAction();
        String type = intent.getType();

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            if ("text/plain".equals(type)) {
                String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (sharedText != null) {
                    final String escapedText = sharedText
                            .replace("'", "\\'")
                            .replace("\"", "\\\"")
                            .replace("\n", " ");

                    getBridge().getWebView().postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            getBridge().getWebView().evaluateJavascript(
                                    "window.astroStarShareText = '" + escapedText + "';",
                                    null
                            );
                            getBridge().triggerWindowJSEvent("astroStarShareIntent", "{ \"text\": \"" + escapedText + "\" }");
                        }
                    }, 1000);
                }
            }
        }
    }
}
