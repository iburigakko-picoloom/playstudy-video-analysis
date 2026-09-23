package jp.playstudy.apk;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.res.AssetFileDescriptor;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.FileInputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ORIGIN = "https://" + HOST;
    private static final int PICK_VIDEO = 1001;
    private static final int PICK_WEB_FILE = 1002;
    private static final Pattern RANGE = Pattern.compile("bytes=(\\d+)-(\\d*)");
    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private ValueCallback<Uri[]> webFileCallback;
    private String pendingRelinkId = "";
    private final ExecutorService metadataExecutor = Executors.newSingleThreadExecutor();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        // Only previously selected content URIs are allowed by shouldInterceptRequest.
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.addJavascriptInterface(new NativeBridge(), "PlayStudyNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("content".equals(url.getScheme())
                        && getPreferences(MODE_PRIVATE).getAll().containsValue(url.toString())) return null;
                if (!"https".equals(url.getScheme()) || !HOST.equals(url.getHost())) {
                    if ("blob".equals(url.getScheme()) || "data".equals(url.getScheme())) return null;
                    return errorResponse(403);
                }
                String path = url.getPath();
                if (path != null && path.startsWith("/native-media/")) {
                    String range = null;
                    for (Map.Entry<String, String> header : request.getRequestHeaders().entrySet()) {
                        if ("range".equalsIgnoreCase(header.getKey())) range = header.getValue();
                    }
                    return mediaResponse(path.substring("/native-media/".length()), range);
                }
                WebResourceResponse response = assetLoader.shouldInterceptRequest(url);
                return response != null ? response : errorResponse(404);
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("https".equals(url.getScheme()) && HOST.equals(url.getHost())) return false;
                if (request.isForMainFrame() && ("https".equals(url.getScheme()) || "http".equals(url.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (Exception ignored) { }
                }
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (webFileCallback != null) webFileCallback.onReceiveValue(null);
                webFileCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    startActivityForResult(intent, PICK_WEB_FILE);
                } catch (Exception error) {
                    webFileCallback = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }
        });
        setContentView(webView);
        webView.loadUrl(ORIGIN + "/playstudy/index.html");
    }

    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
    }

    @Override public void onBackPressed() {
        webView.evaluateJavascript("(function(){const d=document.querySelector('dialog[open]');if(d){d.close();return 'handled'}if(state.screen==='researchDetail'){route('research');return 'handled'}if(state.screen!=='library'){route('library');return 'handled'}return 'exit'})()",
                result -> { if ("\"exit\"".equals(result)) finish(); });
    }

    @Override protected void onDestroy() {
        metadataExecutor.shutdownNow();
        webView.removeJavascriptInterface("PlayStudyNative");
        webView.destroy();
        super.onDestroy();
    }

    private final class NativeBridge {
        @JavascriptInterface public void pickVideos(String relinkId) {
            runOnUiThread(() -> {
                pendingRelinkId = relinkId == null ? "" : relinkId;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("video/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, pendingRelinkId.isEmpty());
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try { startActivityForResult(intent, PICK_VIDEO); }
                catch (Exception error) { pendingRelinkId = ""; }
            });
        }

        @JavascriptInterface public String mediaUrl(String id) {
            return ORIGIN + "/native-media/" + Uri.encode(id);
        }

        @JavascriptInterface public String contentUrl(String id) {
            String uri = getPreferences(MODE_PRIVATE).getString("media:" + id, null);
            return uri == null ? "" : uri;
        }

        @JavascriptInterface public void setPlayerOrientation(boolean player) {
            runOnUiThread(() -> setRequestedOrientation(player
                    ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED));
        }

        @JavascriptInterface public boolean hasMedia(String id) {
            String uri = getPreferences(MODE_PRIVATE).getString("media:" + id, null);
            if (uri == null) return false;
            try {
                getContentResolver().openAssetFileDescriptor(Uri.parse(uri), "r").close();
                return true;
            } catch (Exception error) {
                return false;
            }
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_WEB_FILE) {
            if (webFileCallback != null) {
                webFileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                webFileCallback = null;
            }
            return;
        }
        if (requestCode != PICK_VIDEO) return;
        final String relinkId = pendingRelinkId;
        pendingRelinkId = "";
        if (resultCode != RESULT_OK || data == null) return;
        JSONArray items = new JSONArray();
        if (data.getClipData() != null) {
            for (int index = 0; index < data.getClipData().getItemCount(); index++) {
                addPickedVideo(items, data.getClipData().getItemAt(index).getUri(), relinkId);
                if (!relinkId.isEmpty()) break;
            }
        } else if (data.getData() != null) {
            addPickedVideo(items, data.getData(), relinkId);
        }
        if (items.length() > 0) {
            webView.evaluateJavascript("window.playStudyNativeFilesSelected(" + items + "," + JSONObject.quote(relinkId) + ")", result -> {
                for (int index = 0; index < items.length(); index++) {
                    JSONObject item = items.optJSONObject(index);
                    if (item == null) continue;
                    String id = item.optString("id");
                    String uri = getPreferences(MODE_PRIVATE).getString("media:" + id, null);
                    if (uri != null) metadataExecutor.execute(() -> loadVideoMetadata(id, Uri.parse(uri)));
                }
            });
        } else {
            webView.evaluateJavascript("toast('動画を参照できません。ファイルアプリから選んでください')", null);
        }
    }

    private void loadVideoMetadata(String id, Uri uri) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        JSONObject result = new JSONObject();
        try {
            result.put("id", id);
            retriever.setDataSource(this, uri);
            String duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            if (duration != null) result.put("durationSeconds", Long.parseLong(duration) / 1000.0);
            Bitmap frame;
            if (android.os.Build.VERSION.SDK_INT >= 27) {
                int width = 480;
                String w = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH);
                String h = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT);
                int height = 270;
                if (w != null && h != null && Integer.parseInt(w) > 0) {
                    height = Math.max(1, Math.round(480f * Integer.parseInt(h) / Integer.parseInt(w)));
                }
                frame = retriever.getScaledFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, width, height);
            } else {
                frame = retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            }
            if (frame != null) {
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                frame.compress(Bitmap.CompressFormat.JPEG, 70, output);
                frame.recycle();
                result.put("poster", "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
            }
        } catch (Exception error) {
            android.util.Log.w("PlayStudy", "Could not read video metadata", error);
        } finally {
            try { retriever.release(); } catch (Exception ignored) { }
        }
        runOnUiThread(() -> {
            if (!isFinishing() && !isDestroyed()) {
                webView.evaluateJavascript("window.playStudyNativeMetadata?.(" + result + ")", null);
            }
        });
    }

    private void addPickedVideo(JSONArray items, Uri uri, String relinkId) {
        try {
            getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            String id = relinkId.isEmpty() ? "v-" + UUID.randomUUID() : relinkId;
            String name = "動画";
            String type = getContentResolver().getType(uri);
            try (Cursor cursor = getContentResolver().query(uri,
                    new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0);
            }
            getPreferences(MODE_PRIVATE).edit().putString("media:" + id, uri.toString()).apply();
            JSONObject item = new JSONObject();
            item.put("id", id);
            item.put("name", name == null ? "動画" : name);
            item.put("type", type == null ? "video/mp4" : type);
            items.put(item);
        } catch (Exception ignored) {
            // Do not add a video when the permission cannot survive an app restart.
        }
    }

    private WebResourceResponse mediaResponse(String id, String rangeHeader) {
        String rawUri = getPreferences(MODE_PRIVATE).getString("media:" + id, null);
        if (rawUri == null) return errorResponse(404);
        try {
            Uri uri = Uri.parse(rawUri);
            AssetFileDescriptor descriptor = getContentResolver().openAssetFileDescriptor(uri, "r");
            if (descriptor == null) return errorResponse(404);
            long length = descriptor.getLength();
            if (length < 0) {
                try (Cursor cursor = getContentResolver().query(uri,
                        new String[]{OpenableColumns.SIZE}, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) length = cursor.getLong(0);
                }
            }
            long start = 0;
            long end = length > 0 ? length - 1 : -1;
            boolean partial = rangeHeader != null;
            if (partial) {
                Matcher match = RANGE.matcher(rangeHeader.trim());
                if (!match.matches() || length <= 0) { descriptor.close(); return errorResponse(416); }
                start = Long.parseLong(match.group(1));
                if (!match.group(2).isEmpty()) end = Math.min(end, Long.parseLong(match.group(2)));
                if (start >= length || end < start) { descriptor.close(); return errorResponse(416); }
            }
            InputStream input = new FileInputStream(descriptor.getFileDescriptor());
            long skip = descriptor.getStartOffset() + start;
            while (skip > 0) {
                long skipped = input.skip(skip);
                if (skipped <= 0) {
                    if (input.read() == -1) throw new IOException("Unable to seek to video range");
                    skipped = 1;
                }
                skip -= skipped;
            }
            long remaining = length > 0 ? end - start + 1 : Long.MAX_VALUE;
            InputStream stream = new FilterInputStream(input) {
                long left = remaining;
                @Override public int read() throws IOException {
                    if (left <= 0) return -1;
                    int result = super.read();
                    if (result >= 0) left--;
                    return result;
                }
                @Override public int read(byte[] buffer, int offset, int count) throws IOException {
                    if (left <= 0) return -1;
                    int result = super.read(buffer, offset, (int) Math.min(count, left));
                    if (result > 0) left -= result;
                    return result;
                }
                @Override public void close() throws IOException {
                    try { super.close(); } finally { descriptor.close(); }
                }
            };
            Map<String, String> headers = new HashMap<>();
            headers.put("Accept-Ranges", "bytes");
            headers.put("Cache-Control", "no-store");
            if (length > 0) headers.put("Content-Length", String.valueOf(remaining));
            if (partial) headers.put("Content-Range", "bytes " + start + "-" + end + "/" + length);
            String mime = getContentResolver().getType(uri);
            headers.put("Content-Type", mime == null ? "video/mp4" : mime);
            return new WebResourceResponse(mime == null ? "video/mp4" : mime, null,
                    partial ? 206 : 200, partial ? "Partial Content" : "OK", headers, stream);
        } catch (Exception error) {
            return errorResponse(404);
        }
    }

    private static WebResourceResponse errorResponse(int code) {
        return new WebResourceResponse("text/plain", "UTF-8", code,
                code == 416 ? "Range Not Satisfiable" : code == 403 ? "Forbidden" : "Not Found",
                new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }
}
