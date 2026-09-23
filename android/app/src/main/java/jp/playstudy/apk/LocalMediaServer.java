package jp.playstudy.apk;

import android.app.Activity;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Log;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Serves selected videos over real HTTP. WebView's media loader bypasses shouldInterceptRequest. */
final class LocalMediaServer {
    private static final Pattern RANGE = Pattern.compile("bytes=(\\d+)-(\\d*)");
    private final Activity activity;
    private final ServerSocket listener;
    private final ExecutorService workers = Executors.newFixedThreadPool(4);
    private final String secret = UUID.randomUUID().toString();

    LocalMediaServer(Activity activity) throws IOException {
        this.activity = activity;
        listener = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
        Thread acceptor = new Thread(() -> {
            while (!listener.isClosed()) {
                try {
                    Socket client = listener.accept();
                    workers.execute(() -> serve(client));
                } catch (IOException error) {
                    if (!listener.isClosed()) Log.w("PlayStudy", "Media server accept failed", error);
                }
            }
        }, "playstudy-media-listener");
        acceptor.setDaemon(true);
        acceptor.start();
    }

    String urlFor(String id) {
        return "http://127.0.0.1:" + listener.getLocalPort() + "/" + secret
                + "/native-media/" + Uri.encode(id);
    }

    boolean accepts(Uri uri) {
        return "http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost())
                && uri.getPort() == listener.getLocalPort()
                && uri.getPath() != null && uri.getPath().startsWith("/" + secret + "/native-media/");
    }

    void close() {
        try { listener.close(); } catch (IOException ignored) { }
        workers.shutdownNow();
    }

    private void serve(Socket socket) {
        try (Socket client = socket;
             InputStream input = new BufferedInputStream(client.getInputStream());
             OutputStream output = new BufferedOutputStream(client.getOutputStream())) {
            client.setSoTimeout(10000);
            String first = readLine(input);
            if (first == null) return;
            Log.d("PlayStudy", "Local media request " + first);
            String[] request = first.split(" ", 3);
            if (request.length < 2 || !("GET".equals(request[0]) || "HEAD".equals(request[0]))) {
                sendError(output, 405, "Method Not Allowed"); return;
            }
            Uri path = Uri.parse(request[1]);
            List<String> parts = path.getPathSegments();
            if (parts.size() != 3 || !secret.equals(parts.get(0))
                    || !"native-media".equals(parts.get(1))) {
                sendError(output, 404, "Not Found"); return;
            }
            String range = null;
            for (int index = 0; index < 64; index++) {
                String header = readLine(input);
                if (header == null || header.isEmpty()) break;
                if (header.regionMatches(true, 0, "Range:", 0, 6)) range = header.substring(6).trim();
            }
            serveMedia(output, parts.get(2), range, "HEAD".equals(request[0]));
        } catch (Exception error) {
            Log.w("PlayStudy", "Local media request failed", error);
        }
    }

    private void serveMedia(OutputStream output, String id, String range, boolean head) throws IOException {
        String source = activity.getPreferences(0).getString("media:" + id, null);
        if (source == null) { sendError(output, 404, "Not Found"); return; }
        Uri uri = Uri.parse(source);
        try (AssetFileDescriptor descriptor = activity.getContentResolver().openAssetFileDescriptor(uri, "r")) {
            if (descriptor == null) { sendError(output, 404, "Not Found"); return; }
            long length = descriptor.getLength();
            if (length < 0) {
                long stat = descriptor.getParcelFileDescriptor().getStatSize();
                if (stat >= descriptor.getStartOffset()) length = stat - descriptor.getStartOffset();
            }
            if (length < 0) {
                try (Cursor cursor = activity.getContentResolver().query(uri,
                        new String[]{OpenableColumns.SIZE}, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) length = cursor.getLong(0);
                } catch (Exception ignored) { }
            }
            long start = 0;
            long end = length >= 0 ? length - 1 : -1;
            boolean partial = range != null;
            if (partial) {
                Matcher match = RANGE.matcher(range);
                if (!match.matches() || length <= 0) {
                    sendError(output, 416, "Range Not Satisfiable"); return;
                }
                try {
                    start = Long.parseLong(match.group(1));
                    if (!match.group(2).isEmpty()) end = Math.min(end, Long.parseLong(match.group(2)));
                } catch (NumberFormatException error) {
                    sendError(output, 416, "Range Not Satisfiable"); return;
                }
                if (start >= length || end < start) {
                    sendError(output, 416, "Range Not Satisfiable"); return;
                }
            }
            String mime = activity.getContentResolver().getType(uri);
            if (mime == null || !mime.startsWith("video/")) mime = "video/mp4";
            long bodyLength = length >= 0 ? end - start + 1 : -1;
            StringBuilder headers = new StringBuilder();
            headers.append("HTTP/1.1 ").append(partial ? "206 Partial Content" : "200 OK").append("\r\n")
                    .append("Content-Type: ").append(mime).append("\r\n")
                    .append("Accept-Ranges: bytes\r\nCache-Control: no-store\r\n")
                    .append("X-Content-Type-Options: nosniff\r\nConnection: close\r\n");
            if (bodyLength >= 0) headers.append("Content-Length: ").append(bodyLength).append("\r\n");
            if (partial) headers.append("Content-Range: bytes ").append(start).append('-')
                    .append(end).append('/').append(length).append("\r\n");
            headers.append("\r\n");
            output.write(headers.toString().getBytes(StandardCharsets.US_ASCII));
            Log.d("PlayStudy", "Local media response " + (partial ? 206 : 200)
                    + " length=" + length + " range=" + range);
            if (!head) {
                try (InputStream media = new FileInputStream(descriptor.getFileDescriptor())) {
                    long skip = descriptor.getStartOffset() + start;
                    while (skip > 0) {
                        long skipped = media.skip(skip);
                        if (skipped <= 0) {
                            if (media.read() == -1) throw new IOException("Video ended before requested range");
                            skipped = 1;
                        }
                        skip -= skipped;
                    }
                    byte[] buffer = new byte[64 * 1024];
                    long left = bodyLength;
                    while (left != 0) {
                        int count = media.read(buffer, 0, left < 0 ? buffer.length : (int) Math.min(left, buffer.length));
                        if (count < 0) break;
                        output.write(buffer, 0, count);
                        if (left > 0) left -= count;
                    }
                }
            }
            output.flush();
        } catch (SecurityException error) {
            sendError(output, 403, "Forbidden");
        }
    }

    private static String readLine(InputStream input) throws IOException {
        StringBuilder line = new StringBuilder();
        while (line.length() < 8192) {
            int ch = input.read();
            if (ch < 0) return line.length() == 0 ? null : line.toString();
            if (ch == '\n') return line.toString();
            if (ch != '\r') line.append((char) ch);
        }
        throw new IOException("HTTP header too long");
    }

    private static void sendError(OutputStream output, int status, String reason) throws IOException {
        String response = String.format(Locale.US,
                "HTTP/1.1 %d %s\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", status, reason);
        output.write(response.getBytes(StandardCharsets.US_ASCII));
        output.flush();
    }
}
